var async = require('async'),
    moment = require('moment'),
    events = require('events'),
    _ = require('lodash'),
    shouldStillProcess,
    pg = require('pg'),
    Transaction = require('pg-transaction');

module.exports = function(dbConnString) {
  var Jobs = {};
  var jobsModel = require('../models/jobs');

  // Expose jobs model when we are testing so we can set up stuff on the Db.
  if (process.env.NODE_ENV === 'test') {
    Jobs.jobsModel = jobsModel;
  }

  Jobs.eventEmitter = new events.EventEmitter();

  Jobs.create = function(jobData, processIn, done) {
    pg.connect(dbConnString, function(err, db, releaseClient) {
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
        return done();
      } else {
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

    pg.connect(dbConnString, connected);

    function connected(err, db, releaseClient) {
      if (err) throw(err);
      async.whilst(
        // test
        function() {return shouldStillProcess;},
        // iterator func
        iterator,
        // called when test fails and execution ceases
        function() {
          releaseClient();
          Jobs.eventEmitter.emit('stopProcess');
        });

        function iterator(cb) {
          setImmediate(function() {
            var tx = new Transaction(db);
            tx.begin(doProcessing);

            function doProcessing(err) {
              if (err) return cb(err);
              Jobs.eventEmitter.emit('maybeServiceJob');
              jobsModel.nextToProcess(tx, gotResult);

              function gotResult(err, job) {
                if (err) return cb(err);

                if (!job) {
                  return tx.commit(function() {
                    Jobs.eventEmitter.emit('drain');
                    cb();
                  });
                }

                return serviceJob(tx, job, userJobIterator, serviceJobHandler);
              }

            }
            function serviceJobHandler(err) {
              if (err) {
                tx.rollback(cb);
              } else {
                tx.commit(function(err) {
                  if (err) return cb(err);
                  Jobs.eventEmitter.emit('processCommitted');
                  cb();
                });
              }
            }
          });
        }
    }
  };

  Jobs.stopProcessing = function() {
    shouldStillProcess = false;
  };

  Jobs.processNow = function(jobId, callback, done) {
    pg.connect(dbConnString, connected);

    var db, doneWithRelease, tx;
    function connected(err, _db, releaseClient) {
      if(err) return done(err);
      db = _db;
      doneWithRelease = function(err) {
        releaseClient();
        done(err);
      };
      tx = new Transaction(db);
      tx.begin(getLock);
    }

    function getLock(err) {
      if (err) return doneWithRelease(err);
      jobsModel.obtainLock(tx, jobId, gotResult);
      Jobs.eventEmitter.emit('lockSought');
    }

    function gotResult(err, jobSnap) {
      if (err) return doneWithRelease(err);
      if (!jobSnap) {
        return doneWithRelease(new Error('Could not locate job with ID: ' + jobId));
      }
      Jobs.eventEmitter.emit('lockObtained');
      callback(null, jobSnap.data, processingComplete);

      function processingComplete(err, newJobData, processIn) {
        if (err !== null) {
          tx.rollback(doneWithRelease);
        } else {
          updateJob(tx, jobSnap, newJobData, processIn, commitTransaction);
        }
      }
    }

    function commitTransaction() {
      tx.commit(function(err) {
        if (err) return doneWithRelease(err);
        Jobs.eventEmitter.emit('processNowCommitted');
        doneWithRelease();
      });
    }
  };

  return Jobs;
};

// vim: set et sw=2 ts=2 colorcolumn=80:
