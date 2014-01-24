
describe('jobs model', function() {
  var sql = require('sql'),
      async = require('async'),
      expect = require('chai').expect;
      jobs =  require('../../models/jobs');

  var db;
  var jobsTable = sql.define({
      name: 'jobs',
      columns: ['id', 'process_next', 'pending', 'data', 'created_at' ]
  });

  before(function(done) {
    var pg = require('pg');

    db = new pg.Client(process.env.DATABASE_URL);
    db.connect(function(err) {
      if(err) {
        console.error('could not connect to postgres', err);
      }
      done(err);
    });
  });
  after(function() {
    db.end();
  });
  describe('#write', function() {
    beforeEach(function(done) {
      db.query('delete from jobs;', done);
    });

    function parseSingleIntDBResult(result) {
      return parseInt(result.rows[0].value, 10);
    }

    function getJobCount(callback) {
      var sql = 'select count(*) as value from jobs;';
      db.query(sql, parseResult);

      function parseResult(err, result) {
        if (err) callback(err);
        callback(null, parseSingleIntDBResult(result));
      }
    }

    function getMaxId(callback) {
      db.query('select max(id) as value from jobs;', parseResult);

      function parseResult(err, result) {
        if (err) callback(err);
        callback(null, parseSingleIntDBResult(result));
      }
    }

    it('creates a new job on the db with auto id if id=null', function(done) {
      async.series({
        runTest:      runTest,
        finalJobCount: getJobCount,
        maxId: getMaxId
      },
      checkConditions);

      function runTest(callback) {
        jobs.write(db, null, new Date(), {one: 1}, callback);
      }

      function checkConditions (err, results) {
        if (err) done(err);

        // We wrote the job
        expect(results.finalJobCount).to.equal(1);

        // It got assign an integer ID
        expect(results.maxId).to.be.a('number');
        done();
      }
    });

    it('writes a new job snapshot on the db when giving id', function(done) {
      async.series({
        runTest:      runTest,
        finalJobCount: getJobCount,
        maxId: getMaxId
      },
      checkConditions);

      function runTest(callback) {
        jobs.write(db, 0, new Date(), {one: 1}, callback);
      }

      function checkConditions (err, results) {
        if (err) done(err);

        // We wrote the job
        expect(results.finalJobCount).to.equal(1);

        // It got assigned the id we requested
        expect(results.maxId).to.equal(0);
        done();
      }
    });
  });
});

// vim: set et sw=2 ts=2 colorcolumn=80:
