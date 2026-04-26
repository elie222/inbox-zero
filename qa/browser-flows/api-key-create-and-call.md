---
id: api-key-create-and-call
title: "Create API key and call the API"
group: api
priority: low
resources:
  - api-keys
parallel_safe: true
---

## Goal

Verify the full API key lifecycle: create a key via the UI, call an API endpoint with it, and confirm auth works.

## Preconditions

- Signed into Inbox Zero as a test account.
- `NEXT_PUBLIC_EXTERNAL_API_ENABLED=true` is set in `.env`.
- At least one email account connected.

## Steps

1. Open the Settings page.
2. Scroll to the Developer section — confirm "API Keys" row is visible.
3. Click "Create key".
4. Verify the modal shows an email account selector (if multiple accounts exist) and the Create button is enabled.
5. Fill in a name (e.g., "qa-test-key"), leave all permissions checked, click Create.
6. Confirm success toast and the secret key is displayed.
7. Copy the secret key.
8. Call `GET /api/v1/stats/by-period` with the key in the `API-Key` header — verify a 200 response with stats data.
9. Call the same endpoint with an invalid key — verify a 401 "Invalid API key" response.
10. Close the modal, click "View keys", and confirm the new key appears in the list.
11. Click "Revoke" on the test key.
12. Call the API again with the revoked key — verify it's rejected.

## Expected results

- API key is created and displayed once.
- Valid key returns stats data.
- Invalid/revoked key returns auth error.
- Key appears in the keys list and can be revoked.

## Failure indicators

- Create button is disabled (email account not resolved).
- "External API is not enabled" error (env var missing).
- API call hangs or returns 500.
- Revoked key still works.

## Cleanup

- Revoke the test API key if not already done in step 11.
