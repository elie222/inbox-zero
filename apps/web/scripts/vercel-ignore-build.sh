#!/usr/bin/env bash

set -euo pipefail

if [[ "${VERCEL_ENV:-}" != "preview" ]]; then
  echo "Non-preview environment; continue build."
  exit 1
fi

current_sha="${VERCEL_GIT_COMMIT_SHA:-HEAD}"
previous_sha="${VERCEL_GIT_PREVIOUS_SHA:-}"

if [[ -z "${previous_sha}" ]]; then
  if git rev-parse --verify "${current_sha}^" >/dev/null 2>&1; then
    previous_sha="${current_sha}^"
  else
    echo "No previous commit found; continue build."
    exit 1
  fi
fi

if ! git rev-parse --verify "${previous_sha}" >/dev/null 2>&1; then
  echo "Previous commit ${previous_sha} is unavailable; continue build."
  exit 1
fi

changed_files="$(git diff --name-only "${previous_sha}" "${current_sha}")"

if [[ -z "${changed_files}" ]]; then
  echo "No changed files detected; skip build."
  exit 0
fi

non_docs_changes="$(printf '%s\n' "${changed_files}" | grep -Ev '(^docs/|\.md$|\.mdx$)' || true)"

if [[ -n "${non_docs_changes}" ]]; then
  echo "Non-doc changes detected; continue build."
  printf '%s\n' "${non_docs_changes}"
  exit 1
fi

echo "Only docs/markdown files changed; skip preview build."
exit 0
