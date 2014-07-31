'use strict';

var jobs = require('../lib/jobs')({ db: process.env.DATABASE_URL });
jobs.process(function(id, job, done) {
  if (job.requeueCount) {
    job.state = 'requeued';
    job.requeueCount--;
  } else {
    job.state = 'complete';
  }

  var simulatedAsyncProcessingTime = 10 + Math.floor(Math.random() * 190);
  setTimeout(function() {
    console.log('job', job.externalJobId, job.state,
      job.requeueCount ? '(' + job.requeueCount + ' requeues remaining)' : '');

    // requeue to run in 200 ms again if state is not complete
    done(null, job, job.state === 'complete' ? null : 200); 
  }, simulatedAsyncProcessingTime);
});
