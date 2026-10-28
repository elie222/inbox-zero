# Better Auth 1.7 deployment checklist

All Better Auth packages are aligned on 1.7.4 to fix the OAuth provider resource-binding vulnerability. This is an authentication and identity migration, not just a dependency update. Follow the [upstream upgrade guide](https://better-auth.com/docs/guides/1-7-upgrade-guide).

## Before accepting traffic

1. Back up authentication and provisioning tables. Pause sign-in, account linking, and SCIM provisioning during the cutover. Rehearse on a disposable database copy.
2. Inventory `Account` rows whose `provider` is `microsoft`. Better Auth now identifies Microsoft accounts by verified directory `oid`, rather than pairwise `sub`. Obtain a reviewed mapping from each local account ID and old `providerAccountId` to its verified `oid`, using verified stored ID tokens or a trusted Entra export. Update only rows matching both the reviewed local ID and old subject, checking uniqueness and affected counts. Never infer this mapping from email. Do not resume Microsoft sign-in until all existing identities are reconciled. No Microsoft data is changed automatically by this migration.
3. Review stored `ssoProvider.samlConfig` and `oidcConfig`. Custom `mapping.id` identities must be reconciled to signed SAML NameID or verified OIDC sub. For SAML, set `samlConfig.issuer` to the existing SP entity ID, remove an old ACS URL used as `callbackUrl`, and update SP metadata and the IdP ACS setting to `/api/auth/sso/saml2/sp/acs/{providerId}`. Preserve the existing SP entity ID and assertion audience. Test an existing user's sign-in; do not use email fallback to reconcile identities.
4. Complete the SCIM steps below if legacy `scimProvider` rows exist. The SQL migration deliberately refuses to drop a populated legacy table. Resolve this preflight before running migrations; do not bypass the guard against live provisioning data.
5. Apply the Prisma migrations and deploy the matching application together. The OAuth schema adds resource policies, client-resource bindings, assertions, and token resource bindings. The MCP feature remains disabled by default. Any clients registered against the unshipped 1.6 MCP implementation should reconnect and re-register after cutover.
6. Test existing Google, Microsoft, Apple, SAML, and provisioned-user logins applicable to the deployment; test deprovisioning and MCP consent, refresh, and revocation before resuming traffic.

## Legacy SCIM cutover

The 1.7 plugin does not convert legacy credentials or SCIM-created accounts. Export the legacy provider records and review all provisioned users and authentication accounts before removing legacy records. Preserve application users and legitimate login accounts; do not bulk-delete accounts by email or provider name.

After the reviewed legacy connection records have been retired, apply the migration. Set a new independent `SCIM_CREDENTIAL_HASH_SECRET` of at least 32 characters. Do not reuse the old bearer tokens, their encoding, or their hashes.

Open `/admin` → **SCIM provisioning**, enter the registered SSO provider ID and an explicit expiry, and select **Create SCIM connection**. Record the returned connection and credential IDs securely. The token is returned only at creation; configure it in the IdP without logging it. The action grants only SCIM Users read/write access. Revoke credentials in the same admin section; replacement connections require their own reviewed identity mappings.

Before reprovisioning existing users, populate `ScimIdentityLink` with the new connection ID, the IdP's immutable external ID, and the reviewed local user ID. Unmapped identities are created; they are never linked by matching email. Run full reprovisioning and verify that existing users retain the correct application identity. SCIM does not create authentication accounts or project organization roles. Existing application memberships must be reviewed separately.

Deprovisioning records `User.scimAccessDisabled` and deletes sessions transactionally. New session creation rejects disabled users. Reprovisioning an active identity clears the disabled flag. Existing session cookies may remain cached until the configured cookie cache expires, so include that interval in access-revocation checks.

## Rollback

Keep traffic paused if any identity or schema check fails. Restore the coordinated database and application backup; do not run the 1.6 application against the new SCIM schema. Keep the MCP server disabled on an unpatched version.
