#!/bin/sh

PLACEHOLDER=$1
VALUE=${2-}

if [ -z "$PLACEHOLDER" ] || [ "$#" -lt 2 ]; then
    echo "Usage: $0 <PLACEHOLDER> <VALUE>"
    exit 1
fi

if [ "${PLACEHOLDER}" = "${VALUE}" ]; then
    echo "Nothing to replace, the value is already set to ${VALUE}."
    exit 0
fi

if [ -z "$VALUE" ]; then
    echo "Replacing all statically built instances of $PLACEHOLDER with an empty value."
else
    echo "Replacing all statically built instances of $PLACEHOLDER with $VALUE."
fi

ESCAPED_VALUE=$(printf '%s' "$VALUE" | sed -e 's/[\\&|]/\\&/g')
SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)

# We use || true to prevent the script from exiting if no files are found (egrep returns 1)
for file in $(egrep -r -l "${PLACEHOLDER}" apps/web/.next/ apps/web/public/ || true); do
    case "$file" in
    # Prerendered pages carry React Server Components payloads with byte-length
    # prefixes that a plain substitution would leave stale. If the rewrite
    # fails, keep the file as built: a stale placeholder still renders, while a
    # sed-corrupted payload breaks the page.
    *.rsc | *.html)
        node "$SCRIPT_DIR/replace-in-prerender.mjs" "$file" "$PLACEHOLDER" "$VALUE" ||
            echo "Warning: could not replace $PLACEHOLDER in $file" >&2
        ;;
    *) sed -i -e "s|$PLACEHOLDER|$ESCAPED_VALUE|g" "$file" ;;
    esac
done
