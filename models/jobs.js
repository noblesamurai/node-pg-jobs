var  moment = require('moment'),
    sqlQueries = require('./sql');

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

exports.nextToProcess = function(db, callback) {
  db.query(sqlQueries.obtainNextUnlockedJob, returnResult);

  function returnResult(err, result) {
    if(err) return callback(err);
    callback(null, result.rows[0]);
  }
};

exports.unlock = function(db, jobId) {
  db.query(sqlQueries.unlockJob, [jobId]);
};

exports.obtainLock = function(db, jobId, callback) {
  db.query(sqlQueries.obtainLockForJob, [jobId], gotResult);

  function gotResult(err, result) {
    if (err) return callback(err);
    callback(null, result.rows[0]);
  }
};

// vim: set et sw=2 ts=2 colorcolumn=80:
