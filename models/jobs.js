var sql = require('sql');
var jobs = sql.define({
    name: 'jobs',
    columns: ['id', 'process_at', 'processed', 'data', 'created_at' ]
});

var sqlQueries = require('./sql');
/**
 * @param {function} callback(err, jobId)
 */
exports.write = function(db, id, processNext, data, callback) {
  var newJob = {
      process_at: processNext.toISOString(),
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


// vim: set et sw=2 ts=2 colorcolumn=80:
