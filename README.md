node-pg-jobs
============

A simple yet flexible postgres backed job queue for node.js.

# Create a job
Creating a job is simple a matter of calling `jobs.create()` with a freeform object representing
the job to be created, and specifying when we should consider the job for service.
```javascript
/**
 * @param {Object} job The data you want to save for the job.  This is freeform
 *                     and up to you.
 * @param {int} processIn The job will not get service until this many ms have
                          elapsed. Set to null if you do not want to service it again.
 * @param {function} done Callback.
 */
jobs.create(jobData, processIn, done);
```
E.g:
```javascript
jobs.create({
  externalJobId: 'number1',
  state: 'ready',
  specialInstructions: 'quickly now'
}, 2000, done);
```

# Process jobs
## Providing continual service
The callback function passed to `jobs.process()` is the brains here.
It defines what will happen when a job receives service.  It is
passed the job and a done callback that it should call to notify
what should happen to the job after processing.  The id is the id
that was automatically created when the job was created.
```javascript
var callback = function(id, job, done) {
 // Do stuff with job
 job.state = 'a_new_state';
 job.eatBananas = true;

 // Call done callback and update the job.  It will run again in > 200ms.
 done(null, job, 200);
}

/**
 * Iterate through all scheduled jobs and service those that have served out
   their delay.
 * @param {function(job, done)} callback The callback to be called on each job.
 *                                       Must call done() as per example above.
 */
jobs.process(callback);

/**
 * Call this to stop processing.
 */
jobs.stopProcessing();
```
Note that at present jobs.process() is synchronous (processes one job after the
other) but you can safely run two calls to it either in the same or different
processes. It wouldn't be too hard to change this, let me know if you really
think this is necessary or put up a pull request.

## Make it happen now

If you want a job to get service right away (due to say, some external event occurring), you can
do it like so.  NB that you if the job is currently enjoying service in `jobs.process()` the
callback will only be called after it is finished.  If the job cannot be found, an error will
be passed to the callback.

```javascript
// Form of callback for jobs.processNow():
var callback = function(err, jobData, done) {
 // Do stuff with job
 doSomeAction(jobData);
 jobData.state = 'a_new_state';
 jobData.eatBananas = true;

 // Call done callback and update the job.  It will run again in > 200ms.
 done(null, jobData, 200);
}

/** The job with the given id will be run now.
 * @param {int} id The ID of the job to run now.
 * @param {function} callback - The callback to be passed the job, of the same
                                form as for jobs.process().
 * @param {function} done - callback called when everything is completed.
 */
jobs.processNow(id, callback, done);
```

# Running migrations on heroku
This is a bit yuk, but it should work:
```
heroku run bash
npm install -g db-migrate
npm install db-migrate
db-migrate up -m node_modules/node-pg-jobs/migrations/ --config $DATABASE_URL
exit
```

## License

(The MIT License)

Copyright (c) 2013 Eguene Ware &lt;eugene@noblesamurai.com&gt;

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
