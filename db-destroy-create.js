if (!process.env.NODE_ENV === 'test') process.exit(1);

require('pg-destroy-create-db')(process.env.DATABASE_URL)
  .destroyCreate( function( error ){
    process.exit();
})
