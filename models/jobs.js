var sql = require('sql');
var jobs = sql.define({
    name: 'jobs',
    columns: ['id', 'process_next', 'pending', 'data', 'created_at' ]
});
/**
 * @param {function} callback(err, jobId)
 */
exports.write = function(db, id, processNext, data, callback) {
  db.query(
    jobs.insert([{
      id: id,
      process_next: processNext.toISOString(),
      data: data
    }]),
    function(err, result) {
    }
  );
};

exports.readLatest = function(db, id) {};

exports.readHistory = function(db, id) {};

exports.nextToProcess = function(db, callback) {
  db.query(
    jobs.select(jobs.id, jobs.data).from(jobs).where(jobs.pending.equals(true)).
      limit(1),
    function(err, result) {
    }
  );
};

// vim: set et sw=2 ts=2 colorcolumn=80:
