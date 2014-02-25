var sql = require('sql'),
    moment = require('moment'),
    sqlQueries = require('./sql');

var job_snapshots = sql.define({
    name: 'job_snapshots',
    columns: ['id', 'job_id', 'process_at', 'processed', 'data', 'created_at' ]
});

module.exports = function(db) {
  var JobSnapshotsModel = {};

  /**
   * @param {int|null} jobId The ID  of the job to add a job snapshot to.
   *                         If null, then this is a new job and a fresh job ID
   *                         is assigned by the sequence on the database.
   * @param {int} processIn Number of milliseconds from now the job should
   *                        become eligible to obtain service.
   * @param {Object} data The job data.
   * @param {function} callback(err, jobId)
   */
  JobSnapshotsModel.write = function(jobId, processIn, data, callback) {
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

  JobSnapshotsModel.readLatest = function(jobId) {};

  JobSnapshotsModel.readHistory = function(jobId) {};

  JobSnapshotsModel.scheduledJobs = function(callback) {
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
  JobSnapshotsModel.nextToProcess = function(callback) {
    db.query(sqlQueries.obtainNextUnlockedJob, returnResult);

    function returnResult(err, result) {
      if(err) return callback(err);
      callback(null, result.rows[0]);
    }
  };

  JobSnapshotsModel.obtainLock = function(jobId, callback) {
    db.query(sqlQueries.obtainLockForJob, [jobId], gotResult);

    function gotResult(err, result) {
      if (err) return callback(err);
      callback(null, result.rows[0]);
    }
  };

  JobSnapshotsModel.startTxn = function(callback) {
    db.query('begin', callback);
  };

  JobSnapshotsModel.commitTxn = function(callback) {
    db.query('commit', callback);
  };

  JobSnapshotsModel.rollbackTxn = function(callback) {
    db.query('rollback', callback);
  };

  if (process.env.NODE_ENV === 'test') {
    JobSnapshotsModel.setJobs = function(newJobs, callback) {
      db.query('delete from job_snapshots', insertJobs);
      function insertJobs(err) {
        if (err) return callback(err);
        var query = job_snapshots.insert(newJobs).toQuery();
        db.query(query, callback);
      }
    };
    JobSnapshotsModel.getJobs = function(callback) {
      var query = job_snapshots.select(job_snapshots.star()).toQuery();
      db.query(query, function(err, result) {
        if (err) return callback(err);
        callback(null, result.rows);
      });
    };
  }

  return JobSnapshotsModel;
};

// vim: set et sw=2 ts=2 colorcolumn=80:
