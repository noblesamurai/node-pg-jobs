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
  });
  describe('#create', function() {
    var clock;
    before(function() {
      // Mock out the clock.
      clock = sinon.useFakeTimers();
    });

    after(function() {
      clock.restore();
    });

    it('creates a job with given initial state, time ' +
      'to process in and payload, returning said job as well.',
      function(done) {
        var jobLen = jobs.getJobs().length;
        var now = moment();
        var cb = function() {
          expect(jobs.getJobs()[0]).to.have.property('processNext');
          expect(jobs.getJobs()[0].processNext).to.eql(now.add('milliseconds',
              100).toDate());
          expect(jobs.getJobs()[0].jobData[0]).to.have.property('state');
          done();
        };
        jobs.create( {state: 'waiting', date: 'some'}, 100, cb);
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

    it.only('re-schedules a job iff a non-null serviceNextIn property is provided',
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

    before(function(done) {
      // Set up some jobs.
      jobs.setJobs(db, [{
        data: {
          retriesRemaining: 1
        },
        process_at: moment().add('milliseconds', 1)
      }, {
        data: {
          retriesRemaining: 5
        },
        process_at: moment().add('milliseconds', 4000)
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
              'where id = 1', gotLock);
        }
        function gotLock(err, result) {
          console.log('result of test lock:');
          console.log(result);
          done(err);
        }
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

    it('saves the newJobData in a job, appending it to the history of job data',
        function(done) {
      var now = moment();
      var sometimeSoon = now.add('milliseconds', 5);

      jobs.setJobs([{
        id: 1,
        jobData: [],
        processNext: now
      }]);

      var iterator = function(id, job, cb) {
        return cb(null, {
          state : 'complete',
           name: "tim"
        }, 5);
      };

      jobs.eventEmitter.on('jobUpdated', function() {
        if (jobUpdatedCount == 1) {
          expect(jobs.getJobs()[0]).to.have.property('jobData').with.length(1);
          expect(jobs.getJobs()[0].jobData[0]).to.deep.equal(
              {state: "complete", name: "tim"});
          done();
        }
      });

      jobs.process(iterator);
    });
  });
  describe('#processNow', function() {
    it('immediately runs the callback on the requested job, updating it',
        function(done) {
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
          retriesRemaining: 5
        }],
        processNext: moment().add('milliseconds', 40000).toDate()
      }]);

      var iterator = function(err, job, cb) {
        return cb(null, job, 200);
      };

      // Set up condition
      var checkConditions =  function() {
        expect(jobs.getJobs()[0].jobData.length).to.equal(2);
        done();
      };

      // Run the test.
      jobs.processNow(1, iterator, checkConditions);
    });

    it('waits until the lock is ceeded if process() has got hold of the job',
        function(done) {
      // how to check:
      // well, we run the thing, with the job marked as locked.  It should be
      // waiting.  We then set the thing to false.  We then see that it ran.

      // Set up some jobs.
      jobs.setJobs([{
        id: 1,
        locked: true,
        jobData: [{
          retriesRemaining: 1
        }],
        processNext: moment().add('milliseconds', 10000).toDate()
      }]);

      var iterator = function(err, job, cb) {
        expect(jobs.getJobs()[0].locked).to.equal(false);
        return cb(null, job, 200);
      };

      setTimeout(function() {
        jobs.getJobs()[0].locked = false;
      }, 10);

      // Run the test.
      jobs.processNow(1, iterator, done);
    });
  });

  describe('#getHistory', function() {
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
