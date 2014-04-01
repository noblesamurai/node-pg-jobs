var sql = require('sql');

var job_snapshots = sql.define({
    name: 'job_snapshots',
    columns: ['id', 'job_id', 'process_at', 'processed', 'data', 'created_at' ]
});

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
// vim: set et sw=2 ts=2 colorcolumn=80:
