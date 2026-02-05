# Agentic System Overview

This document describes the agentic system that powers autonomous actions across email, docs, calendar, and other connected tools. The allow-list is only one part of the system; skills, patterns, execution, and auditability are equally core.

## Goals

- Enable an agent to take actions across providers while staying within explicit user-controlled guardrails.
- Preserve a strong audit trail for enterprise readiness.
- Keep provider state as the source of truth to avoid stale local state.
- Allow fast expansion to new connectors without schema churn.

## Core Concepts

### AllowedAction
Defines which action types are permitted for a given account (optionally scoped to a resource type). Examples: `archive`, `classify`, `move`, `draft`, `send`, `createEvent`. Conditions are stored as JSON and validated by Zod in application logic.

### AllowedActionOption
Allow-list for specific action targets (labels, categories, folders, statuses). This is how we enable “label as Newsletter” or “move to Folder X” with stable provider IDs and name fallbacks.

- Stores `externalId` and `name` to handle renames and missing IDs.
- Provider remains the source of truth for applied state; we only log the action.
- Optional `TargetGroup` membership supports single-choice groups (e.g., ThreadStatus).

### TargetGroup
Groups mutually exclusive targets (single-choice) or allows multiple (multi-choice). For example: `ThreadStatus` with `To Reply`, `Awaiting Reply`, `FYI`, `Actioned`.

### ProviderResource
Normalized handle for provider entities (email, doc, calendar event, etc.). Used for routing actions to the correct provider and for audit references. This does not store provider state, only stable identifiers.

### LearnedPattern + PatternAction
AI-created patterns that bypass full analysis in recurring situations. Patterns are resource-aware (email, attachment, doc, etc.) and can be created with optional user approval.

### Skill
Lazy-loaded prompts that provide detailed instructions for specific situations. Skills are owned by the user, versioned, and tracked for usage.

### ExecutedAgentAction
Immutable audit log of all attempted actions, including failures and blocks. This is the enterprise-friendly ledger of what the agent did (or tried to do).

### ActionArtifact
Normalized record of outputs produced by an action (e.g., a draft ID, created file, calendar event). Keeps `ExecutedAgentAction` clean while preserving provider return data.

### AssistantDraft (Email-Specific)
Tracks assistant-created drafts so we can safely replace or clean them up in email threads. Draft behavior is email-specific and intentionally not modeled as a generic resource.

## Provider State and Audit Philosophy

- Applied labels/categories/folders live in the provider. We do not mirror them locally.
- We log actions taken in `ExecutedAgentAction` as the system’s auditable source of truth.
- This avoids drift and preserves enterprise-grade accountability.

## Execution Flow (Simplified)

1. **Context**: Agent receives resource metadata and allowed capabilities.
2. **Decision**: Agent decides an action and optional target.
3. **Validation**: AllowedAction + AllowedActionOption + conditions.
4. **Execution**: Provider adapter executes the action.
5. **Audit**: Result recorded in `ExecutedAgentAction`, with any outputs in `ActionArtifact`.

## Email Processing Flow (Detailed)

1. **Webhook ingest**: New email arrives from provider.
2. **Minimal context**: Subject, from, snippet, thread id, and first-contact signal.
3. **Pattern check**: If a `LearnedPattern` matches, propose actions immediately.
4. **Agent pass**: If no pattern match (or if needed), load skills and decide.
5. **Validation + execution**: Apply allowed actions, enforce TargetGroup rules via provider state.
6. **Audit**: Persist in `ExecutedAgentAction`, with outputs in `ActionArtifact`.

### Common Subcases

- **Thread status**: `TargetGroup` with `SINGLE` cardinality ensures only one status at a time.
- **Draft reply**: Creates a provider draft, tracks assistant drafts for cleanup.
- **Send email**: Requires explicit approval before provider execution.
- **Cold email handling**: Decision based on first-contact + content; constrained by allow list.

## Tool Semantics and Side Effects

Some actions have **implicit side effects** that the tool guarantees. These are not additional agent decisions; they are part of correct provider behavior.

- **Single-choice groups**: When an action targets a `TargetGroup` with `SINGLE` cardinality, the tool removes other targets in that group automatically.
- **Draft replacement**: When drafting a reply, the tool can remove prior assistant drafts in the thread to keep a single current draft.

These guarantees should be described in tool documentation and reflected in the system prompt so the agent understands the consequences.

## Background Maintenance Flows

Some cleanup does not run “on email receipt.” It runs when state changes later:

- **New email arrives after a draft**: clean up prior assistant drafts.
- **New draft created**: supersede prior assistant drafts in the same thread.

These are provider-specific maintenance routines owned by the tool implementation, not by the agent.

## Decision Subcases (Non-Email)

- **Drive filing**: Action is `move` with a target folder option.
- **Calendar events**: Action is `createEvent` with action params only (no targets).
- **Docs**: Actions are routed to provider adapters via `ProviderResource`.

## Validation and Guardrails

- **Action allow list**: `AllowedAction` constrains action types per account/resource type.
- **Target allow list**: `AllowedActionOption` constrains specific targets (label/category/folder/status).
- **Provider source of truth**: Applied targets live in the provider; we do not mirror state.
- **Audit ledger**: Every attempted action is recorded in `ExecutedAgentAction`.

## Failure Handling

- Provider errors are captured in `ExecutedAgentAction.error`.
- No local state to roll back; provider is authoritative.
- Retries are safe when idempotent (e.g., label already applied).

## Current Email Flow References (No Refactor Required)

These files already implement the inbound/outbound and cleanup behaviors and remain in place:

- Inbound webhook orchestration: `apps/web/utils/webhook/process-history-item.ts`
- Outbound handling: `apps/web/utils/reply-tracker/handle-outbound.ts`
- Draft cleanup: `apps/web/utils/ai/choose-rule/draft-management.ts` and `apps/web/utils/reply-tracker/draft-tracking.ts`
- Follow-up labels: `apps/web/utils/follow-up/labels.ts`
- Thread status labels: `apps/web/utils/reply-tracker/label-helpers.ts` and `apps/web/utils/reply-tracker/outbound.ts`

## Where This Lives

- Draft schema lives in `apps/web/prisma/agent.prisma`.
- Application logic will validate conditions and enforce TargetGroup constraints using provider data.

## What This Replaces

This system shifts from fixed rules (Rule/Action) to agentic decisions inside a strict allow-list boundary. The audit trail remains first-class, preserving enterprise confidence while enabling more autonomous behavior.
