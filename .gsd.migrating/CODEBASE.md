# Codebase Map

Generated: 2026-05-06T19:24:36Z | Files: 500 | Described: 0/500
<!-- gsd:codebase-meta {"generatedAt":"2026-05-06T19:24:36Z","fingerprint":"63c5ae4a440c7387168f8305751a7af52808e698","fileCount":500,"truncated":true} -->
Note: Truncated to first 500 files. Run with higher --max-files to include all.

### (root)/
- `.coderabbit.yaml`
- `.cursorignore`
- `.dockerignore`
- `.gitignore`
- `.ncurc.cjs`
- `.npmrc`
- `.nvmrc`
- `AGENTS.md`
- `ARCHITECTURE.md`
- `CLA.md`
- `CLAUDE.md`
- `LICENSE`
- `README.md`
- `SECURITY.md`

### .codex/
- `.codex/config.toml`

### .codex/agents/
- `.codex/agents/reviewer.toml`

### .cursor-plugin/
- `.cursor-plugin/plugin.json`

### .devcontainer/
- `.devcontainer/devcontainer.json`
- `.devcontainer/docker-compose.yml`
- `.devcontainer/Dockerfile`
- `.devcontainer/README.md`
- `.devcontainer/setup.sh`

### .github/
- `.github/dependabot.yml`

### .github/workflows/
- `.github/workflows/ai-evals.yml`
- `.github/workflows/api-release.yml`
- `.github/workflows/build_and_publish_docker.yml`
- `.github/workflows/build-changelog.yml`
- `.github/workflows/build-check.yml`
- `.github/workflows/claude-code-review.yml`
- `.github/workflows/claude.yml`
- `.github/workflows/cli-release.yml`
- `.github/workflows/deploy-image-proxy.yml`
- `.github/workflows/docker-build.yml`
- `.github/workflows/e2e-flows.yml`
- `.github/workflows/smoke.yml`
- `.github/workflows/test.yml`

### .gsd.migrating/
- `.gsd.migrating/CODEBASE.md`
- `.gsd.migrating/DECISIONS.md`
- `.gsd.migrating/event-log.jsonl`
- `.gsd.migrating/gsd.db`
- `.gsd.migrating/gsd.db-shm`
- `.gsd.migrating/gsd.db-wal`
- `.gsd.migrating/last-snapshot.md`
- `.gsd.migrating/notifications.jsonl`
- `.gsd.migrating/PROJECT.md`
- `.gsd.migrating/REQUIREMENTS.md`
- `.gsd.migrating/state-manifest.json`
- `.gsd.migrating/STATE.md`

### .gsd.migrating/graphs/
- `.gsd.migrating/graphs/graph.json`

### .gsd.migrating/milestones/M001/
- `.gsd.migrating/milestones/M001/M001-CONTEXT.md`
- `.gsd.migrating/milestones/M001/M001-ROADMAP.md`

### .gsd.migrating/milestones/M001/slices/S01/
- `.gsd.migrating/milestones/M001/slices/S01/S01-PLAN.md`
- `.gsd.migrating/milestones/M001/slices/S01/S01-RESEARCH.md`
- `.gsd.migrating/milestones/M001/slices/S01/S01-SUMMARY.md`
- `.gsd.migrating/milestones/M001/slices/S01/S01-UAT.md`

### .gsd.migrating/milestones/M001/slices/S02/
- `.gsd.migrating/milestones/M001/slices/S02/S02-PLAN.md`
- `.gsd.migrating/milestones/M001/slices/S02/S02-RESEARCH.md`
- `.gsd.migrating/milestones/M001/slices/S02/S02-SUMMARY.md`
- `.gsd.migrating/milestones/M001/slices/S02/S02-UAT.md`

### .gsd.migrating/milestones/M001/slices/S03/
- `.gsd.migrating/milestones/M001/slices/S03/S03-PLAN.md`
- `.gsd.migrating/milestones/M001/slices/S03/S03-RESEARCH.md`
- `.gsd.migrating/milestones/M001/slices/S03/S03-SUMMARY.md`
- `.gsd.migrating/milestones/M001/slices/S03/S03-UAT.md`

### .gsd.migrating/milestones/M001/slices/S04/
- `.gsd.migrating/milestones/M001/slices/S04/S04-PLAN.md`
- `.gsd.migrating/milestones/M001/slices/S04/S04-RESEARCH.md`
- `.gsd.migrating/milestones/M001/slices/S04/S04-SUMMARY.md`
- `.gsd.migrating/milestones/M001/slices/S04/S04-UAT.md`

### .gsd.migrating/milestones/M001/slices/S05/
- `.gsd.migrating/milestones/M001/slices/S05/S05-CONTINUE.md`
- `.gsd.migrating/milestones/M001/slices/S05/S05-PLAN.md`

### .gsd.migrating/milestones/M001/slices/S06/
- `.gsd.migrating/milestones/M001/slices/S06/S06-PLAN.md`

### .gsd.migrating/milestones/M001/slices/S07/
- `.gsd.migrating/milestones/M001/slices/S07/S07-PLAN.md`

### .gsd.migrating/runtime/
- `.gsd.migrating/runtime/write-gate-state.json`

### .husky/
- `.husky/.gitignore`
- `.husky/pre-commit`
- `.husky/pre-push`

### .superset/
- `.superset/config.json`

### Formula/
- `Formula/inbox-zero.rb`

### agents/
- `agents/inbox-zero-api-cli.md`

### apps/image-proxy/
- `apps/image-proxy/package.json`
- `apps/image-proxy/tsconfig.json`
- `apps/image-proxy/wrangler.jsonc`

### apps/image-proxy-aws/
- `apps/image-proxy-aws/package.json`
- `apps/image-proxy-aws/README.md`
- `apps/image-proxy-aws/tsconfig.json`

### apps/image-proxy-aws/src/
- `apps/image-proxy-aws/src/handler.test.ts`
- `apps/image-proxy-aws/src/handler.ts`

### apps/image-proxy/src/
- `apps/image-proxy/src/index.ts`

### apps/web/
- `apps/web/.env.example`

### apps/web/__tests__/
- `apps/web/__tests__/ai-assistant-chat.test.ts`
- `apps/web/__tests__/helpers.ts`
- `apps/web/__tests__/setup.ts`

### apps/web/__tests__/ai/
- `apps/web/__tests__/ai/digest-narrative.test.ts`
- `apps/web/__tests__/ai/digest-tone.test.ts`

### apps/web/__tests__/ai-regression/
- `apps/web/__tests__/ai-regression/ai-assistant-chat-send-disabled-regression.test.ts`
- `apps/web/__tests__/ai-regression/ai-calendar-availability.test.ts`
- `apps/web/__tests__/ai-regression/ai-categorize-senders.test.ts`
- `apps/web/__tests__/ai-regression/ai-choose-args.test.ts`
- `apps/web/__tests__/ai-regression/ai-choose-rule.test.ts`
- `apps/web/__tests__/ai-regression/ai-detect-recurring-pattern.test.ts`
- `apps/web/__tests__/ai-regression/ai-extract-from-email-history.test.ts`
- `apps/web/__tests__/ai-regression/ai-extract-knowledge.test.ts`
- `apps/web/__tests__/ai-regression/ai-find-snippets.test.ts`
- `apps/web/__tests__/ai-regression/ai-mcp-agent.test.ts`
- `apps/web/__tests__/ai-regression/ai-meeting-briefing.test.ts`
- `apps/web/__tests__/ai-regression/ai-persona.test.ts`
- `apps/web/__tests__/ai-regression/ai-prompt-to-rules.test.ts`
- `apps/web/__tests__/ai-regression/ai-summarize-email-for-digest.test.ts`
- `apps/web/__tests__/ai-regression/ai-writing-style.test.ts`
- `apps/web/__tests__/ai-regression/determine-thread-status.test.ts`

### apps/web/__tests__/ai-regression/reply/
- `apps/web/__tests__/ai-regression/reply/draft-follow-up.test.ts`
- `apps/web/__tests__/ai-regression/reply/draft-reply.test.ts`
- `apps/web/__tests__/ai-regression/reply/reply-context-collector.test.ts`

### apps/web/__tests__/cron/
- `apps/web/__tests__/cron/digest.test.ts`

### apps/web/__tests__/digest/
- `apps/web/__tests__/digest/idempotency.test.ts`

### apps/web/__tests__/e2e/
- `apps/web/__tests__/e2e/gmail-operations.test.ts`
- `apps/web/__tests__/e2e/helpers.ts`
- `apps/web/__tests__/e2e/outlook-draft-read-status.test.ts`
- `apps/web/__tests__/e2e/outlook-operations.test.ts`
- `apps/web/__tests__/e2e/outlook-query-parsing.test.ts`
- `apps/web/__tests__/e2e/outlook-search.test.ts`
- `apps/web/__tests__/e2e/README.md`

### apps/web/__tests__/e2e/calendar/
- `apps/web/__tests__/e2e/calendar/google-calendar.test.ts`
- `apps/web/__tests__/e2e/calendar/microsoft-calendar.test.ts`

### apps/web/__tests__/e2e/cold-email/
- `apps/web/__tests__/e2e/cold-email/google-cold-email.test.ts`
- `apps/web/__tests__/e2e/cold-email/microsoft-cold-email.test.ts`

### apps/web/__tests__/e2e/drafting/
- `apps/web/__tests__/e2e/drafting/microsoft-drafting.test.ts`

### apps/web/__tests__/e2e/flows/
- `apps/web/__tests__/e2e/flows/auto-labeling.test.ts`
- `apps/web/__tests__/e2e/flows/config.ts`
- `apps/web/__tests__/e2e/flows/draft-cleanup.test.ts`
- `apps/web/__tests__/e2e/flows/follow-up-reminders.test.ts`
- `apps/web/__tests__/e2e/flows/full-reply-cycle.test.ts`
- `apps/web/__tests__/e2e/flows/message-preservation.test.ts`
- `apps/web/__tests__/e2e/flows/outbound-tracking.test.ts`
- `apps/web/__tests__/e2e/flows/README.md`
- `apps/web/__tests__/e2e/flows/sent-reply-preservation.test.ts`
- `apps/web/__tests__/e2e/flows/setup.ts`
- `apps/web/__tests__/e2e/flows/teardown.ts`

### apps/web/__tests__/e2e/flows/helpers/
- `apps/web/__tests__/e2e/flows/helpers/accounts.ts`
- `apps/web/__tests__/e2e/flows/helpers/email.ts`
- `apps/web/__tests__/e2e/flows/helpers/logging.ts`
- `apps/web/__tests__/e2e/flows/helpers/polling.ts`
- `apps/web/__tests__/e2e/flows/helpers/webhook.ts`

### apps/web/__tests__/e2e/labeling/
- `apps/web/__tests__/e2e/labeling/gmail-thread-label-removal.test.ts`
- `apps/web/__tests__/e2e/labeling/google-labeling.test.ts`
- `apps/web/__tests__/e2e/labeling/helpers.ts`
- `apps/web/__tests__/e2e/labeling/microsoft-labeling.test.ts`
- `apps/web/__tests__/e2e/labeling/microsoft-thread-category-removal.test.ts`

### apps/web/__tests__/eval/
- *(50 files: 50 .ts)*

### apps/web/__tests__/fixtures/inboxes/
- `apps/web/__tests__/fixtures/inboxes/adapters.test.ts`
- `apps/web/__tests__/fixtures/inboxes/adapters.ts`
- `apps/web/__tests__/fixtures/inboxes/demo-inboxes.ts`
- `apps/web/__tests__/fixtures/inboxes/types.ts`

### apps/web/__tests__/integration/
- `apps/web/__tests__/integration/demo-inbox-fixture.test.ts`
- `apps/web/__tests__/integration/draft-creation.test.ts`
- `apps/web/__tests__/integration/helpers.ts`
- `apps/web/__tests__/integration/labeling-archiving.test.ts`
- `apps/web/__tests__/integration/provider-operations.test.ts`
- `apps/web/__tests__/integration/rule-execution.test.ts`
- `apps/web/__tests__/integration/run-rules-learned-exclusions.test.ts`
- `apps/web/__tests__/integration/security-pipeline.test.ts`
- `apps/web/__tests__/integration/slack-chat.test.ts`
- `apps/web/__tests__/integration/slack-notifications.test.ts`
- `apps/web/__tests__/integration/stats-reuse-messages.test.ts`
- `apps/web/__tests__/integration/thread-fetching.test.ts`
- `apps/web/__tests__/integration/webhook-action.test.ts`
- `apps/web/__tests__/integration/webhook-flow.test.ts`
- `apps/web/__tests__/integration/worker-queue.test.ts`

### apps/web/__tests__/mocks/
- `apps/web/__tests__/mocks/email-provider.mock.ts`

### apps/web/__tests__/playwright/
- `apps/web/__tests__/playwright/smoke.spec.ts`

### apps/web/app/(app)/
- `apps/web/app/(app)/ErrorMessages.tsx`
- `apps/web/app/(app)/ProviderRateLimitBanner.tsx`

### apps/web/app/(app)/[emailAccountId]/
- `apps/web/app/(app)/[emailAccountId]/assess.tsx`
- `apps/web/app/(app)/[emailAccountId]/error.tsx`
- `apps/web/app/(app)/[emailAccountId]/PermissionsCheck.tsx`

### apps/web/app/(app)/[emailAccountId]/assistant/
- *(53 files: 43 .tsx, 10 .ts)*

### apps/web/app/(app)/[emailAccountId]/assistant/group/
- `apps/web/app/(app)/[emailAccountId]/assistant/group/LearnedPatterns.tsx`
- `apps/web/app/(app)/[emailAccountId]/assistant/group/ViewLearnedPatterns.tsx`

### apps/web/app/(app)/[emailAccountId]/assistant/knowledge/
- `apps/web/app/(app)/[emailAccountId]/assistant/knowledge/KnowledgeBase.tsx`
- `apps/web/app/(app)/[emailAccountId]/assistant/knowledge/KnowledgeForm.tsx`

### apps/web/app/(app)/[emailAccountId]/assistant/rule/[ruleId]/
- `apps/web/app/(app)/[emailAccountId]/assistant/rule/[ruleId]/error.tsx`
- `apps/web/app/(app)/[emailAccountId]/assistant/rule/[ruleId]/page.tsx`

### apps/web/app/(app)/[emailAccountId]/assistant/rule/create/
- `apps/web/app/(app)/[emailAccountId]/assistant/rule/create/page.tsx`

### apps/web/app/(app)/[emailAccountId]/assistant/settings/
- `apps/web/app/(app)/[emailAccountId]/assistant/settings/AboutSetting.tsx`
- `apps/web/app/(app)/[emailAccountId]/assistant/settings/DigestSetting.tsx`
- `apps/web/app/(app)/[emailAccountId]/assistant/settings/DraftConfidenceSetting.tsx`
- `apps/web/app/(app)/[emailAccountId]/assistant/settings/DraftKnowledgeSetting.tsx`
- `apps/web/app/(app)/[emailAccountId]/assistant/settings/DraftReplies.tsx`
- `apps/web/app/(app)/[emailAccountId]/assistant/settings/FollowUpRemindersSetting.tsx`
- `apps/web/app/(app)/[emailAccountId]/assistant/settings/HiddenAiDraftLinksSetting.tsx`
- `apps/web/app/(app)/[emailAccountId]/assistant/settings/LearnedPatternsSetting.tsx`
- `apps/web/app/(app)/[emailAccountId]/assistant/settings/MultiRuleSetting.tsx`
- `apps/web/app/(app)/[emailAccountId]/assistant/settings/PersonalSignatureSetting.tsx`
- `apps/web/app/(app)/[emailAccountId]/assistant/settings/ProactiveUpdatesSetting.tsx`
- `apps/web/app/(app)/[emailAccountId]/assistant/settings/ReferralSignatureSetting.tsx`
- `apps/web/app/(app)/[emailAccountId]/assistant/settings/RuleImportExportSetting.tsx`
- `apps/web/app/(app)/[emailAccountId]/assistant/settings/SettingsTab.tsx`
- `apps/web/app/(app)/[emailAccountId]/assistant/settings/SyncToExtensionSetting.tsx`
- `apps/web/app/(app)/[emailAccountId]/assistant/settings/WritingStyleSetting.tsx`

### apps/web/app/(app)/[emailAccountId]/automation/
- `apps/web/app/(app)/[emailAccountId]/automation/page.tsx`

### apps/web/app/(app)/[emailAccountId]/briefs/
- `apps/web/app/(app)/[emailAccountId]/briefs/DeliveryChannelsSetting.tsx`
- `apps/web/app/(app)/[emailAccountId]/briefs/IntegrationsSetting.tsx`
- `apps/web/app/(app)/[emailAccountId]/briefs/Onboarding.tsx`
- `apps/web/app/(app)/[emailAccountId]/briefs/page.tsx`
- `apps/web/app/(app)/[emailAccountId]/briefs/TimeDurationSetting.tsx`
- `apps/web/app/(app)/[emailAccountId]/briefs/UpcomingMeetings.tsx`

### apps/web/app/(app)/[emailAccountId]/bulk-archive/
- `apps/web/app/(app)/[emailAccountId]/bulk-archive/AutoCategorizationSetup.test.tsx`
- `apps/web/app/(app)/[emailAccountId]/bulk-archive/AutoCategorizationSetup.tsx`
- `apps/web/app/(app)/[emailAccountId]/bulk-archive/BulkArchive.tsx`
- `apps/web/app/(app)/[emailAccountId]/bulk-archive/BulkArchiveProgress.test.tsx`
- `apps/web/app/(app)/[emailAccountId]/bulk-archive/BulkArchiveProgress.tsx`
- `apps/web/app/(app)/[emailAccountId]/bulk-archive/BulkArchiveSettingsModal.tsx`
- `apps/web/app/(app)/[emailAccountId]/bulk-archive/page.tsx`

### apps/web/app/(app)/[emailAccountId]/bulk-unsubscribe/
- `apps/web/app/(app)/[emailAccountId]/bulk-unsubscribe/ArchiveProgress.test.tsx`
- `apps/web/app/(app)/[emailAccountId]/bulk-unsubscribe/ArchiveProgress.tsx`
- `apps/web/app/(app)/[emailAccountId]/bulk-unsubscribe/BulkActions.tsx`
- `apps/web/app/(app)/[emailAccountId]/bulk-unsubscribe/BulkUnsubscribeDesktop.tsx`
- `apps/web/app/(app)/[emailAccountId]/bulk-unsubscribe/BulkUnsubscribeSection.tsx`
- `apps/web/app/(app)/[emailAccountId]/bulk-unsubscribe/BulkUnsubscribeSkeleton.tsx`
- `apps/web/app/(app)/[emailAccountId]/bulk-unsubscribe/common.tsx`
- `apps/web/app/(app)/[emailAccountId]/bulk-unsubscribe/hooks.ts`
- `apps/web/app/(app)/[emailAccountId]/bulk-unsubscribe/page.tsx`
- `apps/web/app/(app)/[emailAccountId]/bulk-unsubscribe/ResubscribeDialog.tsx`
- `apps/web/app/(app)/[emailAccountId]/bulk-unsubscribe/SearchBar.tsx`
- `apps/web/app/(app)/[emailAccountId]/bulk-unsubscribe/ShortcutTooltip.tsx`
- `apps/web/app/(app)/[emailAccountId]/bulk-unsubscribe/types.ts`

### apps/web/app/(app)/[emailAccountId]/calendars/
- `apps/web/app/(app)/[emailAccountId]/calendars/CalendarConnectionCard.tsx`
- `apps/web/app/(app)/[emailAccountId]/calendars/CalendarConnections.tsx`
- `apps/web/app/(app)/[emailAccountId]/calendars/CalendarList.tsx`
- `apps/web/app/(app)/[emailAccountId]/calendars/CalendarSettings.tsx`
- `apps/web/app/(app)/[emailAccountId]/calendars/ConnectCalendar.tsx`
- `apps/web/app/(app)/[emailAccountId]/calendars/page.tsx`
- `apps/web/app/(app)/[emailAccountId]/calendars/TimezoneDetector.test.ts`
- `apps/web/app/(app)/[emailAccountId]/calendars/TimezoneDetector.tsx`
- `apps/web/app/(app)/[emailAccountId]/calendars/TimezoneDetector.utils.ts`

### apps/web/app/(app)/[emailAccountId]/channels/
- `apps/web/app/(app)/[emailAccountId]/channels/Channels.tsx`
- `apps/web/app/(app)/[emailAccountId]/channels/page.tsx`

### apps/web/app/(app)/[emailAccountId]/clean/
- `apps/web/app/(app)/[emailAccountId]/clean/ActionSelectionStep.tsx`
- `apps/web/app/(app)/[emailAccountId]/clean/CleanHistory.tsx`
- `apps/web/app/(app)/[emailAccountId]/clean/CleanInstructionsStep.tsx`
- `apps/web/app/(app)/[emailAccountId]/clean/CleanRun.tsx`
- `apps/web/app/(app)/[emailAccountId]/clean/CleanStats.tsx`
- `apps/web/app/(app)/[emailAccountId]/clean/ConfirmationStep.tsx`
- `apps/web/app/(app)/[emailAccountId]/clean/consts.ts`
- `apps/web/app/(app)/[emailAccountId]/clean/EmailFirehose.tsx`
- `apps/web/app/(app)/[emailAccountId]/clean/EmailFirehoseItem.tsx`
- `apps/web/app/(app)/[emailAccountId]/clean/helpers.ts`
- `apps/web/app/(app)/[emailAccountId]/clean/IntroStep.tsx`
- `apps/web/app/(app)/[emailAccountId]/clean/loading.tsx`
- `apps/web/app/(app)/[emailAccountId]/clean/page.tsx`
- `apps/web/app/(app)/[emailAccountId]/clean/PreviewBatch.tsx`
- `apps/web/app/(app)/[emailAccountId]/clean/TimeRangeStep.tsx`
- `apps/web/app/(app)/[emailAccountId]/clean/types.ts`
- `apps/web/app/(app)/[emailAccountId]/clean/useEmailStream.ts`
- `apps/web/app/(app)/[emailAccountId]/clean/useSkipSettings.ts`
- `apps/web/app/(app)/[emailAccountId]/clean/useStep.tsx`

### apps/web/app/(app)/[emailAccountId]/clean/history/
- `apps/web/app/(app)/[emailAccountId]/clean/history/page.tsx`

### apps/web/app/(app)/[emailAccountId]/clean/onboarding/
- `apps/web/app/(app)/[emailAccountId]/clean/onboarding/page.tsx`

### apps/web/app/(app)/[emailAccountId]/clean/run/
- `apps/web/app/(app)/[emailAccountId]/clean/run/page.tsx`

### apps/web/app/(app)/[emailAccountId]/cold-email-blocker/
- `apps/web/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailContent.tsx`
- `apps/web/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailList.tsx`
- `apps/web/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailRejected.tsx`
- `apps/web/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailTest.tsx`
- `apps/web/app/(app)/[emailAccountId]/cold-email-blocker/page.tsx`
- `apps/web/app/(app)/[emailAccountId]/cold-email-blocker/TestRules.tsx`

### apps/web/app/(app)/[emailAccountId]/compose/
- `apps/web/app/(app)/[emailAccountId]/compose/ComposeEmailForm.tsx`
- `apps/web/app/(app)/[emailAccountId]/compose/ComposeEmailFormLazy.tsx`

### apps/web/app/(app)/[emailAccountId]/debug/
- `apps/web/app/(app)/[emailAccountId]/debug/page.tsx`

### apps/web/app/(app)/[emailAccountId]/debug/drafts/
- `apps/web/app/(app)/[emailAccountId]/debug/drafts/page.tsx`

### apps/web/app/(app)/[emailAccountId]/debug/follow-up/
- `apps/web/app/(app)/[emailAccountId]/debug/follow-up/page.tsx`

### apps/web/app/(app)/[emailAccountId]/debug/memories/
- `apps/web/app/(app)/[emailAccountId]/debug/memories/page.tsx`

### apps/web/app/(app)/[emailAccountId]/debug/report/
- `apps/web/app/(app)/[emailAccountId]/debug/report/page.tsx`

### apps/web/app/(app)/[emailAccountId]/debug/rule-history/
- `apps/web/app/(app)/[emailAccountId]/debug/rule-history/page.tsx`

### apps/web/app/(app)/[emailAccountId]/debug/rule-history/[ruleId]/
- `apps/web/app/(app)/[emailAccountId]/debug/rule-history/[ruleId]/page.tsx`

### apps/web/app/(app)/[emailAccountId]/debug/rules/
- `apps/web/app/(app)/[emailAccountId]/debug/rules/page.tsx`

### apps/web/app/(app)/[emailAccountId]/drive/
- `apps/web/app/(app)/[emailAccountId]/drive/AllowedFolders.tsx`
- `apps/web/app/(app)/[emailAccountId]/drive/ConnectDrive.tsx`
- `apps/web/app/(app)/[emailAccountId]/drive/DriveConnectionCard.tsx`
- `apps/web/app/(app)/[emailAccountId]/drive/DriveConnections.tsx`
- `apps/web/app/(app)/[emailAccountId]/drive/DriveOnboarding.tsx`
- `apps/web/app/(app)/[emailAccountId]/drive/DriveSetup.tsx`
- `apps/web/app/(app)/[emailAccountId]/drive/FilingActivity.tsx`
- `apps/web/app/(app)/[emailAccountId]/drive/FilingPreferences.tsx`
- `apps/web/app/(app)/[emailAccountId]/drive/FilingRulesForm.tsx`
- `apps/web/app/(app)/[emailAccountId]/drive/page.tsx`

### apps/web/app/(app)/[emailAccountId]/integrations/
- `apps/web/app/(app)/[emailAccountId]/integrations/IntegrationRow.tsx`
- `apps/web/app/(app)/[emailAccountId]/integrations/Integrations.tsx`
- `apps/web/app/(app)/[emailAccountId]/integrations/IntegrationsPremiumAlert.tsx`
- `apps/web/app/(app)/[emailAccountId]/integrations/page.tsx`
- `apps/web/app/(app)/[emailAccountId]/integrations/RequestAccessDialog.tsx`

### apps/web/app/(app)/[emailAccountId]/integrations/test/
- `apps/web/app/(app)/[emailAccountId]/integrations/test/McpAgentTest.tsx`
- `apps/web/app/(app)/[emailAccountId]/integrations/test/page.tsx`

### apps/web/app/(app)/[emailAccountId]/mail/
- `apps/web/app/(app)/[emailAccountId]/mail/BetaBanner.tsx`
- `apps/web/app/(app)/[emailAccountId]/mail/page.tsx`

### apps/web/app/(app)/[emailAccountId]/no-reply/
- `apps/web/app/(app)/[emailAccountId]/no-reply/page.tsx`

### apps/web/app/(app)/[emailAccountId]/onboarding/
- *(30 files: 27 .tsx, 3 .ts)*

### apps/web/app/(app)/[emailAccountId]/onboarding-brief/
- `apps/web/app/(app)/[emailAccountId]/onboarding-brief/MeetingBriefsOnboardingContent.tsx`
- `apps/web/app/(app)/[emailAccountId]/onboarding-brief/page.tsx`
- `apps/web/app/(app)/[emailAccountId]/onboarding-brief/StepConnectCalendar.tsx`
- `apps/web/app/(app)/[emailAccountId]/onboarding-brief/StepReady.tsx`
- `apps/web/app/(app)/[emailAccountId]/onboarding-brief/StepSendTestBrief.tsx`

### apps/web/app/(app)/[emailAccountId]/onboarding/illustrations/
- `apps/web/app/(app)/[emailAccountId]/onboarding/illustrations/BulkUnsubscribeIllustration.tsx`
- `apps/web/app/(app)/[emailAccountId]/onboarding/illustrations/ChatIllustration.tsx`
- `apps/web/app/(app)/[emailAccountId]/onboarding/illustrations/DraftRepliesIllustration.tsx`
- `apps/web/app/(app)/[emailAccountId]/onboarding/illustrations/EmailsSortedIllustration.tsx`
- `apps/web/app/(app)/[emailAccountId]/onboarding/illustrations/InboxReadyIllustration.tsx`

### apps/web/app/(app)/[emailAccountId]/organization/
- `apps/web/app/(app)/[emailAccountId]/organization/page.tsx`

### apps/web/app/(app)/[emailAccountId]/organization/create/
- `apps/web/app/(app)/[emailAccountId]/organization/create/page.tsx`

### apps/web/app/(app)/[emailAccountId]/permissions/consent/
- `apps/web/app/(app)/[emailAccountId]/permissions/consent/page.tsx`

### apps/web/app/(app)/[emailAccountId]/quick-bulk-archive/
- `apps/web/app/(app)/[emailAccountId]/quick-bulk-archive/BulkArchiveTab.tsx`
- `apps/web/app/(app)/[emailAccountId]/quick-bulk-archive/page.tsx`

### apps/web/app/(app)/[emailAccountId]/reply-zero/
- `apps/web/app/(app)/[emailAccountId]/reply-zero/AwaitingReply.tsx`
- `apps/web/app/(app)/[emailAccountId]/reply-zero/date-filter.ts`
- `apps/web/app/(app)/[emailAccountId]/reply-zero/EnableReplyTracker.tsx`
- `apps/web/app/(app)/[emailAccountId]/reply-zero/fetch-trackers.ts`
- `apps/web/app/(app)/[emailAccountId]/reply-zero/NeedsAction.tsx`
- `apps/web/app/(app)/[emailAccountId]/reply-zero/NeedsReply.tsx`
- `apps/web/app/(app)/[emailAccountId]/reply-zero/page.tsx`
- `apps/web/app/(app)/[emailAccountId]/reply-zero/ReplyTrackerEmails.tsx`
- `apps/web/app/(app)/[emailAccountId]/reply-zero/Resolved.tsx`
- `apps/web/app/(app)/[emailAccountId]/reply-zero/TimeRangeFilter.tsx`

### apps/web/app/(app)/[emailAccountId]/reply-zero/onboarding/
- `apps/web/app/(app)/[emailAccountId]/reply-zero/onboarding/page.tsx`

### apps/web/app/(app)/[emailAccountId]/settings/
- *(22 files: 22 .tsx)*

### apps/web/app/(app)/[emailAccountId]/setup/
- `apps/web/app/(app)/[emailAccountId]/setup/page.tsx`
- `apps/web/app/(app)/[emailAccountId]/setup/SetupContent.tsx`

### apps/web/app/(app)/[emailAccountId]/smart-categories/
- `apps/web/app/(app)/[emailAccountId]/smart-categories/CategorizeProgress.test.tsx`
- `apps/web/app/(app)/[emailAccountId]/smart-categories/CategorizeProgress.tsx`
- `apps/web/app/(app)/[emailAccountId]/smart-categories/CategorizeWithAiButton.test.tsx`
- `apps/web/app/(app)/[emailAccountId]/smart-categories/CategorizeWithAiButton.tsx`
- `apps/web/app/(app)/[emailAccountId]/smart-categories/CreateCategoryButton.tsx`
- `apps/web/app/(app)/[emailAccountId]/smart-categories/page.tsx`
- `apps/web/app/(app)/[emailAccountId]/smart-categories/Uncategorized.tsx`

### apps/web/app/(app)/[emailAccountId]/smart-categories/setup/
- `apps/web/app/(app)/[emailAccountId]/smart-categories/setup/page.tsx`
- `apps/web/app/(app)/[emailAccountId]/smart-categories/setup/SetUpCategories.tsx`
- `apps/web/app/(app)/[emailAccountId]/smart-categories/setup/SmartCategoriesOnboarding.tsx`

### apps/web/app/(app)/[emailAccountId]/stats/
- `apps/web/app/(app)/[emailAccountId]/stats/ActionBar.tsx`
- `apps/web/app/(app)/[emailAccountId]/stats/BarChart.tsx`
- `apps/web/app/(app)/[emailAccountId]/stats/BarListCard.tsx`
- `apps/web/app/(app)/[emailAccountId]/stats/DetailedStatsFilter.tsx`
- `apps/web/app/(app)/[emailAccountId]/stats/EmailActionsAnalytics.tsx`
- `apps/web/app/(app)/[emailAccountId]/stats/EmailAnalytics.tsx`
- `apps/web/app/(app)/[emailAccountId]/stats/EmailsToIncludeFilter.tsx`
- `apps/web/app/(app)/[emailAccountId]/stats/LoadProgress.tsx`
- `apps/web/app/(app)/[emailAccountId]/stats/LoadStatsButton.tsx`
- `apps/web/app/(app)/[emailAccountId]/stats/MainStatChart.tsx`
- `apps/web/app/(app)/[emailAccountId]/stats/NewsletterModal.tsx`
- `apps/web/app/(app)/[emailAccountId]/stats/ResponseTimeAnalytics.tsx`
- `apps/web/app/(app)/[emailAccountId]/stats/RuleStatsChart.tsx`
- `apps/web/app/(app)/[emailAccountId]/stats/Stats.tsx`
- `apps/web/app/(app)/[emailAccountId]/stats/StatsOnboarding.tsx`
