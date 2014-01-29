/**
 * @param {int} number Not used.  Just there so this fits the signature wanted
 *                     by async.times().
 */
exports.connectToDB = function(number, callback) {
  var pg = require('pg');

  var db = new pg.Client(process.env.DATABASE_URL);
  db.connect(function(err) {
    if(err) return callback(err);
    callback(null, db);
  });
};

// vim: set et sw=2 ts=2 colorcolumn=80:
