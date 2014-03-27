var sql = require('sql'),
    moment = require('moment'),
    sqlQueries = require('./sql');

var job_snapshots = sql.define({
    name: 'job_snapshots',
    columns: ['id', 'job_id', 'process_at', 'processed', 'data', 'created_at' ]
});

/**
 * @param {Object} db The db client to use.
 * @param {int|null} jobId The ID  of the job to add a job snapshot to.
 *                         If null, then this is a new job and a fresh job ID
 *                         is assigned by the sequence on the database.
 * @param {int} processIn Number of milliseconds from now the job should
 *                        become eligible to obtain service.
 * @param {Object} data The job data.
 * @param {function} callback(err, jobId)
 */
exports.write = function(db, jobId, processIn, data, callback) {
  var processAt = (processIn === null) ?
      null :
      // parseInt for injection attack prevention.
      "NOW() + INTERVAL '" + parseInt(processIn, 10) + " milliseconds'";
  var sql;
  if (jobId !== null) {
    sql =
      "INSERT INTO job_snapshots (job_id, data, process_at) VALUES ($1, $2, " +
      processAt + ");";
    db.query(sql, [jobId, data], callback);
  } else {
    sql =
      "INSERT INTO job_snapshots (data, process_at) VALUES ($1, " +
      processAt + ");";
    db.query(sql, [data], callback);
  }
};

exports.scheduledJobs = function(db, callback) {
  var query = job_snapshots.
      select(job_snapshots.star()).
      from(job_snapshots).
      where(job_snapshots.process_at.isNotNull()).
        and(job_snapshots.processed.isNull()).toQuery();
  db.query(query, gotResult);
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
    callback(null, result.rows[0]);
  }
};

exports.obtainLock = function(db, jobId, callback) {
  db.query(sqlQueries.obtainLockForJob, [jobId], gotResult);

  function gotResult(err, result) {
    if (err) return callback(err);
    callback(null, result.rows[0]);
  }
};

exports.startTxn = function(db, callback) {
  db.query('begin', callback);
};

exports.commitTxn = function(db, callback) {
  db.query('commit', callback);
};

exports.rollbackTxn = function(db, callback) {
  db.query('rollback', callback);
};

if (process.env.NODE_ENV === 'test') {
  exports.setJobs = function(db, newJobs, callback) {
    db.query('delete from job_snapshots', insertJobs);
    function insertJobs(err) {
      if (err) return callback(err);
      var query = job_snapshots.insert(newJobs).toQuery();
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

// vim: set et sw=2 ts=2 colorcolumn=80:
