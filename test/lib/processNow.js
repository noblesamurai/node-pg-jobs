var Sinon = require('sinon'),
    expect = require('expect.js'),
    jobsModelTest = require('../../models/jobs_test'),
    jobs = require('../../lib/jobs')({ db: process.env.DATABASE_URL });

describe('#processNow', function() {
  it('unlocked job - immediately runs worker() on job with id, calls callback', function(done) {
    jobs.create({}, null, created);
    
    var worker = Sinon.stub().callsArgWith(2, null, {}, null);
    function created(err, id) {
      console.log('created');
      if (err) return done(err);

      jobs.processNow(id, worker, expectations);
    }

    function expectations(err) {
      if (err) return done(err);

      expect(worker.calledOnce).to.be(true);
      done();
    }
  });

  describe('when called on a locked job', function() {
    it('does locking correctly', function(done) {
      jobs.create({count: 0}, null, created);

      var worker = Sinon.spy(function(id, job, callback) {
        console.log(job);
        if (job.count < 9) {
          jobs.processNow(id, worker);
        } else if (job.count === 9) {
          jobs.processNow(id, worker, expectations);
        }
        callback(null, {count: job.count + 1}, null);
      });

      function created(err, id) {
        if (err) return done(err);

        jobs.processNow(id, worker);
      }

      function expectations(err) {
        if (err) return done(err);

        expect(worker.args[0][1]).to.eql({count: 0});
        expect(worker.args[1][1]).to.eql({count: 1});
        done();
      }
    });
  });

  describe('when called on a job that does not exist', function() {
    it('calls the callback with an error', function(done) {
      var iterator = Sinon.stub().throws(new Error('I should not be called.'));

      jobs.processNow(999, iterator, expectations);
      function expectations(err) {
        expect(err).to.be.ok();
        done();
      }
    });
  });

  describe('when the worker calls done() with an error', function() {
    it('calls the callback with an error', function(done) {
      var iterator = Sinon.stub().callsArgWith(2, 'yo');
      jobs.processNow(1, iterator, expectations);
      function expectations(err) {
        expect(err).to.equal('yo');
        done();
      }
    });
  });
});

// vim: set et sw=2 ts=2 colorcolumn=80:
