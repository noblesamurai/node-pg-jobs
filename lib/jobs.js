var async = require('async'),
    moment = require('moment'),
    events = require('events'),
    _ = require('lodash'),
    shouldStillProcess,
    pg = require('pg'),
    Transaction = require('pg-transaction');

module.exports = function(options) {
  var Jobs = {};
  var jobsModel = require('../models/jobs');

  // Expose jobs model when we are testing so we can set up stuff on the Db.
  if (process.env.NODE_ENV === 'test') {
    Jobs.jobsModel = jobsModel;
  }

  Jobs.eventEmitter = new events.EventEmitter();

  Jobs.create = function(jobData, processIn, done) {
    pg.connect(options.db, function(err, db, releaseClient) {
      var doneAndRelease = function(err) {
        releaseClient();
        done(err);
      };
      if (err) return doneAndRelease(err);
      jobsModel.write(db, null, processIn, jobData, doneAndRelease);
    });
  };

  function updateJob(db, jobSnapshot, newJobData, processIn, cb) {
    jobsModel.write(db, jobSnapshot.job_id, processIn, newJobData, complete);

    function complete(err) {
      if (err) return cb(err);
      Jobs.eventEmitter.emit('jobUpdated');
      cb();
    }
  }

  function serviceJob(db, jobContainer, userJobIterator, callback) {
    return userJobIterator(jobContainer.job_id, jobContainer.data,
        processingComplete);

    function processingComplete(err, newJobData, processIn) {
      if (err) {
        return callback(err);
      } else {
        updateJob(db, jobContainer, newJobData, processIn, callback);
      }
    }
  }

  Jobs.stopProcessing = function() {
    shouldStillProcess = false;
  };

  Jobs.continueProcessing = function() {
    return shouldStillProcess;
  };

  /**
   * Examines and services jobs in the 'jobs' array, repeatedly, forever, unless
   * stopProcessing() is called.
   * Call this once to start processing jobs.
   * @param {function} serviceJob Iterator function to be run on jobs requiring
   *                   service.
   */
  Jobs.process = function(processFunction, done) {
    shouldStillProcess = true;
    done = done || function() {};
    pg.connect(options.db, connected);

    function connected(err, db, releaseClient) {
      if (err) return done(err);
      async.whilst(Jobs.continueProcessing, iterator, finish);

      function iterator(callback) {
        setImmediate(function() {
          Jobs.eventEmitter.emit('maybeServiceJob');
          jobsModel.nextToProcess(db, getJobProcessor(false, db, processFunction, callback));
        });
      }
      function finish(err) {
        releaseClient();
        Jobs.eventEmitter.emit('stopProcess');
        done();
      }
    }
  };

  Jobs.processNow = function(jobId, processFunction, done) {
    done = done || function() {};
    pg.connect(options.db, connected);

    function connected(err, db, releaseClient) {
      if (err) return done(err);
      jobsModel.obtainLock(db, jobId, getJobProcessor(true, db, _processFunction, function(err) {
        releaseClient();
        done(err);
      }));
      Jobs.eventEmitter.emit('lockSought');
    }
    function _processFunction(id, data, callback) {
      processFunction(null, data, callback);
    }
  };

  function getJobProcessor(now, db, processFunction, callback) {
    return function(err, jobSnap) {
      if (err) return callback(err);
      if (!jobSnap) {
        if (now) return callback(new Error('Could not locate job'));

        Jobs.eventEmitter.emit('drain');
        return setTimeout(callback, options.pollInterval || 1000);
      }
      if (now) Jobs.eventEmitter.emit('lockObtained');
      processJob(jobSnap);
    }

    function processJob(jobSnap) {
      var tx = new Transaction(db);
      tx.on('error', function() {
        jobsModel.unlock(db, jobSnap.id);
        callback(new Error('Transaction error'));
      });
      serviceJob(tx, jobSnap, processFunction, function(err) {
        if (err) {
          tx.rollback();
        } else {
          tx.commit();
          Jobs.eventEmitter.emit(now ? 'processNowCommitted' : 'processCommitted');
        }
        jobsModel.unlock(db, jobSnap.id);
        callback();
      });
    }
  }

  return Jobs;
};

// vim: set et sw=2 ts=2 colorcolumn=80:
