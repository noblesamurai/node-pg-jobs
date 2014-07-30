exports.obtainNextUnlockedJob =
  // Cf the PG doco on "WITH RECURSIVE" to understand this.
  // http://www.postgresql.org/docs/9.3/static/queries-with.html. Note that it
  // is a little confusing and slightly inaccurate at time of writing.

  // A temp table (referred to as candidate_job below) is initially populated with
  // the first job that requires service.
  // Then, the second ("recursive") section is run repeatedly until we either
  // have been through the whole table or have managed to lock a job.
  // The final select section at the end runs when the "recursive" section
  // did not add any row to the temp table last time it ran.
    "WITH RECURSIVE candidate_job AS (" +
    // Run this first, see whether the first one is locked.
    // Row will come into the temp table along with whether locked.
    // We have to nest the query as the limit will not necessarily
    // be applied before the lock if we do it all in one, hence
    // we could then lock unforseen jobs.
    "SELECT (j).*, pg_try_advisory_lock((j).id) AS locked " +
    "FROM ( " +
      "SELECT j " +
      "FROM job_snapshots AS j " +
      "WHERE process_at IS NOT NULL AND process_at <= now() AND processed IS NULL " +
      "ORDER BY process_at, id " +
      "LIMIT 1 " +
    ") AS t1 " +
    // This will keep outputting a new row whilst ever the last row in the
    // temp table was not successfully locked. It will replace what is in the
    // temp table.
    "UNION ALL ( " +
      "SELECT (j).*, pg_try_advisory_xact_lock((j).id) AS locked " +
      "FROM ( " +
        "SELECT ( " +
          "SELECT j " +
          "FROM job_snapshots AS j " +
          "WHERE process_at IS NOT NULL AND process_at <= now() AND processed IS NULL " +
          // Get the next one in line after the one we tried to lock.
          "AND (process_at, id) > (candidate_job.process_at, candidate_job.id) " +
          "ORDER BY process_at, id " +
          "LIMIT 1 " +
        ") AS j " +
        "FROM candidate_job " +
        // Only output the row for next iteration iff we did NOT obtain a lock.
        // Else, the row that we did manage to lock is left in the temp table
        // for the query below to pick up.
        "WHERE NOT candidate_job.locked " +
        "LIMIT 1 " +
      ") AS t1 " +
    ") " +
  ") " +
  // We should just be left with the job we managed to lock, or we went through
  // them all and couldn't lock one, in which case we'll be left with the last
  // one we couldn't. (Hence the "where locked" so we get an empty result set
  // in that case).
  "UPDATE job_snapshots " +
  "SET processed = NOW() " +
  "WHERE id IN (SELECT id FROM candidate_job where locked) " +
  "RETURNING *";

exports.unlockJob = "SELECT pg_advisory_unlock($1);";

exports.obtainLockForJob =
  "UPDATE job_snapshots " +
  "SET processed = NOW() " +
  "WHERE job_id = $1 AND processed IS NULL " +
  "RETURNING *, pg_advisory_xact_lock(id);";

// vim: set et sw=2 ts=2 colorcolumn=80:
