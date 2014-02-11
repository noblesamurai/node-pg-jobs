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
   * @param {function} callback(err, jobId)
   */
  JobSnapshotsModel.write = function(jobId, processNext, data, callback) {
    var newJob = {
        process_at: processNext ? processNext.toISOString() : null,
        data: data
      };

    // We let the DB assign the ID if it is null
    if(jobId !== null) {
      newJob.job_id = jobId;
    }

    var sql = job_snapshots.insert([newJob]).toQuery();
    db.query(sql, callback);
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
      var query = job_snapshots.select(job_snapshots.star()).order(job_snapshots.id).toQuery();
      db.query(query, function(err, result) {
        if (err) return callback(err);
        callback(null, result.rows);
      });
    };
  }

  return JobSnapshotsModel;
};

// vim: set et sw=2 ts=2 colorcolumn=80:
