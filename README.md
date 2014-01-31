node-pg-jobs
============

A simple yet flexible postgres backed job queue for node.js.

# Create a job
Creating a job is simple a matter of calling jobs.create() with a freeform object representing
the job to be created, and specifying when we should consider the job for service.
```javascript
/**
 * @param {Object} job The data you want to save for the job.  This is freeform and up to you.
 * @param {int} processIn The job will not get service until this many ms have elapsed.
 * @param {function} done Callback.
 */
jobs.create(job, processIn, done);
```
E.g:
```javascript
jobs.create({
  externalJobId: 'number1',
  state: 'ready',
  specialInstructions: 'quickly now'
}, 2000, myCb);
```

# Process jobs
## Providing continual service
The callback function passed to jobs.process() is the brains here.
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
 * Iterate through all scheduled jobs and service those that have served out their delay.
 * @param {function(job, done)} callback The callback to be called on each job.  Must call 
 * done() as per example above. 
 */
jobs.process(callback);

/**
 * Call this to stop processing.
 */
jobs.stopProcessing(done);
```
## Make it happen now

If you want a job to get service right away (due to say, some external event occurring), you can
do it like so.  NB that you if the job is currently enjoying service in jobs.process() the
callback will only be called after it is finished.  If the job cannot be found, an error will
be passed to the callback.

```javascript
// Form of callback for jobs.processNow():
var callback = function(err, job, done) {
 // Do stuff with job
 job.state = 'a_new_state';
 job.eatBananas = true;
 
 // Call done callback and update the job.  It will run again in > 200ms.
 done(null, job, 200);
}

/** The job with the given id will be run now.
 * @param {int} id The ID of the job to run now.
 * @param {function} callback - The callback to be passed the job, of the same form as for jobs.process().
 * @param {function} done - callback called when everything is completed.
 */
jobs.processNow(id, callback, done);
```

# Getting a job
```javascript
var callback = function(err, job) {
  console.log(job);
};

jobs.get(id, callback);
```

# Getting the history of a job
You can see what has happened to a job over time as follows.  This is a ready-only operation, hence no locking is
necessary or respected.

```javascript
var callback = function(err, jobHistory) {
  var latestJob = jobHistory[0];
  console.log(latestJob);
  
  var secondLatest = jobHistory[1];
  console.log(secondLatest);
}
/** Get the history of snapshots of a job for a given job id.
 * @param {int} id The job id.
 * @param {function} callback A callback that will be passed the job history.
 *                            That is, all the snapshots of a job from, sorted from latest to earliest in an array.
 */     

jobs.getHistory(id, callback);
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
