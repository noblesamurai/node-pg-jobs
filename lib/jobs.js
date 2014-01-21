var async = require('async'),
    moment = require('moment'),
    events = require('events'),
    _ = require('lodash'),
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
  exports.getScheduledJobs = function() {
    return _.filter(jobs, function(jobContainer) {
      return jobContainer.processNext !== null;
    });
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

function updateJob(jobContainer, newJobData, processIn, cb) {
  jobContainer.jobData.push(newJobData);

  if(processIn === null) {
    jobContainer.processNext = null;
  } else {
    jobContainer.processNext = moment().add('valueOf', processIn);
  }
  exports.eventEmitter.emit('jobUpdated');
  return cb();
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

function serviceJob(jobContainer, userJobIterator, callback) {
  var jobId = jobContainer.id;
  var jobData = _.last(jobContainer.jobData);

  function applyUserJobIterator(done) {

    function processingComplete(err, newJobData, processIn) {
      if (err !== null) {
        console.log('not updating job due to err callback:');
        console.log(err);
        return done();
      } else {
        updateJob(jobContainer, newJobData, processIn, done);
      }
    }

    return userJobIterator(jobId, jobData, processingComplete);
  }

  // Within a 'locked' context, apply the user job iterator.
  lockJobAndExec(jobContainer, applyUserJobIterator, callback);
}

function maybeServiceJob(jobContainer, userJobIterator, callback) {
  exports.eventEmitter.emit('maybeServiceJob');

  var serviceJobHandler = function(err) {
    if (err) {
      console.log('error servicing job:');
      console.log(err);
    }
    return callback();
  };

  // Is processNext time less than or equal to current time?
  if (jobContainer.processNext.valueOf() <= moment().valueOf()) {
    // Job is ready for processing.
    return serviceJob(jobContainer, userJobIterator, serviceJobHandler);
  }

  // Job is not to be processed yet. Push back on queue and callback.
  console.log('not running job yet, it is still delayed.');
  return callback();
}

/**
 * Examines and services jobs in the 'jobs' array, repeatedly, forever, unless
 * stopProcessing() is called.
 * Call this once to start processing jobs.
 * @param {function} serviceJob Iterator function to be run on jobs requiring
 *                   service.
 */
exports.process = function(serviceJob) {
  shouldStillProcess = true;

  async.whilst(
    // test
    function() {return shouldStillProcess;},
    // iterator
    function(cb) {
      setImmediate(function() {
        var jobsToProcess = _.filter(jobs, function(job) {
          return job.processNext !== null && (job.locked !== true);
        });

        if (jobsToProcess.length === 0) {
          console.log('no jobs scheduled');
          return cb();
        }
        // Find job with earliest time
        var jobToProcess = _.min(jobsToProcess, function(jobContainer) {
          return jobContainer.processNext.valueOf();
        });

        console.log('Going to process this job:');
        console.log(jobToProcess);

        maybeServiceJob(jobToProcess, serviceJob, cb);
      });
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
  callback(null, {}, processingComplete);
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
