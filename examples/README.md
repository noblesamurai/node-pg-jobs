Create the example database...

```shell
../node_modules/db-migrate/bin/db-migrate up -m ../migrations/ --config ../database.json -e example
```

Create jobs...

```shell
DATABASE_URL=http://localhost:5432/node_pg_jobs_example node ./create
DATABASE_URL=http://localhost:5432/node_pg_jobs_example node ./create 500
```

Process jobs...
```shell
DATABASE_URL=http://localhost:5432/node_pg_jobs_example node ./process
```
