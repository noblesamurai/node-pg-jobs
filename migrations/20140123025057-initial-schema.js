var dbm = require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
  var sql =
    "CREATE SEQUENCE jobs_id_seq;" +
    "CREATE TABLE jobs( " +
        "id            integer DEFAULT nextval('jobs_id_seq')," + // i.e. not unique but will self increment if null
        "process_at    timestamp with time zone," +
        "processed     timestamp with time zone," +
        "data          json," +
        "created_at    timestamp NOT NULL DEFAULT now()" +
    ");" +
    "ALTER SEQUENCE jobs_id_seq OWNED BY jobs.id;";

  db.runSql(sql, callback);

};

exports.down = function(db, callback) {
  db.dropTable('jobs', callback);
};

// vim: set et sw=2 ts=2 colorcolumn=80:
