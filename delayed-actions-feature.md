# Delayed Actions Feature

## Overview

Added delayed actions functionality to the Inbox Zero schema to allow rules to schedule actions (like archiving emails) to happen after a specified delay. This is particularly useful for newsletters and marketing emails that should remain in the inbox for a period before being automatically processed.

## Schema Changes

### Action Model Updates

Added two new optional fields to the `Action` model:

```prisma
model Action {
  // ... existing fields ...

  // Delayed action fields
  delayValue Int?       // Number of delay units (e.g., 7 for "7 days")
  delayUnit  DelayUnit? // Unit of delay (DAYS, WEEKS, etc.)
}
```

### ExecutedAction Model Updates

Added scheduling and status tracking fields to the `ExecutedAction` model:

```prisma
model ExecutedAction {
  // ... existing fields ...

  // Delayed action fields
  scheduledAt DateTime?                @default(now()) // When this action should be executed
  status      ExecutedActionStatus     @default(PENDING) // Current execution status

  @@index([status, scheduledAt])
  @@index([scheduledAt])
}
```

### New Enums

#### DelayUnit

```prisma
enum DelayUnit {
  MINUTES
  HOURS
  DAYS
  WEEKS
  MONTHS
}
```

#### ExecutedActionStatus

```prisma
enum ExecutedActionStatus {
  PENDING     // Ready to execute immediately
  SCHEDULED   // Scheduled for future execution
  EXECUTING   // Currently being executed
  EXECUTED    // Successfully executed
  FAILED      // Execution failed
  CANCELLED   // Action was cancelled
}
```

## Usage Examples

### Immediate Action (Current Behavior)

```typescript
// Action with no delay - executes immediately
{
  type: "ARCHIVE",
  delayValue: null,
  delayUnit: null
}
```

### Delayed Action Examples

```typescript
// Archive after 1 week
{
  type: "ARCHIVE",
  delayValue: 1,
  delayUnit: "WEEKS"
}

// Archive after 3 days
{
  type: "ARCHIVE",
  delayValue: 3,
  delayUnit: "DAYS"
}

// Label after 2 hours
{
  type: "LABEL",
  label: "Reviewed",
  delayValue: 2,
  delayUnit: "HOURS"
}
```

## Implementation Requirements

### Database Migration

After making these schema changes, run:

```bash
npx prisma migrate dev --name add-delayed-actions
npx prisma generate
```

### Backend Implementation Needed

1. **Action Execution Logic**: Modify the rule execution engine to:

   - Calculate `scheduledAt` time when creating `ExecutedAction`
   - Set status to `SCHEDULED` for delayed actions
   - Set status to `PENDING` for immediate actions

2. **Scheduler Service**: Create a background service to:

   - Query for actions where `status = 'SCHEDULED'` and `scheduledAt <= now()`
   - Execute these actions
   - Update status to `EXECUTED` or `FAILED` based on outcome

3. **API Updates**: Update rule creation/editing APIs to support the new delay fields

### Example Implementation Flow

1. **Rule Triggers**: When a rule with delayed actions is triggered:

   ```typescript
   const scheduledAt =
     delayValue && delayUnit
       ? calculateDelayedTime(delayValue, delayUnit)
       : new Date();

   const executedAction = await prisma.executedAction.create({
     data: {
       type: action.type,
       scheduledAt,
       status: delayValue ? "SCHEDULED" : "PENDING",
       // ... other fields
     },
   });
   ```

2. **Scheduler Process**: Background job that runs periodically:

   ```typescript
   const readyActions = await prisma.executedAction.findMany({
     where: {
       status: "SCHEDULED",
       scheduledAt: { lte: new Date() },
     },
   });

   for (const action of readyActions) {
     await executeAction(action);
   }
   ```

## Use Cases

1. **Newsletter Management**: "Archive newsletters after 1 week"
2. **Marketing Emails**: "Archive promotional emails after 3 days"
3. **Notification Cleanup**: "Archive system notifications after 2 hours"
4. **Receipt Processing**: "Label receipts as 'Filed' after 1 day"

## Database Indexes

Added indexes for efficient querying:

- `@@index([status, scheduledAt])` - For finding scheduled actions ready to execute
- `@@index([scheduledAt])` - For time-based queries

This implementation provides a flexible foundation for delayed actions while maintaining backward compatibility with existing immediate actions.
