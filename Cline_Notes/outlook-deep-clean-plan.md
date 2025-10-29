# Outlook Deep-Clean Implementation Plan

## Overview
This document outlines the staged approach to add Outlook support to the deep-clean feature. The deep-clean feature currently only supports Gmail accounts.

## Current State
- **Status**: UI visible for both providers, backend only supports Gmail
- **Blocker**: Server action throws error for non-Google providers
- **Date Started**: January 28, 2025

## Architecture Context
The deep-clean feature uses:
- QStash for background processing
- AI/LLM for intelligent email classification
- Provider abstraction layer (`EmailProvider` interface)
- Redis for temporary caching
- PostgreSQL for persistent storage

## Implementation Stages

### Stage 1: Provider Abstraction Preparation 🔧
**Goal**: Set up foundation for multi-provider support

**Tasks**:
1. Create provider-agnostic email state constants
   - Standard folder/label types (INBOX, ARCHIVE, UNREAD, etc.)
   - Gmail label mappings
   - Outlook folder mappings

2. Create Outlook folder helpers
   - `apps/web/utils/outlook/folder.ts`
   - Outlook system folder operations
   - `getOrCreateInboxZeroFolder()` equivalent

3. Update `EmailProvider` interface
   - Ensure all operations are abstracted
   - Add missing methods if needed

**Files**:
- `apps/web/utils/email/constants.ts` (NEW)
- `apps/web/utils/outlook/folder.ts` (NEW/ENHANCE)
- `apps/web/utils/email/types.ts` (UPDATE)

---

### Stage 2: Server Action Refactoring 🔄
**Goal**: Make `cleanInboxAction` provider-agnostic

**Tasks**:
1. Remove Google-only provider check (lines 35-39)
2. Update label/folder creation to use provider abstraction
3. Update thread query logic to be provider-agnostic

**Files**:
- `apps/web/utils/actions/clean.ts`

---

### Stage 3: AI Analysis Provider Support 🤖
**Goal**: Ensure AI/static rules work for both providers

**Tasks**:
1. Update static rule checks
   - Starred/flagged messages
   - Sent messages
   - Attachments (should work)
   - Calendar/receipt detection

2. Verify AI analysis with Outlook messages
3. Update category-based filtering

**Files**:
- `apps/web/app/api/clean/route.ts`
- Helper functions

---

### Stage 4: Create Outlook Action Handler 📬
**Goal**: Implement Outlook equivalent of Gmail handler

**Tasks**:
1. Create `/api/clean/outlook/route.ts`
2. Implement folder operations for Outlook
3. Update QStash routing

**Files**:
- `apps/web/app/api/clean/outlook/route.ts` (NEW)
- `apps/web/app/api/clean/route.ts` (UPDATE)

---

### Stage 5: Redis & Database Updates 💾
**Goal**: Ensure storage works for both providers

**Tasks**:
1. Review Redis thread storage
2. Verify database models
3. Update undo/change actions

**Files**:
- `apps/web/utils/redis/clean.ts`
- `apps/web/utils/actions/clean.ts`

---

### Stage 6: UI & Error Handling 🎨
**Goal**: Ensure smooth user experience

**Tasks**:
1. Update error messages
2. Add Outlook-specific guidance
3. Test UI flow

**Files**:
- `apps/web/app/(app)/clean/` components

---

### Stage 7: Testing & Documentation ✅
**Goal**: Comprehensive validation

**Tasks**:
1. Integration testing
2. Performance testing
3. Documentation updates

---

## Key Differences: Gmail vs Outlook

| Feature | Gmail | Outlook |
|---------|-------|---------|
| Organization | Labels (multi) | Folders (single) |
| Archive | Remove INBOX label | Move to Archive folder |
| Mark Read | Remove UNREAD label | Set isRead flag |
| Categories | PROMOTIONS, SOCIAL | Focused/Other |
| Starred | STARRED label | Flagged status |

## Risk Mitigation

1. **Backward Compatibility**: Gmail functionality must remain unchanged
2. **Rate Limits**: Outlook Graph API has different limits
3. **Folder Structure**: Outlook is hierarchical, Gmail is flat
4. **Testing**: Real Outlook accounts needed

## Success Criteria

- ✅ Gmail users see no change
- ✅ Outlook users can run deep-clean
- ✅ Skip options work for both (starred, attachments, etc.)
- ✅ AI analysis works equally
- ✅ Undo operations work for both
- ✅ No security regressions

## Implementation Plan

**Phase 1** (Current): Stages 1-3
- Foundation and core abstraction
- Make server actions provider-agnostic
- Update AI analysis

**Phase 2**: Stages 4-5
- Outlook-specific handler
- Storage updates

**Phase 3**: Stages 6-7
- Polish and testing
- Documentation

## Progress Tracking

- [x] Stage 1: Provider Abstraction Preparation ✅ COMPLETE
- [x] Stage 2: Server Action Refactoring ✅ COMPLETE
- [x] Stage 3: AI Analysis Provider Support ✅ COMPLETE
- [ ] Stage 4: Create Outlook Action Handler (NEXT)
- [ ] Stage 5: Redis & Database Updates
- [ ] Stage 6: UI & Error Handling
- [ ] Stage 7: Testing & Documentation

## Completed Work (January 28, 2025)

### Phase 1: Foundation & Core Abstraction (Stages 1-3)

**Stage 1: Provider Abstraction Preparation**
- ✅ Created `apps/web/utils/email/constants.ts` with provider-agnostic email state constants
- ✅ Mapped Gmail labels and Outlook folders to common concepts
- ✅ Added Outlook folder helper functions to `apps/web/utils/outlook/folders.ts`:
  - `getOrCreateInboxZeroFolder()` - Creates InboxZero tracking folders
  - `moveMessageToFolder()` - Moves messages between folders
  - `markMessageAsRead()` - Sets read/unread status
  - `flagMessage()` - Flags/stars messages
  - `getWellKnownFolderId()` - Gets standard Outlook folder IDs

**Stage 2: Server Action Refactoring**
- ✅ Removed Google-only provider check from `cleanInboxAction`
- ✅ Updated error messages to be provider-agnostic ("label/folder" instead of "label")
- ✅ Modified thread query to use `labelId` parameter (works for both Gmail and Outlook)
- ✅ Added provider detection for inbox vs folder selection

**Stage 3: AI Analysis Provider Support**
- ✅ Updated static rule checks in `/api/clean/route.ts` to be provider-agnostic:
  - `isStarred()` - Checks both Gmail STARRED label and Outlook isFlagged property
  - `isSent()` - Works with both providers' SENT indicators
  - `hasAttachments()` - Already provider-agnostic
- ✅ Updated category filtering to gracefully handle Gmail-specific categories
- ✅ Added `isFlagged` property to `ParsedMessage` type for Outlook support

**Key Changes Made:**
1. New file: `apps/web/utils/email/constants.ts` (provider abstraction constants)
2. Enhanced: `apps/web/utils/outlook/folders.ts` (InboxZero folder helpers)
3. Modified: `apps/web/utils/actions/clean.ts` (removed provider restriction)
4. Modified: `apps/web/app/api/clean/route.ts` (provider-agnostic rules)
5. Modified: `apps/web/utils/types.ts` (added isFlagged property)

**Status:** Gmail functionality preserved, foundation ready for Outlook implementation

## Related Files

### Core Clean Implementation
- `apps/web/utils/actions/clean.ts` - Server actions
- `apps/web/app/api/clean/route.ts` - Main processing endpoint
- `apps/web/app/api/clean/gmail/route.ts` - Gmail action handler

### Provider Abstraction
- `apps/web/utils/email/provider.ts` - Provider factory
- `apps/web/utils/email/types.ts` - EmailProvider interface
- `apps/web/utils/email/google.ts` - Gmail implementation
- `apps/web/utils/email/microsoft.ts` - Outlook implementation

### Supporting Files
- `apps/web/utils/redis/clean.ts` - Redis caching
- `apps/web/utils/ai/clean/ai-clean.ts` - AI analysis
- `apps/web/prisma/schema.prisma` - Database models

## Notes

- Outlook Graph API documentation: https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview
- Gmail API documentation: https://developers.google.com/gmail/api
- QStash rate limiting configured per user to avoid conflicts
