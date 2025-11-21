#!/bin/sh

FROM=$1
TO=$2

if [ -z "$FROM" ] || [ -z "$TO" ]; then
    echo "Usage: $0 <PLACEHOLDER> <VALUE>"
    exit 1
fi

if [ "${FROM}" = "${TO}" ]; then
    echo "Nothing to replace, the value is already set to ${TO}."
    exit 0
fi

echo "Replacing all statically built instances of $FROM with $TO."

# We use || true to prevent the script from exiting if no files are found (egrep returns 1)
for file in $(egrep -r -l "${FROM}" apps/web/.next/ apps/web/public/ || true); do
    sed -i -e "s|$FROM|$TO|g" "$file"
done
