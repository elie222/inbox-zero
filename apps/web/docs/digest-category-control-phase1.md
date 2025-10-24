# Digest Category Control - Phase 1

This implementation provides programmatic control over digest categories by enabling digest actions for existing system rules.

## Overview

Phase 1 focuses on **migrating existing users** to have digest enabled for default categories without requiring UI changes or new configuration systems.

## What's Implemented

### 1. **Configuration System** (`utils/digest/category-config.ts`)
- Defines which categories should have digest enabled by default
- Provides utility functions for category management
- Centralized configuration for digest behavior

### 2. **Management Utilities** (`utils/digest/category-management.ts`)
- Functions to enable/disable digest for rules
- User-level digest management
- Status checking and reporting

### 3. **Migration Script** (`scripts/migrate-digest-categories.ts`)
- One-time migration to enable digest for existing users
- Preview mode to see what changes will be made
- Rollback capability
- Comprehensive logging and error handling

### 4. **Tests** (`__tests__/digest-category-migration.test.ts`)
- Unit tests for migration functionality
- Verification of digest action creation
- Edge case handling

## Default Categories

The following categories are enabled for digest by default:

- **Newsletter** - Newsletters and subscription emails
- **Marketing** - Promotional content and marketing campaigns  
- **Receipt** - Purchase confirmations and receipts
- **Notification** - System notifications and alerts

**Excluded categories:**
- **Calendar** - Calendar events are actionable and time-sensitive
- **To Reply** - Emails requiring immediate attention

## Usage

### Preview Migration
```bash
npm run migrate:digest preview
```
Shows what changes will be made for the first 5 users.

### Run Migration
```bash
npm run migrate:digest migrate
```
Enables digest for all users' default categories.

### Rollback Migration
```bash
npm run migrate:digest rollback
```
Removes all digest actions added by the migration.

## How It Works

1. **Rule-Based Categories**: The system uses existing rule names as category names
2. **DIGEST Actions**: Adds `ActionType.DIGEST` actions to existing system rules
3. **No Duplication**: Safely handles cases where digest is already enabled
4. **User-Specific**: Processes each user's rules individually

## Database Changes

The migration only adds new `Action` records with `type: "DIGEST"` to existing rules. No schema changes are required.

## Benefits

- ✅ **Clean Implementation**: Uses existing rule/action infrastructure
- ✅ **No Configuration Duplication**: Leverages existing system rules
- ✅ **Minimal Tech Debt**: Single-purpose migration script
- ✅ **Safe**: Idempotent operations with rollback capability
- ✅ **Testable**: Comprehensive test coverage

## Next Steps (Future Phases)

- **Phase 2**: UI controls for users to customize digest categories
- **Phase 3**: Advanced digest scheduling and frequency controls
- **Phase 4**: Category-specific digest templates and formatting
