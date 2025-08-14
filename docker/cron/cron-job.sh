#!/bin/sh
curl -H "Authorization: Bearer $CRON_SECRET" http://web:3000/api/google/watch/all
