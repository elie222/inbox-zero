#!/bin/sh
# Assumes the image was built with:
# docker build . -f docker/Dockerfile.prod --build-arg NEXT_PUBLIC_BASE_URL=http://bDn05eu06Wxq:80 -t ghcr.io/colinmollenhour/inbox-zero:latest

set -e

# Replace NEXT_PUBLIC_* placeholders with actual runtime values
if [ -d /app/apps/web/.next ]; then
  printenv | grep NEXT_PUBLIC_BASE_URL | while read -r line; do
    key=$(echo "$line" | cut -d "=" -f1)
    value=$(echo "$line" | cut -d "=" -f2)
    
    # Replace the placeholder base url (http://bDn05eu06Wxq:80) with actual value
    # Search in .next directory for compiled files
    find /app/apps/web/.next -type f \( -name "*.js" -o -name "*.json" \) \
      -exec sed -i "s|http://bDn05eu06Wxq:80|${value}|g" {} +
  done
fi

# Execute the CMD
exec "$@"
