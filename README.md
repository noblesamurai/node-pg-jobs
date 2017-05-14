node-pg-jobs
============

A simple yet flexible postgres backed job queue for node.js.

```javascript
var job = require('pg-jobs')({
  db: 'postgres://localhost/mydb'
});
```

*Creating a job* is simple a matter of calling `jobs.create()` with a freeform
object representing the job to be created, and specifying when we should
consider the job for service.

```javascript
/**
 * @param {Object} job The data you want to save for the job.  This is freeform
 *                     and up to you.
 * @param {int} processIn The job will not get service until this many ms have
                          elapsed. Set to null if you do not want to service it again.
 * @param {function} done Callback - called when job is enqueued (or on error).
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

## Process jobs
### Providing continual service
The `worker` function passed to `jobs.process()` is the brains here.
It defines what will happen when a job receives service.  It is
passed the job and a done callback that it should call to notify
what should happen to the job after processing.  The `id` is the `id`
that was automatically created when the job was created.
```javascript
var worker = function(id, job, done) {
 // Do stuff with job
 job.state = 'a_new_state';
 job.eatBananas = true;

 // Call done callback and update the job.  It will run again in > 200ms.
 done(null, job, 200);
}

/**
 * Iterate through all scheduled jobs and service those that have served out
   their delay.
 * @param {function(job, done)} worker The callback to be called on each job.
 *                                       Must call done() as per example above.
 * @param {function(err)} done Called when stopProcessing() is called or on fatal error.
 */
jobs.process(worker, done);

/**
 * Call this to stop processing.
 */
jobs.stopProcessing();
```
Note that jobs.process() is synchronous (processes one job after the
other) but you can safely run two calls to it either in the same or different
processes.

### Make it happen now

If you want a job to service a job right away (due to say, some external event
occurring), use `processNow()`.
If the job is currently being serviced in a `jobs.process()` or another
`jobs.processNow()` the worker will only be called when the lock has been ceded.

*If the job cannot be found*, `callback()` will be called with an error. `worker()`
will not be called.

*If the `done()` function passed to `worker()` is called with an error* then no
changes are made to the job, and `callback` will be passed that error.

```javascript
var worker = function(id, jobData, done) {
 // Do stuff with job
 doSomeAction(jobData);
 jobData.state = 'a_new_state';
 jobData.eatBananas = true;

 // Call done callback and update the job.  It will run again in > 200ms.
 done(null, jobData, 200);
}

/** The job with the given id will be run now.
 * @param {int} id The ID of the job to run now.
 * @param {function} worker - The callback to be passed the job, of the same
                                form as for jobs.process().
 * @param {function} callback - callback called when everything is completed.
 */
jobs.processNow(id, worker, callback);
```

## Running migrations
```script
npm install -g db-migrate
npm install -g pg
db-migrate up -m migrations/ --config database.json
```
will create "node_pg_jobs_dev".

## Running migrations on heroku
This is a bit yuk, but it should work:
```
heroku run bash
npm install db-migrate
./node_modules/.bin/db-migrate up -m ./node_modules/pg-jobs/migrations/ --config $DATABASE_URL
exit
```

# Development
## Tests
```
docker-compose up pg_jobs
```
OR if you have a local postgres with correct user acc:
```
npm test
```

## Inspect the test db
```
docker-compose run psql
```

## Contributing

pg-jobs is an **OPEN Open Source Project**. This means that:

> Individuals making significant and valuable contributions are given commit-access to the project to contribute as they see fit. This project is more like an open wiki than a standard guarded open source project.

See the [CONTRIBUTING.md](https://github.com/eugeneware/replacestream/blob/master/CONTRIBUTING.md) file for more details.

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
