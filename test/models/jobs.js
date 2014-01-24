
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

    it('creates a new job on the db', function(done) {
      function getJobCount(callback) {
        var sql = jobsTable.select(jobsTable.count()).from(jobsTable).toQuery();
        db.query(sql, callback);
      }

      function getMaxId(callback) {
        db.query('select max(id) as max_id from jobs;', callback);
      }

      function runTest(callback) {
        jobs.write(db, null, new Date(), {one: 1}, callback);
      }

      async.series({
        initJobCount: getJobCount,
        runTest:      runTest,
        finalJobCount: getJobCount,
        maxId: getMaxId
      }, function(err, results) {
        if (err) done(err);
        console.log('results');
        console.log(results);
        expect(parseInt(results.initJobCount.rows[0].jobs_count, 10) + 1).to.
          equal(parseInt(results.finalJobCount.rows[0].jobs_count,10));
        expect(results.maxId.rows[0].max_id).to.be.a('number');
        done();
      });
    });
  });
});

// vim: set et sw=2 ts=2 colorcolumn=80:
