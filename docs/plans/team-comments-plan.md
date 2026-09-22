# Team comments on email — implementation plan

Build private team discussions attached to shared email conversations in the web app for existing organization members, including teammates who did not receive the email.

## Product scope

1. Add Comments and Share to the email reader. Once shared, show participant avatars and a comment count.
2. Share through a dialog that selects teammates and explains that they will see the publisher's past and future messages in that conversation, including branches with changed recipients. Typing a mention or cancelling grants no access.
3. Show discussion below email history. Use a distinct Internal comment composer with Post comment, plain text, links, and structured mentions. Display the audience. All participants see all comments; mentions direct attention, not private messages.
4. Add Shared with me and Activity views. Shared links require authentication and explicit participation. A teammate can read and comment without accessing the publisher's mailbox.
5. Support deleting one's own comments, publisher managed participants, stop and restart sharing, unread discussion state, and mute. Email unread state stays separate.
6. Show posting, success, failure/retry, offline, revoked, and email unavailable states. Preserve unsent text on transient failure; retries must not duplicate posts. Disable posting offline.

Mute retains history and activity but suppresses attention badges, including mentions. Unmuting restores unread indicators.

Exclude guests, public access, comment editing, reactions, nested discussions, comment attachments, assignments, shared drafts, AI participation, and a separate desktop transport.

## Access and lifecycle

- The publisher's connected account supplies one provider conversation. Share sent and received messages only. Exclude drafts, Bcc metadata, mailbox labels, raw headers, assistant state, and unrelated conversations. Sensitive text already present in an email body is not automatically redacted.
- Share current and future messages in that provider conversation. Do not merge participants' other mailbox copies, match by subject, or automatically grant access to email recipients.
- Participants receive read and comment rights only. They cannot send, forward, archive, or delete through the publisher's account. The publisher replies using the existing mailbox composer.
- Validate the authenticated user's ownership of the explicitly selected organization membership. Membership is tied to an email account; never choose the first account implicitly. Organization administrators have no automatic conversation access.
- Only the publisher can add/remove participants and stop/restart sharing. Stop revokes all grants. Restart requires explicit participant selection, a new access generation, and disclosure that retained discussion history will be visible. Old links and grants do not restore access.
- Membership deletion invalidates grants. Rejoining creates a new membership identity and restores nothing. Preserve historical comments and mentions as non-authorizing tombstones without retaining unnecessary personal details.
- Publisher connection failure leaves authorized comments accessible but makes email content unavailable. Publisher membership removal or account deletion revokes the share; never transfer ownership automatically.
- Check access on content, comments, activity, participants, attachments, and subscriptions. Recheck after slow provider fetches. Revocation clears client state and rejects delayed responses from obsolete identities and generations; already delivered or downloaded content cannot be recalled.
- Keep internal comments and collaboration metadata out of email recipients, outgoing MIME, and assistant context.

## Module structure

Keep the feature server owned in the existing application. Routes and actions are thin adapters; feature functions own authorization, persistence, and provider access. Use direct imports and ordinary functions. Avoid barrel files, generic repository/manager layers, and empty scaffolding.

```text
apps/web/utils/team-comments/
  access.ts
  conversations.ts
  comments.ts
  content.ts
  activity.ts
  events.ts
  types.ts
apps/web/utils/actions/
  team-comments.ts
  team-comments.validation.ts
apps/web/components/team-comments/
  ConversationDiscussion.tsx
  CommentComposer.tsx
  ShareConversationDialog.tsx
  ConversationParticipants.tsx
  use-conversation-discussion.ts
apps/web/app/(app)/shared/
  page.tsx
  SharedConversationList.tsx
  activity/page.tsx
  activity/ConversationActivity.tsx
  [conversationId]/page.tsx
  [conversationId]/SharedConversationReader.tsx
apps/web/app/api/team-comments/
  conversations/route.ts
  conversations/[conversationId]/route.ts
  conversations/[conversationId]/messages/route.ts
  conversations/[conversationId]/comments/route.ts
  conversations/[conversationId]/attachments/[attachmentRef]/route.ts
  activity/route.ts
  stream/route.ts
```

Integrate discussion into `apps/web/app/(app)/[emailAccountId]/mail/ThreadReader.tsx`. Reuse `MailMessageBody` from `packages/mail-ui/src/MailBody.tsx` for the shared reader; keep remote images off by default. Do not mount the account bound `EmailThread` using publisher context or add fake mailbox mutation handlers to the shared reader. Keep comments, grants, and shared content out of personal assistant Chat tables and the local `mail-core`, `mail-react`, and `mail-sqlite` engine. `M` already opens More actions; register a conflict free shortcut centrally.

## Data and service contracts

| Record | Responsibilities |
| --- | --- |
| SharedConversation | Organization, publisher account and membership, provider conversation reference, status, revision, access generation. Unique organization, publisher account, provider conversation. |
| ConversationParticipant | Exact membership incarnation, generation, grant status, monotonic read revision, mute. Include publisher's grant. |
| ConversationComment | Stable author identity, nullable membership reference/tombstone, body, structured mentions, committed revision, deletion state. Member removal must not cascade delete comments. |
| Mutation receipt | Idempotency key scoped to conversation and actor, canonical request identity, result reference. |
| Participant activity | Durable invitation/mention/unread state. Resolve previews from currently authorized comments rather than copying deleted bodies into notifications. |

Services: `shareConversation(actor, { source, participantMemberIds, clientMutationId })`, `getSharedConversation(actor, conversationId)`, `getSharedMessages(actor, conversationId)`, `postComment(actor, { conversationId, body, mentionedMemberIds, clientMutationId })`, `getComments(actor, { conversationId, cursor, limit })`, `deleteComment(actor, { conversationId, commentId, clientMutationId })`, `setParticipantAccess(actor, { conversationId, memberId, access, clientMutationId })`, `stopSharing(actor, { conversationId, clientMutationId })`, `markConversationRead(actor, { conversationId, throughRevision })`, `setConversationMuted(actor, { conversationId, muted })`, and `getConversationActivity(actor, { cursor, limit })`.

Share explicitly handles creation versus restart. Mentions target active participants and never grant access. Share and initial comment may be separate operations; display a truthful shared but comment failed state if necessary. Use authenticated GET routes with feature authorization, next-safe-action for mutations, Zod validation, and SWR with LoadingContent for reads. Keep source account and provider IDs confined to publisher creation and server provider access; participants address application share IDs. Apply bounded body, mention, and page limits.

Fetch email bodies and attachments on demand through EmailProvider; store no durable server mailbox copy. Explicitly construct safe message DTOs with application scoped references, sender/To/Cc, subject/time, sanitized body, and attachment descriptors. Never spread provider message objects. Verify complete enumeration and paging for Gmail and Outlook; partial data must be visibly marked incomplete. Every attachment and inline/CID reference must resolve within the authorized conversation. Do not expose general publisher mailbox download URLs. Coalesce provider reads, respect rate limits, and distinguish content failures from access denial.

## Atomic writes and synchronization

Implement commit time authorization. For active share mutations, use a bounded retry Prisma transaction array at Serializable isolation. First conditionally update the share matching revision, generation, active status, publisher membership, and caller's required ownership or grant; increment revision. A mismatch throws and rolls back. Include mutation, receipt, and activity writes atomically, with IDs prepared beforehand. Do not use callback Prisma transactions.

Creation validates owned publisher and selected participant memberships inside the transaction, inserts the unique share, receipt, and grants. Restart guards publisher ownership, stopped status, and observed revision/generation, then creates fresh grants under a new generation; it cannot require an old active grant. Membership removal, account deletion, participant removal, and stop/restart coordinate atomically across relevant lifecycle entry points.

Retry only serialization or revision conflicts with the same mutation ID and a bounded attempt count. Reject a reused key with different payload. Reauthorize before returning duplicate results, and return tombstones for deleted comments. Read cursors cannot move backward or beyond content visible to caller. Prove against real Postgres and adjust mechanism if needed without weakening guarantees.

Persist first, then publish content free SSE invalidation. Resolve channels server side from authenticated identity. Use per share revisions for discussion recovery; activity is a durable participant list. Refresh current activity on invalidation, focus, and reconnect; page older entries with stable ordering. Revalidate subscription access periodically. Recover lost SSE through bounded visible reader refresh. Key client caches by membership, share, and generation; abort and discard stale requests on identity change, removal, stop, and logout. Provider change hints accelerate live email refresh, with bounded refresh as fallback; durable background notifications for every provider email are outside scope.

## Implementation sequence

1. Prove independent participant identity, complete provider retrieval, and transaction behavior using focused fixtures.
2. Implement schema, grants/lifecycle, safe content and attachment reads, and shared reader.
3. Implement share/comment UI, mentions, deletion, retry, shared list, activity, unread, mute, and synchronization.
4. Run required verification, inspect screenshots, and fix failures.
5. Have independent subagents review and simplify; address findings and rerun affected checks. Create a PR and take it to green without merging or deploying.

## Required verification

Use disposable migrated Postgres, provider emulators, actual application authentication, routes, and actions, and independent browser contexts. Seed publisher A with two mailboxes, teammate B who never received the email, same organization nonparticipant admin C, and foreign organization member D. Include multi-page email history, draft, changed recipient branch, attachments/CID content, unrelated mail, and colliding provider IDs across accounts. No production auth bypass, personal mailbox fixtures, or mocked feature endpoints in browser acceptance tests.

| Case | Must prove |
| --- | --- |
| Complete workflow | A shares; B reads/comments; A sees comment and replies externally. Provider output has correct recipients, exactly one reply, and no internal comments or metadata. Posting comments sends no email. |
| Sharing cancellation | Selecting, mentioning, or cancelling grants no access and persists no comment. |
| Access isolation | Wrong account, C, D, anonymous callers, and copied link holders cannot read/mutate protected resources, previews, participants, subscriptions, or attachments. |
| Revocation race | Remove B during delayed reads/posts. Late response does not restore content; new operations fail. Drop SSE and verify clearing. |
| Membership lifecycle | Remove/rejoin author or mentioned member. Discussion survives; old grants, caches, and activity do not reactivate. |
| Stop/restart | Fresh grants and generation required; unselected former participants denied. Duplicate old operations disclose nothing. |
| Database concurrency | Real Postgres proves duplicate create/post, conflicting key, create versus member removal, post versus revocation, restart versus stop, read cursor races, atomic activity/receipt rollback. Force interleavings. |
| Delivery failure | Lost post response retried yields one comment/activity. Lost invalidation and reconnect recover ordering/unread. |
| Provider behavior | Google and Microsoft cover paging, new mail with publisher client closed, changed recipients, draft exclusion, 429, expired credentials, missing source. |
| Content safety | Attachment substitution/CID bypass fails, HTML scripts/forms inert, remote images off, private fields absent in DTOs. |
| User state | Author-only deletion, removed preview bodies, mute semantics, monotonic comment read independent of email unread. |
| UI regression | Rapid account/share switching leaks no stale content/draft; narrow layout, mention keyboard selection, focus, reply/send shortcuts work. |

Healthy emulator target: committed comments appear in the other open reader within five seconds. Lost stream fallback revalidates visible readers within 30 seconds and immediately on focus/reconnect. Use bounded assertions and controlled barriers, not arbitrary sleeps. These are acceptance targets, not production measurements.

Colocate unit tests. Add real database tests at `apps/web/__tests__/db/shared-conversations.test.ts`, provider tests at `apps/web/__tests__/integration/shared-conversations.test.ts`, and two user browser tests at `apps/web/__tests__/playwright/emulated/mail/team-comments.spec.ts` and `team-comments-access.spec.ts`. Use the real logger. Include existing mail reader, reply, keyboard, and organization removal regressions.

Run after creating the tests, from repository root:

```bash
pnpm --filter inbox-zero-ai test --run utils/team-comments
pnpm --filter inbox-zero-ai test --run components/team-comments
pnpm --filter inbox-zero-ai test-db __tests__/db/shared-conversations.test.ts
pnpm --filter inbox-zero-ai test-integration __tests__/integration/shared-conversations.test.ts
PLAYWRIGHT_MAIL_PROVIDER=google pnpm -F inbox-zero-ai test:playwright:emulated mail/team-comments.spec.ts mail/team-comments-access.spec.ts
PLAYWRIGHT_MAIL_PROVIDER=microsoft pnpm -F inbox-zero-ai test:playwright:emulated mail/team-comments.spec.ts mail/team-comments-access.spec.ts
pnpm -F inbox-zero-ai check-server-actions
```

Run changed file formatting and lint. Add an explicit disposable Postgres CI job; database tests currently skip default CI. Update browser change selection for feature, schema, actions, routes, and lifecycle files. Verify both provider jobs execute; Microsoft matrix selects mail area specs. Missing or skipped tests do not count as passes. Bound long commands. Let browser harness manage service startup; do not launch standalone dev/build unless requested. Do not use root `tsc --noEmit`; use `build:ci` only when explicitly requested. Search entire browser suite for changed affordance names without truncation.

Deliver actual running app screenshots with synthetic data, actor/provider/environment captions and test references: sharing disclosure and participant selection; B's shared reader despite never receiving email; paired A/B same committed comment after sync; new provider email beside separate discussion; revoked access; narrow layout and light/dark states. Capture core flow on both providers, inspect every screenshot, include full resolution artifacts and key images inline. Retain failure/retry screenshots, traces, console errors, test reports, and provider request evidence. Static images supplement assertions. Report each verification case as passed, failed, or unverified with evidence. Controlled live provider smoke testing needs designated test mailboxes and authorization; otherwise mark pending. Do not claim production readiness from emulators alone.
