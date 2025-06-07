# Refer a Friend System Implementation

A referral system that rewards users with a free month of service for each friend they refer who completes the 7-day free trial.

## Completed Tasks

- [x] Create task list and implementation plan
- [x] Design database schema for referrals
- [x] Create referral code generation system
- [x] Implement referral tracking
- [x] Create API endpoints for referral management
- [x] Build referral UI components
- [x] Refactor to follow project patterns (SWR, server actions, Prisma types)
- [x] Simplify to use User.referralCode instead of separate table

## In Progress Tasks

- [ ] Add email notifications for referrals
- [ ] Create referral analytics dashboard
- [ ] Implement referral fraud detection
- [ ] Add social sharing features
- [ ] Create referral landing page
- [ ] Integrate trial completion tracking with existing auth flow
- [ ] Add referral code field to signup form
- [ ] Add navigation link to referrals page
- [ ] Run database migrations

## Future Tasks

- [ ] Run database migrations for simplified schema
- [ ] Fix TypeScript configuration issues for module imports
- [ ] Add email notifications for referrals
- [ ] Create referral analytics dashboard
- [ ] Implement referral fraud detection
- [ ] Add social sharing features
- [ ] Create referral landing page
- [ ] Integrate trial completion tracking with existing auth flow
- [ ] Add referral code field to signup form
- [ ] Add navigation link to referrals page

## Implementation Plan

### Overview

The referral system allows existing users to invite friends via unique referral codes or links. When a referred user signs up and completes their 7-day trial, the referrer receives a month of free service.

**Simplified Approach**: Each user gets a `referralCode` field directly on their User record. No separate ReferralCode table needed.

### Technical Components

1. **Database Schema** ✅

   - User has `referralCode` field directly ✅
   - Referral table tracks relationships and stores `referralCodeUsed` ✅
   - ReferralReward table tracks awarded benefits ✅

2. **Backend Logic** ✅

   - Referral code generation and validation ✅
   - Trial completion tracking ✅
   - Automatic reward application ✅
   - API endpoints for referral management ✅
   - Server actions for mutations ✅

3. **Frontend Components** ✅

   - Referral dashboard showing code and stats ✅
   - Share buttons for easy sharing ✅
   - Referral status tracking ✅
   - Copy-to-clipboard functionality ✅
   - SWR integration for data fetching ✅

4. **Email Integration**
   - Invitation emails to referred friends
   - Notification when referral completes trial
   - Reminder emails for pending referrals

### Simplified Schema

```prisma
model User {
  // ... existing fields
  referralCode      String? @unique  // User's own referral code
  referralsMade     Referral[] @relation("ReferrerUser")
  referralReceived  Referral?  @relation("ReferredUser")
  referralRewards   ReferralReward[]
}

model Referral {
  id                String    @id @default(cuid())
  referrerUserId    String
  referrerUser      User      @relation("ReferrerUser")
  referredUserId    String    @unique
  referredUser      User      @relation("ReferredUser")
  referralCodeUsed  String    // The actual code that was used
  status            ReferralStatus @default(PENDING)
  // ... other fields
}

model ReferralReward {
  id         String @id @default(cuid())
  referralId String @unique
  referral   Referral
  userId     String  // The user who gets the reward
  user       User
  rewardType String @default("FREE_MONTH")
  // ... other fields
}
```

### User Flow

1. User accesses referral page at `/referrals`
2. Gets unique referral code (auto-generated on first visit)
3. Shares with friends via link or code
4. Friend signs up using referral code
5. Friend completes 7-day trial
6. Original user receives 1 month free

### API Endpoints

- `GET /api/referrals/code` - Get user's referral code (auto-creates if needed)
- `GET /api/referrals/stats` - Get referral statistics and history
- `GET /api/referrals` - List user's referrals

### Server Actions

- `applyReferralCodeAction` - Apply a referral code during signup

### Benefits of Simplified Approach

1. **Simpler Schema**: No need for separate ReferralCode table
2. **Easier Queries**: Direct access to referralCode on User
3. **Auto-Generation**: Code created when first needed
4. **No Deactivation Logic**: Codes are always active
5. **Less Complexity**: Fewer models to manage

### Next Steps for Deployment

1. **Database Migration**:

   ```bash
   npx prisma migrate dev --name simplify-referral-system
   ```

2. **Environment Variables**: Ensure `NEXT_PUBLIC_BASE_URL` is set correctly

3. **Navigation**: Add a link to the referrals page in the main navigation

4. **Signup Integration**:

   - Add referral code input field to the signup form
   - Call `applyReferralCodeAction` after successful signup
   - Auto-generate referral code for new users if they don't have one

5. **Trial Completion Tracking**:

   - Integrate `markTrialStarted` when user begins trial
   - Integrate `completeReferralAndGrantReward` when 7-day trial is completed
   - Set up a cron job to run `checkAndExpireStaleTrials` daily

6. **Testing**:
   - Test referral code generation
   - Test applying referral codes during signup
   - Test reward granting after trial completion

### Security Considerations

- Referral codes are case-insensitive and stored uppercase
- Users cannot refer themselves
- Each user can only be referred once
- Referral codes are unique across all users
- Consider implementing rate limiting on referral operations

## Implementation Notes

### Code Patterns Followed

1. **API Routes**: Using `withAuth` middleware and proper response type inference
2. **Data Fetching**: Using SWR hooks for client-side data fetching
3. **Mutations**: Using server actions with `next-safe-action`
4. **Types**: Using Prisma-generated types instead of manual interfaces
5. **Error Handling**: Using `SafeError` for user-facing errors

### TypeScript Configuration Issues

There are TypeScript module resolution issues that need to be addressed at the project level. The following imports are showing errors:

- `crypto` module imports
- `date-fns` imports
- `react` and component imports
- `next/server` imports

These appear to be configuration issues rather than code issues.
