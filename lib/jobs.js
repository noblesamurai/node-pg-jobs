var async = require('async'),
    moment = require('moment'),
    events = require('events'),
    _ = require('lodash'),
    jobsModel = require('../models/jobs'),
    // For now, this isn't DB backed - we just store the jobs in memory.
    next_job_id = 0,
    jobs = [],
    shouldStillProcess;

// Provide the ability to set/clear internal job state in unit tests.
if (process.env.NODE_ENV == 'test') {
  exports.setJobs = function(newJobs) {
    jobs = newJobs;
  };
  exports.getJobs = function() {
    return jobs;
  };
  exports.getScheduledJobs = function(db, callback) {
    jobsModel.scheduledJobs(db, callback);
  };
}

exports.eventEmitter = new events.EventEmitter();

exports.create = function(job, processIn, done) {
  var jobContainer = {
    id: next_job_id++,
    processNext: moment().add(processIn).toDate(),
    jobData: [job]
  };

  jobs.push(jobContainer);
  done();
};

function updateJob(db, jobContainer, newJobData, processIn, cb) {
  var processNext;

  if(processIn === null) {
    processNext = null;
  } else {
    processNext = moment().add('valueOf', processIn);
  }
  jobsModel.write(db, jobContainer.id, processNext, newJobData, complete);

  function complete(err) {
    if (err) return cb(err);
    exports.eventEmitter.emit('jobUpdated');
    console.log('woooo!');
    cb();
  }
}

function releaseLock(jobContainer, done) {
  jobContainer.locked = false;
  done();
}

/**
 * @param {Object} jobContainer - the job to lock on.
 * @param {function} context The code to run whilst locked. It must be an async
 *                   function accepting a done callback.
 * @param {function} done Callback to execute when finished.  Calls with err
 *                  if couldn't obtain lock.
 */
function lockJobAndExec(jobContainer, context, done) {
  console.log('lockJobAndExec');
  var complete = function() {
    console.log('complete');
    releaseLock(jobContainer, done);
  };

  if (jobContainer.locked) {
    return done(new Error('could not obtain a lock - already locked'));
  }

  jobContainer.locked = true;
  return context(complete);
}

function waitForLock(jobContainer, callback) {
  if (jobContainer.locked !== true)  {
    return callback();
  }
  setImmediate(function() {waitForLock(jobContainer, callback);});
}

function serviceJob(db, jobContainer, userJobIterator, callback) {
  var jobId = jobContainer.id;
  var jobData = jobContainer.data;


  console.log(jobContainer);
  console.log(jobId);
  console.log(jobData);
  return userJobIterator(jobId, jobData, processingComplete);

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
exports.process = function(db, userJobIterator) {
  shouldStillProcess = true;

  async.whilst(
    // test
    function() {return shouldStillProcess;},
    // iterator
    function(cb) {
      setTimeout(function() {
      setImmediate(function() {
        db.query('begin;', doProcessing); 

        function doProcessing(err) {
          if (err) return cb(err);
          jobsModel.nextToProcess(db, gotResult);

          function gotResult(err, job) {
            if (err) return cb(err);

            if (!job) {
              console.log('no jobs scheduled');
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
            db.query('commit;', cb);
          }
        }
      });
      }, 100);
    },
    // called when test fails and execution ceases
    function() {});
};

exports.stopProcessing = function() {
  shouldStillProcess = false;
};

exports.processNow = function(id, callback, done) {
  var jobContainer = _.find(jobs, function(jContainer) {
    return jContainer.id === id;
  });

  var processingComplete = function(err, newJobData, processIn) {
    if (err !== null) {
      console.log('not updating job due to err callback');
      return done();
    } else {
      updateJob(jobContainer, newJobData, processIn, done);
    }
  };
  waitForLock(jobContainer, function() {
    callback(null, {}, processingComplete);
  });
};

function latestData(id) {
  var jobContainer = _.find(jobs, function(jobCont) {return jobCont.id == id;});
  return _.last(jobContainer.jobData);
}

exports.get = function(id, cb) {
  return cb(null, latestData(id));
};

exports.getHistory = function(id, cb) {
  var jobContainer = _.find(jobs, function(jobCont) {return jobCont.id == id;});
  return cb(null, jobContainer.jobData);
};

// vim: set et sw=2 ts=2 colorcolumn=80:
