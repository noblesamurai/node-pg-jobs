var expect = require('chai').expect,
    moment = require('moment'),
    sinon = require('sinon'),
    async = require('async'),
    testHelper = require('../helper'),
    jobs = require('../../lib/jobs'),
    jobModel = require('../../models/jobs');

describe('Jobs', function() {
  var db, db2;
  before(function(done) {
    async.times(2, testHelper.connectToDB, function(err, results) {
      db = results[0];
      db2 = results[1];
      done(err);
    });
  });

  after(function() {
    db.end();
    db2.end();
  });

  function lockJob(db, jobId, callback) {
    db2.query('begin', doLocks);
    function doLocks(err, result) {
      if (err) return done(err);
      // Note: In this test we use the job_snapshot id not the job_id as
      // that is how the locking is done in the query that grabs the next
      // job.
      // This only locks one row (not all the snapshots for the job). It
      // probably would be fine to lock on the job_id, but it is not
      // necessary as we should only ever have one snapshot of a given job
      // that is up for processing...
      db2.query('select pg_try_advisory_xact_lock(id) from job_snapshots ' +
          'where job_id = $1 and processed IS NULL', [jobId], callback);
    }
  }

  describe('#create', function() {
    before(function(done) {
      db2.query('delete from job_snapshots', done);
    });

    it('creates a job with given initial state, time ' +
      'to process in and payload, returning said job as well.',
      function(done) {
        var now = moment();
        var cb = function() {
          jobs.getJobs(db, function(err, result) {
            if (err) return done(err);

            expect(result.length).to.equal(1);
            expect(result[0]).to.have.property('process_at');
            expect(result[0].process_at).to.eql(now.add('seconds',
                100).toDate());
            expect(result[0].data).to.have.property('state', 'waiting');
            done();
          });
        };
        jobs.create(db, {state: 'waiting', date: 'some'}, 100 * 1000, cb);
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
      console.log('user job iterator');
      function error() {
        // We just always error for this test.
        return true;
      }

      console.log('user job iterator from tests:');
      console.log(job);
      if (error() && job.retriesRemaining > 0 ) {
        return jobDone(null, {
          state: 'pending_retry',
          log: 'it failed!, retrying soon',
          retriesRemaining: --job.retriesRemaining
        }, 2);
      } else if (error()) {
        return jobDone(null, {
          state : 'permanently_failed',
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
      jobs.setJobs(db, [{
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
      jobs.eventEmitter.on('jobUpdated', function() {
        // Should need 10 iterations for all jobs to retried out of existence.
        // Each job will be provided service until no retries remaining, then
        // once more to figure out that we need to permanently fail it (and
        // hence not requeue.)
        // I.e. retries remaining for each job + no. jobs initially == 10
        if (jobUpdatedCount == 10) {
          jobs.getScheduledJobs(db, function(err, result) {
            expect(result.length, 'length of job queue').
              to.equal(0);
            done();
          });
        }
      });

      // Run the test
      jobs.process(db, jobIterator);
    });

    // Just binds test and prep together.
    describe('', function() {
      before(function(done) {
        // Set up some jobs.
        jobs.setJobs(db, [{
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

      it('provides service to a job iff correct number of ms have elapsed.',
          function(done) {
        // Set up our condition.
        jobs.eventEmitter.on('maybeServiceJob', function() {
          // The condition below should hold by 10 attempts to process jobs...
          if (maybeServiceJobCount == 10) {
            // Only the first job should have got service, and only twice as it
            // only had one retry remaining.
            expect(jobUpdatedCount, 'number of times we serviced a job').
              to.equal(2);

            done();
          }
        });

        // Run the test.
        jobs.process(db, jobIterator);
      });
    });

    // Just binds test and setup together.
    describe('', function() {
      before(function(done) {
        jobs.setJobs(db, [{
          id: 1,
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
          lockJob(db2, 1, done);
        }
      });

      it('provides service to a job iff job is not locked.',
          function(done) {

        // Set up our condition.
        jobs.eventEmitter.on('maybeServiceJob', function() {
          // The condition below should hold by 10 attempts to process jobs...
          if (maybeServiceJobCount == 10) {
            // Only the second job should have got service, six times.
            // This test also shows starvation does not occur, as the first
            // job should be considered for service first (but is locked).
            // Correct behaviour is to move on to the second.
            expect(jobUpdatedCount, 'number of times we serviced a job').
              to.equal(6);
            done();
          }
        });

        // Run the test.
        jobs.process(db, jobIterator);
      });
    });

    //bind setup and test together
    describe('', function() {
      before(function(done) {
        jobs.setJobs(db, [{
          data: [],
          process_at: moment()
        }], done);
      });

      it('saves the newJobData in a job, appending it to the history of job data',
          function(done) {
        var iterator = function(id, job, cb) {
          return cb(null, {
            state: 'complete',
            name: "tim"
          }, null);
        };

        jobs.eventEmitter.on('jobUpdated', function() {
          jobs.stopProcessing();
          jobs.getJobs(db2, function(err, result) {
            if (err) return done(err);
            expect(result).to.have.length(2);
            done();
          });
        });

        jobs.process(db, iterator);
      });
    });
  });
  describe('#processNow', function() {
    describe('', function() {
      before(function(done) {
        // Set up some jobs.
        jobs.setJobs(db, [{
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
          return cb(null, job, 200);
        };

        // Set up condition
        var checkConditions =  function() {
          jobs.getJobs(db, function(err, result) {
            if (err) return done(err);
            expect(result.length).to.equal(3);
            done();
          });
        };

        // Run the test.
        jobs.processNow(db, 1, iterator, checkConditions);
      });
    });

    describe('', function() {
      before(function(done) {
        // TODO: lock this job
        jobs.setJobs(db, [{
          job_id: 1,
          data: {
            retriesRemaining: 1
          },
          process_at: moment().add('milliseconds', 10000).toDate()
        }], lockFirstJob);

        function lockFirstJob(err) {
          if (err) return done(err);
          console.log('lockFirstJob');
          lockJob(db2, 1, done);
        }
      });

      it('waits until the lock is ceeded if process() has got hold of the job',
          function(done) {
        // We first obtain a lock on the job. Then we run processNow().
        // It should be waiting.  We then release our lock.  We then see that
        // it ran.

        var iterator = function(err, job, cb) {
          jobs.getJobs(db, function(err, result) {
            if (err) return done(err);
            return cb(null, job, 200);
          });
        };

        var wasWaiting = false;

        jobs.eventEmitter.on('lockSought', function() {
          console.log('lockSought');
          // Yes, this is hacky.  We assume that the obtaining of the lock
          // will always take < 100ms.  I could mock out the DB, but this would
          // then be less 'realistic'.  Open to suggestions on how to do this
          // better!
          setTimeout(shouldBeWaiting, 100);
        });

        function shouldBeWaiting() {
          wasWaiting = true;
          db2.query('commit');
        }

        jobs.eventEmitter.on('lockObtained', function(err) {
          if (err) return done(err);
          console.log('lockObtained');
          expect(wasWaiting).to.equal(true);
          done();
        });

        // Run the test.
        jobs.processNow(db, 1, iterator, done);
      });
    });

    it('pays attention to the payload');
  });

  describe.skip('#getHistory', function() {
    it('gets the requested job history', function(done) {
      // Set up some jobs.
      jobs.setJobs([{
        id: 1,
        jobData: [{
          retriesRemaining: 1
        }],
        processNext: moment().add('milliseconds', 10000).toDate()
      }, {
        id: 2,
        jobData: [{
          retriesRemaining: 7
        },
        { retriesRemaining: 6
        }],
        processNext: moment().add('milliseconds', 40000).toDate()
      }]);

      function cb(err, jobHistory) {
        expect(jobHistory).to.eql([{
          retriesRemaining: 7
        },
        {
          retriesRemaining: 6
        }]);
        done();
      }
      jobs.getHistory(2, cb);
    });
  });
});

// vim: set et sw=2 ts=2 colorcolumn=80:
