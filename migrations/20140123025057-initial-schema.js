var dbm = require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
  var sql =
    "CREATE TABLE jobs (" +
        "id           integer PRIMARY KEY," +
        "process_next timestamp with time zone," +
        "created_at   timestamp with time zone," +
        "modified_at  timestamp with time zone" +
    "); " +
    "CREATE TABLE job_data ( " +
        "job_id       integer," +
        "data         json," +
        "created_at   timestamp with time zone" +
    ");";

  db.runSql(sql, callback);

};

exports.down = function(db, callback) {
  db.dropTable('jobs', function() {
    db.dropTable('job_data', callback);
  });

};

// vim: set et sw=2 ts=2 colorcolumn=80:
