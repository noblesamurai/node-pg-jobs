var dbm = require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
  var sql =
    "CREATE SEQUENCE job_snapshots_job_id_seq;" +
    "CREATE TABLE job_snapshots( " +
        "id            serial PRIMARY KEY, " +
        "job_id        integer DEFAULT nextval('job_snapshots_job_id_seq')," + // i.e. not unique but will self increment if null
        "process_at    timestamp with time zone," +
        "processed     timestamp with time zone," +
        "data          json," +
        "created_at    timestamp with time zone NOT NULL DEFAULT now()" +
    ");" +
    "ALTER SEQUENCE job_snapshots_job_id_seq OWNED BY job_snapshots.job_id;";

  db.runSql(sql, callback);

};

exports.down = function(db, callback) {
  db.dropTable('job_snapshots', callback);
};

// vim: set et sw=2 ts=2 colorcolumn=80:
