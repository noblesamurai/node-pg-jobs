var dbm = require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
  var sql =
    "CREATE INDEX process_at_id_waiting_jobs " +
    "ON job_snapshots(process_at, id) " +
    "WHERE process_at IS NOT NULL AND processed IS NULL;";

  db.runSql(sql, callback);

};

exports.down = function(db, callback) {
  var sql = "DROP INDEX process_at_id_waiting_jobs";

  db.runSql(sql, callback);

};
