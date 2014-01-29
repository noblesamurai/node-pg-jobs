var sql = require('sql'),
    async = require('async'),
    expect = require('chai').expect,
    testHelper = require('../helper'),
    jobsModel =  require('../../models/jobs');

var dbConnections = [];

describe('jobs model', function() {
  beforeEach(function(done) {
    async.times(2, testHelper.connectToDB, function(err, results) {
      if (err) return done(err);
      db = results[0];
      db2 = results[1];
      db.query('delete from job_snapshots', done);
    });
  });

  afterEach(function() {
    db.end();
    db2.end();
  });

  describe('#write', function() {
    function parseSingleIntDBResult(result) {
      return parseInt(result.rows[0].value, 10);
    }

    function getJobCount(callback) {
      var sql = 'select count(*) as value from job_snapshots;';
      db.query(sql, parseResult);

      function parseResult(err, result) {
        if (err) callback(err);
        callback(null, parseSingleIntDBResult(result));
      }
    }

    function getMaxId(callback) {
      db.query('select max(job_id) as value from job_snapshots;', parseResult);

      function parseResult(err, result) {
        if (err) callback(err);
        callback(null, parseSingleIntDBResult(result));
      }
    }

    it('creates a new job on the db with auto id if job_id=null', function(done) {
      async.series({
        runTest: runTest,
        finalJobCount: getJobCount,
        maxId: getMaxId
      },
      checkConditions);

      function runTest(callback) {
        jobsModel.write(db, null, new Date(), {one: 1}, callback);
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
        jobsModel.write(db, 0, new Date(), {one: 1}, callback);
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
        job_id: 1,
        process_at: '2013-01-01',
        data: {one: "one"}
      },
      {
        job_id: 2,
        process_at: '2011-01-01',
        processed: '2011-01-01 01:00:00',
        data: {one: "one"}
      },
      {
        job_id: 3,
        process_at: '2012-01-01',
        data: {two: "two"}
      },
      {
        job_id: 4,
        process_at: null,
        data: {two: "two"}
      }];

      jobsModel.setJobs(db, newJobs, done);
    });

    it('gets the next job we should process', function(done) {
      jobsModel.nextToProcess(db, checkConditions);

      function checkConditions(err, job) {
        if (err) done(err);

        expect(job.job_id).to.equal(3);
        done();
      }
    });
    it('does not get the same job twice', function(done) {
      // Start a txn and leave it hanging.
      db.query('begin', function(err) {
        if (err) return done(err);
        jobsModel.nextToProcess(db, runAgain);
      });

      function runAgain(err) {
        if (err) done(err);
        jobsModel.nextToProcess(db2, checkConditions);
      }

      function checkConditions(err, job) {
        if (err) done(err);

        expect(job.job_id).to.equal(1);
        done();
      }
    });
  });
});

// vim: set et sw=2 ts=2 colorcolumn=80:
