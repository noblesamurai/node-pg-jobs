var sql = require('sql');
var jobs = sql.define({
    name: 'jobs',
    columns: ['id', 'process_next', 'pending', 'data', 'created_at' ]
});
/**
 * @param {function} callback(err, jobId)
 */
exports.write = function(db, id, processNext, data, callback) {
  var newJob = {
      process_next: processNext.toISOString(),
      data: data
    };

  // We let the DB assign the ID if it is null
  if(id !== null) {
    newJob.id = id;
  }

  db.query(
    jobs.insert([newJob]).toQuery(),
    callback
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
