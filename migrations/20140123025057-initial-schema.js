var dbm = require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
  var sql =
    "CREATE TABLE jobs( " +
        "id            serial," + // i.e. not unique but will self increment if null
        "process_next  timestamp with time zone," +
        "pending       boolean default true," +
        "data          json," +
        "created_at    timestamp NOT NULL DEFAULT now()" +
    ");";

  db.runSql(sql, callback);

};

exports.down = function(db, callback) {
  db.dropTable('jobs', callback); 
};

// vim: set et sw=2 ts=2 colorcolumn=80:
