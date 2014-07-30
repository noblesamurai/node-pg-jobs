'use strict';

var _ = require('lodash'),
    async = require('async');

// get count from the first command line argument (or insert a single job)
var count = parseInt(process.argv[2], 10) || 1;
var jobs = require('../lib/jobs')(process.env.DATABASE_URL);

async.each(_.range(count), function(i, callback) {
  // random requeue count from 0 - 4
  var requeueCount = Math.floor(Math.random() * 5);

  // process in 0 - 20 seconds
  var processIn = Math.floor(Math.random() * 20000);

  jobs.create({
    externalJobId: 'job' + process.pid + '.' + Date.now() + '.' + i,
    state: 'ready',
    requeueCount: requeueCount
  }, processIn, callback);

}, function(err) {
  if (err) {
    console.log(err);
    process.exit(1);
  }

  console.log(count + ' jobs created');
  process.exit(0);
});
