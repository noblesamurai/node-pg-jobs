var sql = require('sql'),
    async = require('async'),
    expect = require('chai').expect;
    jobs =  require('../../models/jobs');

var db;
var jobsTable = sql.define({
    name: 'jobs',
    columns: ['id', 'process_next', 'pending', 'data', 'created_at' ]
});

function connectToDB(callback) {
  var pg = require('pg');

  db = new pg.Client(process.env.DATABASE_URL);
  db.connect(function(err) {
    if(err) {
      console.error('could not connect to postgres', err);
    }
    callback(err);
  });
}

describe('jobs model', function() {
  before(function(done) {
    connectToDB(done);
  });

  after(function() {
    db.end();
  });

  beforeEach(function(done) {
    console.log('nuking table');
    db.query('delete from jobs;', done);
  });


  describe('#write', function() {
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
  describe('#nextToProcess', function() {
    beforeEach(function(done) {
      var newJobs = [{
        id: 1,
        process_next: '2013-01-01',
        data: {one: "one"}
      },
      {
        id: 2,
        process_next: '2011-01-01',
        pending: false,
        data: {one: "one"}
      },
      {
        id: 3,
        process_next: '2012-01-01',
        data: {two: "two"}
      }];

      var query = jobsTable.insert(newJobs).toQuery();
      db.query(query, done);
    });

    it.only('gets the next job we should process', function(done) {
      jobs.nextToProcess(db, checkConditions);

      function checkConditions(err, job) {
        if (err) done(err);

        expect(job.id).to.equal(3);
        done();
      }
    });
  });
});

// vim: set et sw=2 ts=2 colorcolumn=80:
