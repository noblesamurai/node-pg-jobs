#!/bin/sh
while ! nc -z postgres 5432; do sleep 3; done
npm test
