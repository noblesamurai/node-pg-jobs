var sql = require('sql'),
    moment = require('moment'),
    sqlQueries = require('./sql');

var job_snapshots = sql.define({
    name: 'job_snapshots',
    columns: ['id', 'job_id', 'process_at', 'processed', 'data', 'created_at' ]
});

if (process.env.NODE_ENV === 'test') {
  exports.setJobs = function(db, newJobs, callback) {
    db.query('delete from job_snapshots', insertJobs);
    function insertJobs(err) {
      console.log('insertJobs');
      if (err) return callback(err);
      var query = job_snapshots.insert(newJobs).toQuery();
      console.log(query);
      db.query(query, callback);
    }
  };
  exports.getJobs = function(db, callback) {
    var query = job_snapshots.select(job_snapshots.star()).toQuery();
    db.query(query, function(err, result) {
      if (err) return callback(err);
      callback(null, result.rows);
    });
  };
}

/**
 * @param {function} callback(err, jobId)
 */
exports.write = function(db, jobId, processNext, data, callback) {
  var newJob = {
      process_at: processNext ? processNext.toISOString() : null,
      data: data
    };

  // We let the DB assign the ID if it is null
  if(jobId !== null) {
    newJob.job_id = jobId;
  }

  console.log('newJob');
  console.log(newJob);

  var sql = job_snapshots.insert([newJob]).toQuery();
  console.log(sql);

  db.query(sql, callback);
};

exports.readLatest = function(db, jobId) {};

exports.readHistory = function(db, jobId) {};

exports.scheduledJobs = function(db, callback) {
  db.query(job_snapshots.
      select(job_snapshots.star()).
      from(job_snapshots).
      where(job_snapshots.process_at.isNotNull()).
        and(job_snapshots.processed.isNull()), gotResult);
  function gotResult(err, result) {
    if (err) return callback(err);
    callback(null, result.rows);
  }
};

/**
 * Provide your own transaction context.
 */
exports.nextToProcess = function(db, callback) {
  db.query(sqlQueries.obtainNextUnlockedJob, returnResult);

  function returnResult(err, result) {
    if(err) return callback(err);
    updateProcessedTime(result.rows[0], function(err) {
      if (err) return callback(err);
      callback(null, result.rows[0]);
    });
  }

  function updateProcessedTime(row, cb) {
    if (row === undefined) {
      return cb();
    }
    var sql = job_snapshots.
      update({processed: moment().toISOString()}).
      where(job_snapshots.id.equals(row.id)).toQuery();
    console.log(sql.toString());
    db.query(sql, cb);
  }
};

exports.obtainLock = function(db, jobId, callback) {
  console.log('obtainLock() for job id ' + jobId);
  db.query(sqlQueries.obtainLockForJob, [jobId], gotResult);

  function gotResult(err, result) {
    if (err) return callback(err);
    callback(null, result.rows[0]);
  }
};

// vim: set et sw=2 ts=2 colorcolumn=80:
