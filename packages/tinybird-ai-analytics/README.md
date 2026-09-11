# Tinybird AI Analytics

This package contains the TypeScript client for publishing and querying AI
analytics. The Tinybird data sources and endpoints are part of the canonical
Forward project documented in [`../tinybird`](../tinybird/README.md).

Run all Tinybird CLI commands from `packages/tinybird/project` so the complete
workspace is validated and deployed together.

## AI Cost Fields

- `cost`: platform-paid estimated cost from our local pricing table (user API key traffic is `0`)
- `estimatedCost`: estimated cost regardless of who paid, from our local pricing table
- `providerReportedCost`: exact provider-reported cost when available
- `providerUpstreamInferenceCost`: exact upstream provider cost when available
- `providerCostSource`: internal source key describing how provider-side cost was derived
- `isUserApiKey`: `1` for user-provided API keys, `0` for platform keys
- `stepCount`: total number of steps reported by the AI SDK result
- `toolCallCount`: total number of tool calls across all reported steps
- Legacy rows (before this schema change) have `NULL` for `estimatedCost` and `isUserApiKey`
