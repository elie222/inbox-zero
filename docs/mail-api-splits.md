# Split inbox REST API

Base path: `/api/mail/v1/accounts/{accountId}/splits`.

These installed-client routes use the same `withEmailProvider` middleware as
other account-scoped mail v1 routes. Send the normal authenticated session or
bearer credentials and the `X-Email-Account-ID` header. The header account must
belong to the authenticated user and match `{accountId}`. The path alone does
not authorize access.

| Method | Path suffix | JSON request |
| --- | --- | --- |
| POST | (base path) | `{ "name": "Unread", "filters": [{ "kind": "UNREAD", "value": null }], "matchAll": true }` or `{ "presetId": "Receipts" }` |
| PATCH | `/{splitId}` | `{ "name": "Receipts", "filters": [{ "kind": "LABEL", "value": "provider-label-id" }], "matchAll": true }` |
| DELETE | `/{splitId}` | No body |
| POST | `/reorder` | `{ "ids": ["split-2", "split-1"] }` |
| GET | `/presets` | No body |

Every successful mutation returns HTTP 200 with
`{ "protocolVersion": 1, "requestId": "...", "splits": [...] }`.
Each split has `{ id, name, order, matchAll, filters: [{ kind, value }] }`,
exactly the `splits` array from `/api/mail/settings`, including the synthetic
All tab for older accounts. Use the returned array to replace local settings.
The existing settings endpoint's response is unchanged.

Create and update use the existing web action schemas in
`apps/web/utils/actions/mail-split.validation.ts`. PATCH replaces the name and
entire filter list; it is not a partial field patch. Its ID comes from the path,
not the body. `matchAll` defaults to true on both create and update. Names are
trimmed and must contain 1–60 characters. There are at most 10 filters per split
and 14 persisted splits per account. Filter kinds are `LABEL`, `CATEGORY`,
`FROM`, `UNREAD`, `STARRED`, and `OLDER_THAN`; value requirements and allowed age
values follow `split-filters.ts` and `split-query.ts`. Multiple distinct senders
or both Outlook inbox sections require `matchAll: false`. As on web, the action
schemas allow an empty filter list; such a split cannot later be deleted.

DELETE uses the web action's account-scoped deletion and lock. Filterless
splits (including All) are rejected with `Split not found or cannot be removed`.
Unknown IDs and IDs in another account receive that same error. Reorder accepts
1–14 unique nonempty IDs. It reorders only the account's selected slots,
preserving omitted splits' positions; unknown/foreign IDs are ignored just as
in the web action. Include the persisted All ID when ordering its slot; the
synthetic `all` ID is not persisted.

## Presets

GET `/presets` returns
`{ "protocolVersion": 1, "requestId": "...", "presets": [...] }`.
Each preset has:

```json
{
  "presetId": "Receipts",
  "name": "Receipts",
  "description": "Payments, payouts and invoices.",
  "category": "General",
  "matchAll": true,
  "filters": [{ "kind": "LABEL", "value": "account-label-id" }],
  "createsSystemType": null,
  "added": true,
  "splitId": "existing-split-id"
}
```

`presetId` is the catalogue entry name; use the exact value returned by GET.
POST with `presetId` resolves the current account's labels again rather than
trusting client label IDs. Ordinary presets use the same create operation as
the web action, including duplicate-name and split-limit errors.

Availability follows web's Add from library: user labels are sorted and matched
case-insensitively by name (including hidden labels), Gmail's Important label is
added explicitly, and Starred is hidden for Microsoft. Missing-label presets
are hidden, except opt-in system-rule presets. The current catalogue has no
native-category conditions. The shared web matcher marks an ordinary preset
added only when its name, conjunction, and unordered filters match an existing
split. System-rule presets match by case-insensitive split name. `splitId` is
null when not added.

OTP has `createsSystemType: "OTP"` and may have `filters: []` before its label
exists. POST `{ "presetId": "OTP" }` calls the same shared toggle function as
`toggleRuleAction`, enabling or creating the account's OTP rule and its default
split. It does not make a separate custom split or invoke an LLM. Existing web
toggle semantics remain intact, including its best-effort default-split setup;
a successful toggle may therefore return no new split if that setup fails or
the split limit is reached. Inspect the returned split list.

DELETE removes a split using the same action as web's tab removal; it does not
disable its rule. For an existing rule, the existing
`POST /api/mobile/rules/{id}/toggle` endpoint accepts `{ "enabled": false }`
(or true). That endpoint requires the rule ID and cannot create a missing system
rule. Use create-from-preset for first-time OTP setup. Clients that also want
the rule disabled must toggle the rule separately from deleting the split.

## Errors and versioning

Send `X-Request-ID` or `?requestId=...` for correlation. The server generates an
ID if omitted. Optional `protocolVersion` in POST/PATCH JSON or in a query must
be 1; unsupported versions return HTTP 409 with `unsupported_version`.

Validation errors and safe mutation failures return HTTP 400 with the mail v1
error envelope:

```json
{
  "protocolVersion": 1,
  "requestId": "...",
  "error": { "code": "invalid", "retryable": false, "retryAfterMs": null }
}
```

Safe mutation failures additionally include `error.message` with the same
user-safe message as the web action. Account path/header mismatches and
mismatched `accountId` fields in request bodies return HTTP 403 with the same
envelope and `code: "forbidden"`. Malformed JSON is invalid. Authentication,
account ownership, provider initialization, and unexpected errors retain the
existing middleware responses (for example 401
`{ "error": "Unauthorized", "isKnownError": true }`); clients must handle these
as well as protocol envelopes. No migrations or schema changes are required.
