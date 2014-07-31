var expect = require('chai').expect,
    moment = require('moment'),
    sinon = require('sinon'),
    async = require('async'),
    _ = require('lodash'),
    testHelper = require('../helper');

describe('Jobs', function() {
  var dbs = [];
  var jobs;
  beforeEach(function(done) {
    async.times(2, testHelper.connectToDB, function(err, results) {
      if (err) return done(err);
      dbs = results;
      jobs = require('../../lib/jobs')({ db: process.env.DATABASE_URL });
      jobsModelTest = require('../../models/jobs_test');
      done();
    });
  });

  afterEach(function() {
    // Apparently this should not be called:
    // https://github.com/brianc/node-postgres/wiki/Client#wiki-method-end
    // _.invoke(dbs, 'end');
  });

  function lockJob(db, jobId, callback) {
    // Note: In this test we use the job_snapshot id not the job_id as
    // that is how the locking is done in the query that grabs the next
    // job.
    // This only locks one row (not all the snapshots for the job). It
    // probably would be fine to lock on the job_id, but it is not
    // necessary as we should only ever have one snapshot of a given job
    // that is up for processing...
    db.query('select pg_advisory_lock(id) from job_snapshots ' +
      'where job_id = $1 and processed IS NULL', [jobId], callback);
  }

  function unlockJob(db, jobId, callback) {
    db.query('select pg_advisory_unlock(id) from job_snapshots ' +
      'where job_id = $1', [jobId], callback);
  }

  describe('#create', function() {
    beforeEach(function(done) {
      dbs[1].query('delete from job_snapshots', done);
    });

    it('creates a job with given initial state, time ' +
      'to process in and payload, returning said job as well.',
      function(done) {
        var now = moment();
        var cb = function() {
          jobsModelTest.getJobs(dbs[1], function(err, result) {
            if (err) return done(err);

            expect(result.length).to.equal(1);
            expect(result[0]).to.have.property('process_at');
            expect(moment(result[0].process_at).diff(now.add('seconds',
                100), 'seconds')).to.equal(0);
            expect(result[0].data).to.have.property('state', 'waiting');
            done();
          });
        };
        jobs.create({state: 'waiting', date: 'some'}, 100 * 1000, cb);
      });
  });

  /** Consume jobs waiting for service.
   * process(callback) calls the supplied callback on each job that is
   * awaiting service.
   * Callback must be of the form: callback(id, job, done).
   * When callback is finished providing service to the job, done should be
   * called with the updated job data, like so:
   * done(error, newJobData, msUntilNextProcessing);
   * If error is non-null then no updates will be made to the job.
   * If msUntilNextProcessing is null, then the job will not be serviced again.
   * See below for an example callback (jobIterator).
   */
  describe('#process', function() {
    var jobIterator = function(id, job, jobDone) {
      function error() {
        // We just always error for this test.
        return true;
      }

      if (error() && job.retriesRemaining > 0 ) {
        return jobDone(null, {
          state: 'pendingRetry',
          log: 'it failed!, retrying soon',
          retriesRemaining: --job.retriesRemaining
        }, 0);
      } else if (error()) {
        return jobDone(null, {
          state : 'permanentlyFailed',
          log: 'it failed and we are stopping here!',
          retriesRemaining: 0
        }, null);
      } else {
        return jobDone(null, {
          state : 'complete',
          log: 'it worked!',
          retriesRemaining: 0
        }, null);
      }
    };

    var maybeServiceJobCount, jobUpdatedCount;

    var maybeServiceJob = function() {
      maybeServiceJobCount++;
    };

    var jobUpdated = function() {
      jobUpdatedCount++;
    };

    beforeEach(function() {
      maybeServiceJobCount = 0;
      jobUpdatedCount = 0;

      jobs.eventEmitter.removeAllListeners();
      jobs.eventEmitter.on('jobUpdated', jobUpdated);
      jobs.eventEmitter.on('maybeServiceJob', maybeServiceJob);
    });

    afterEach(function() {
      jobs.stopProcessing();
    });

    it('re-schedules a job iff a non-null serviceNextIn property is provided',
          function(done) {
      // Set up jobs data
      jobsModelTest.setJobs(dbs[1], [{
        data: {
          retriesRemaining: 3
        },
        process_at: moment().add('milliseconds', 1)
      }, {
        data: {
          retriesRemaining: 2
        },
        process_at: moment().add('milliseconds', 4)
      }, {
        data: {
          retriesRemaining: 2
        },
        process_at: moment().add('milliseconds', 5)
      }]);

      // Set up our condition
      jobs.eventEmitter.on('processCommitted', function() {
        // Should need 10 iterations for all jobs to retried out of existence.
        // Each job will be provided service until no retries remaining, then
        // once more to figure out that we need to permanently fail it (and
        // hence not requeue.)
        // I.e. retries remaining for each job + no. jobs initially == 10
        if (jobUpdatedCount == 10) {
          jobsModelTest.scheduledJobs(dbs[1], function(err, result) {
            expect(result.length, 'length of job queue').to.equal(0);
          });
        }
      });
      jobs.eventEmitter.on('drain', function() {
        jobs.stopProcessing();
        done();
      });

      // Run the test
      jobs.process(jobIterator);
    });

    it('reschedules a job to have the correct execution time', function(done) {
      // Set up jobs data
      jobsModelTest.setJobs(dbs[1], [{
        data: {
          retriesRemaining: 3
        },
        process_at: moment().toDate()
      }]);

      var iterator = function(id, job, cb) {
        cb(null, {}, moment.duration(10, 'days').asMilliseconds());
      };

      // Set up our condition
      jobs.eventEmitter.on('processCommitted', function() {
        jobsModelTest.scheduledJobs(dbs[1], function(err, result) {
          if (err) return done(err);
          expect(result.length, 'length of job queue').to.equal(1);
          // Expect the process_at time to be in 10 days.
          // Add 5 minutes to allow for processing lag.
          expect(moment(result[0].process_at).add(5, 'minutes').
            // We use hours not days, as moment.js assumes
            // you want to keep the hour same when adding a unit of days
            // across daylight savings boundaries. This means the test will
            // still pass (as it should) if the test is run within ten
            // days of going off daylight savings time.
            diff(moment(), 'hours')).to.equal(10 * 24);
        });
      });

      jobs.eventEmitter.on('drain', function() {
        jobs.stopProcessing();
        done();
      });

      // Run the test
      jobs.process(iterator);
    });

    // Just binds test and prep together.
    describe('with a delayed job', function() {
      beforeEach(function(done) {
        // Set up some jobs.
        jobsModelTest.setJobs(dbs[1], [{
          data: {
            retriesRemaining: 1,
            wee: 'wah'
          },
          process_at: moment().add('milliseconds', 1)
        }, {
          data: {
            retriesRemaining: 5,
            boo: 'hoo'
          },
          process_at: moment().add('milliseconds', 40000)
        }], done);
      });

      it('provides service only when correct number of ms have elapsed.',
          function(done) {
        // Set up our condition.
        jobs.eventEmitter.on('drain', function() {
            // Only the first job should have got service, and only twice as it
            // only had one retry remaining.
            expect(jobUpdatedCount, 'number of times we serviced a job').
              to.equal(2);
          jobs.stopProcessing();
          done();
        });

        // Run the test.
        jobs.process(jobIterator);
      });
    });

    // Just binds test and setup together.
    describe('with a locked job', function() {
      beforeEach(function(done) {
        jobsModelTest.setJobs(dbs[1], [{
          job_id: 1,
          data: {
            retriesRemaining: 1
          },
          process_at: moment().add('milliseconds', 0)
        }, {
          data: {
            retriesRemaining: 5
          },
          process_at: moment().add('milliseconds', 0)
        }, {
          data: {
            retriesRemaining: 5
          },
          process_at: moment().add('milliseconds', 10000)
        }], lockFirstJob);

        function lockFirstJob() {
          lockJob(dbs[1], 1, done);
        }
      });

      it('will not service it.', function(done) {
        jobs.eventEmitter.on('drain', function() {
          // Only the second job should have got service, six times.
          // This test also shows starvation does not occur, as the first
          // job should be considered for service first (but is locked).
          // Correct behaviour is to move on to the second.
          expect(jobUpdatedCount, 'number of times we serviced a job').
            to.equal(6);
          jobs.stopProcessing();
          done();
        });

        jobs.process(jobIterator);
      });
    });

    //bind setup and test together
    describe('when called on a job', function() {
      beforeEach(function(done) {
        jobsModelTest.setJobs(dbs[1], [{
          job_id: 123,
          data: [],
          process_at: moment()
        }], done);
      });

      it('saves the new job data given to the db, in a non-destructive way',
          function(done) {
        var iterator = function(id, job, cb) {
          return cb(null, {
            state: 'complete',
            name: "tim"
          }, null);
        };

        jobs.eventEmitter.on('processCommitted', function() {
          jobsModelTest.getJobs(dbs[1], function(err, result) {
            if (err) return done(err);
            expect(result).to.have.length(2);
          });
        });

        jobs.eventEmitter.on('drain', function() {
          jobs.stopProcessing();
          done();
        });

        jobs.process(iterator);
      });

      it('provides the job id to the iterator', function(done) {
        function iterator(id, job, cb) {
          expect(id).to.equal(123);
          jobs.stopProcessing();
          cb(null, {}, null);
        }
        jobs.eventEmitter.on('stopProcess', done);
        jobs.process(iterator);
      });
    });
  });
  describe('#processNow', function() {
    describe('when called on a not locked job', function() {
      beforeEach(function(done) {
        // Set up some jobs.
        jobsModelTest.setJobs(dbs[1], [{
          job_id: 1,
          data: {
            retriesRemaining: 1
          },
          process_at: moment().add('milliseconds', 10000).toDate()
        }, {
          job_id: 2,
          data: {
            retriesRemaining: 5
          },
          process_at: moment().add('milliseconds', 40000).toDate()
        }], done);
      });

      it('immediately runs the callback on the requested job, updating it',
          function(done) {
        var iterator = function(err, job, cb) {
          expect(job).to.have.property('retriesRemaining', 1);
          job.retriesRemaining = 2;
          return cb(null, job, 200);
        };

        // Set up condition
        var checkConditions =  function() {
          jobsModelTest.getJobs(dbs[1], function(err, result) {
            if (err) return done(err);

            // check snapshots for job 1
            var snapshots = _.filter(result, {job_id: 1});

            expect(snapshots).to.have.length(2);

            // There should be a single snapshot with a processed value (the
            // previously existing one).
            expect(_.reject(snapshots, {processed: null}).length).to.equal(1);

            // There should be a single snapshot entry with 2 retries remaining
            // and it should not have a processed value.
            expect(_.filter(snapshots,
                {processed: null, data: {'retriesRemaining': 2}}).length).
                to.equal(1);
            done();
          });
        };

        // Run the test.
        jobs.processNow(1, iterator, checkConditions);
      });
    });

    describe('when called on a locked job', function() {
      beforeEach(function(done) {
        jobsModelTest.setJobs(dbs[1], [{
          job_id: 1,
          data: {
            retriesRemaining: 1
          },
          process_at: moment().add('milliseconds', 10000).toDate()
        }], lockFirstJob);

        function lockFirstJob(err) {
          if (err) return done(err);
          lockJob(dbs[1], 1, done);
        }
      });

      it('waits until the lock is ceeded',
          function(done) {
        // We first obtain a lock on the job. Then we run processNow().
        // It should be waiting.  We then release our lock.  We then see that
        // it ran.

        var iterator = function(err, job, cb) {
          jobsModelTest.getJobs(dbs[1], function(err, result) {
            if (err) return done(err);
            return cb(null, job, 200);
          });
        };

        var wasWaiting = false;

        jobs.eventEmitter.on('lockSought', function() {
          // Yes, this is hacky.  We assume that the obtaining of the lock
          // will always take < 100ms.  I could mock out the dbs[0], but this would
          // then be less 'realistic'.  Open to suggestions on how to do this
          // better!
          setTimeout(shouldBeWaiting, 100);
        });

        function shouldBeWaiting() {
          wasWaiting = true;
          unlockJob(dbs[1], 1);
        }

        jobs.eventEmitter.on('lockObtained', function(err) {
          jobs.stopProcessing();
          if (err) return done(err);
          expect(wasWaiting).to.equal(true);
        });

        // Run the test.
        jobs.processNow(1, iterator, done);
      });
    });
  });
});

// vim: set et sw=2 ts=2 colorcolumn=80:
