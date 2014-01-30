var async = require('async'),
    moment = require('moment'),
    events = require('events'),
    _ = require('lodash'),
    jobsModel = require('../models/jobs'),
    // For now, this isn't DB backed - we just store the jobs in memory.
    next_job_id = 0,
    jobs = [],
    shouldStillProcess;

module.exports = function(dbIn) {
  var Jobs = {};
  var db = dbIn;

  Jobs.eventEmitter = new events.EventEmitter();

  Jobs.create = function(jobData, processIn, done) {
    var processAt = moment().add(processIn).toDate();
    jobsModel.write(db, null, processAt, jobData, done);
  };

  function updateJob(db, jobContainer, newJobData, processIn, cb) {
    console.log('updateJob');
    var processNext;

    if(processIn === null) {
      processNext = null;
    } else {
      processNext = moment().add('valueOf', processIn);
    }
    jobsModel.write(db, jobContainer.job_id, processNext, newJobData, complete);

    function complete(err) {
      if (err) return cb(err);
      Jobs.eventEmitter.emit('jobUpdated');
      cb();
    }
  }

  function serviceJob(db, jobContainer, userJobIterator, callback) {
    return userJobIterator(jobContainer.id, jobContainer.data,
        processingComplete);

    function processingComplete(err, newJobData, processIn) {
      if (err) {
        console.log('not updating job due to err callback:');
        console.log(err);
        return done();
      } else {
        console.log('am updating job');
        updateJob(db, jobContainer, newJobData, processIn, callback);
      }
    }
  }

  /**
   * Examines and services jobs in the 'jobs' array, repeatedly, forever, unless
   * stopProcessing() is called.
   * Call this once to start processing jobs.
   * @param {function} serviceJob Iterator function to be run on jobs requiring
   *                   service.
   */
  Jobs.process = function(userJobIterator) {
    shouldStillProcess = true;

    async.whilst(
      // test
      function() {return shouldStillProcess;},
      // iterator
      function(cb) {
        setImmediate(function() {
          console.log('begin txn');
          db.query('begin;', doProcessing);

          function doProcessing(err) {
            if (err) return cb(err);
            Jobs.eventEmitter.emit('maybeServiceJob');
            jobsModel.nextToProcess(db, gotResult);

            function gotResult(err, job) {
              if (err) return cb(err);

              if (!job) {
                console.log('no jobs scheduled');
                db.query('commit;', cb);
                return cb();
              }

              console.log('Going to process this job:');
              console.log(job);

              return serviceJob(db, job, userJobIterator, serviceJobHandler);
            }

          }
          function serviceJobHandler(err) {
            if (err) {
              console.log('error servicing job:');
              console.log(err);
              db.query('rollback;', cb);
            } else {
              console.log('committing.');
              db.query('commit;', function(err) {
                if (err) return cb(err);
                Jobs.eventEmitter.emit('processCommitted');
                cb();
              });
            }
          }
        });
      },
      // called when test fails and execution ceases
      function() {});
  };

  Jobs.stopProcessing = function() {
    shouldStillProcess = false;
  };

  Jobs.processNow = function(jobId, callback, done) {
    db.query('begin', getLock);

    function getLock(err) {
      if (err) return done(err);
      jobsModel.obtainLock(db, jobId, gotResult);
      Jobs.eventEmitter.emit('lockSought');
    }

    function gotResult(err, jobSnap) {
      if (err) return done(err);
      Jobs.eventEmitter.emit('lockObtained');
      console.log('jobSnap:');
      console.log(jobSnap);
      callback(null, jobSnap.data, processingComplete);

      function processingComplete(err, newJobData, processIn) {
        if (err !== null) {
          console.log('not updating job due to err callback');
          db.query('rollback', done);
        } else {
          updateJob(db, jobSnap, newJobData, processIn, commitTransaction);
        }
      }
    }

    function commitTransaction() {
      console.log('commitTransaction');
      db.query('commit', function(err) {
        if (err) return done(err);
        Jobs.eventEmitter.emit('processNowCommitted');
        done();
      });
    }
  };

  // I haven't bother to update this stuff yet:
  // It doesn't work at present.  Can fix it later.
  function latestData(id) {
    var jobContainer = _.find(jobs, function(jobCont) {return jobCont.id == id;});
    return _.last(jobContainer.jobData);
  }

  Jobs.get = function(id, cb) {
    return cb(null, latestData(id));
  };

  Jobs.getHistory = function(id, cb) {
    var jobContainer = _.find(jobs, function(jobCont) {return jobCont.id == id;});
    return cb(null, jobContainer.jobData);
  };

  return Jobs;
};

// vim: set et sw=2 ts=2 colorcolumn=80:
