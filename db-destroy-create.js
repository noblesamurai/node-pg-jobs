if (!process.env.NODE_ENV === 'test') process.exit(1);

require('pg-destroy-create-db')(process.env.DATABASE_URL)
  .destroyCreate( function(err) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log('db bounced...');
    process.exit();
});
