var async = require('async'),
    moment = require('moment'),
    events = require('events'),
    _ = require('lodash'),
    shouldStillProcess;

module.exports = function(db) {
  var Jobs = {};
  var jobsModel = require('../models/jobs')(db);

  // Expose jobs model when we are testing so we can set up stuff on the Db.
  if (process.env.NODE_ENV === 'test') {
    Jobs.jobsModel = jobsModel;
  }

  Jobs.eventEmitter = new events.EventEmitter();

  Jobs.create = function(jobData, processIn, done) {
    var processAt = moment().add(processIn).toDate();
    jobsModel.write(null, processAt, jobData, done);
  };

  function updateJob(jobSnapshot, newJobData, processIn, cb) {
    console.log('updateJob');
    var processNext =
      (processIn === null) ?
      null :
      moment().add('milliseconds', processIn);
    jobsModel.write(jobSnapshot.job_id, processNext, newJobData, complete);

    function complete(err) {
      if (err) return cb(err);
      Jobs.eventEmitter.emit('jobUpdated');
      cb();
    }
  }

  function serviceJob(jobContainer, userJobIterator, callback) {
    return userJobIterator(jobContainer.job_id, jobContainer.data,
        processingComplete);

    function processingComplete(err, newJobData, processIn) {
      if (err) {
        console.log('not updating job due to err callback:');
        console.log(err);
        return done();
      } else {
        console.log('am updating job');
        updateJob(jobContainer, newJobData, processIn, callback);
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
          jobsModel.startTxn(doProcessing);

          function doProcessing(err) {
            if (err) return cb(err);
            Jobs.eventEmitter.emit('maybeServiceJob');
            jobsModel.nextToProcess(gotResult);

            function gotResult(err, job) {
              if (err) return cb(err);

              if (!job) {
                return jobsModel.commitTxn(cb);
              }

              console.log('Going to process this job:');
              console.log(job);

              return serviceJob(job, userJobIterator, serviceJobHandler);
            }

          }
          function serviceJobHandler(err) {
            if (err) {
              console.log('error servicing job:');
              console.log(err);
              JobsModel.rollbackTxn(cb);
            } else {
              jobsModel.commitTxn(function(err) {
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
    jobsModel.startTxn(getLock);

    function getLock(err) {
      if (err) return done(err);
      jobsModel.obtainLock(jobId, gotResult);
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
          jobsModel.rollbackTxn(done);
        } else {
          updateJob(jobSnap, newJobData, processIn, commitTransaction);
        }
      }
    }

    function commitTransaction() {
      console.log('commitTransaction');
      jobsModel.commitTxn(function(err) {
        if (err) return done(err);
        Jobs.eventEmitter.emit('processNowCommitted');
        done();
      });
    }
  };

  return Jobs;
};

// vim: set et sw=2 ts=2 colorcolumn=80:
