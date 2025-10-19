# Onboarding Flows Documentation

> **Last Updated**: October 18, 2025  
> **Audience**: Product Managers, Engineers, Support Team  
> **Status**: Current Implementation

## Table of Contents

1. [Overview](#overview)
2. [High-Level Flow Diagram](#high-level-flow-diagram)
3. [Detailed User Flows](#detailed-user-flows)
4. [Page-by-Page Breakdown](#page-by-page-breakdown)
5. [Database Schema](#database-schema)
6. [Technical Implementation](#technical-implementation)
7. [Edge Cases & Error Handling](#edge-cases--error-handling)
8. [Analytics & Tracking](#analytics--tracking)
9. [Key Files Reference](#key-files-reference)

---

## Overview

Inbox Zero's onboarding process guides new users from initial sign-up through account setup to their first use of the application. The process is designed to:

1. **Authenticate users** via Google OAuth
2. **Show value propositions** to build excitement and set expectations
3. **Connect Gmail access** with proper OAuth scopes for email management
4. **Build anticipation** for the first Brief (email digest)
5. **Collect user preferences** through a multi-step survey
6. **Offer premium upgrade** with social proof and testimonials
7. **Direct to the app** where users can start managing their inbox

### Key Principles

- **Progressive disclosure**: Users see value before being asked for permissions
- **No dropoffs**: Once started, guide users smoothly to completion
- **Clear expectations**: Each step explains what's coming next
- **Personalization**: Use user's name throughout for a welcoming experience
- **Analytics tracking**: Every key action is logged for funnel optimization

### Onboarding Completion Marker

The database field `User.completedOnboardingAt` (type: `DateTime?`) determines onboarding status:
- **`NULL`**: User has not completed onboarding → Show onboarding pages
- **`NOT NULL`**: User has completed onboarding → Skip to app home

---

## High-Level Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    NEW USER JOURNEY                          │
└─────────────────────────────────────────────────────────────┘

1. Landing Page (/)
   User clicks "Get Started"
        ↓
2. Login Page (/login)
   User clicks "Continue with Google"
        ↓
3. Google OAuth (External)
   User grants account access
        ↓
4. Better-Auth Callback (Automatic)
   Creates user account, session
        ↓
5. Welcome Redirect (/welcome-redirect)
   Checks onboarding status
        ↓
6. Value Prop Page (/value-prop) ⭐ NEW
   Shows key features & benefits
        ↓
7. Connect Gmail Page (/connect-gmail) ⭐ NEW
   User grants Gmail API access
        ↓
8. Gmail OAuth (External)
   User grants Gmail permissions
        ↓
9. Gmail Callback (Automatic)
   Stores Gmail tokens
        ↓
10. Ready for Brief (/ready-for-brief) ⭐ NEW
    Teases upcoming Brief feature
        ↓
11. Welcome Survey (/welcome)
    Multi-step questionnaire (4-5 questions)
        ↓
12. Welcome Upgrade (/welcome-upgrade)
    Premium pricing page with "Skip" option
        ↓
13. App Home (/)
    User's main dashboard & inbox


┌─────────────────────────────────────────────────────────────┐
│                 RETURNING USER JOURNEY                       │
└─────────────────────────────────────────────────────────────┘

Already completed onboarding:
  Login (/login) → Welcome Redirect → App Home (/)

Abandoned onboarding:
  Login (/login) → Resume at appropriate onboarding step
```

---

## Detailed User Flows

### Flow 1: First-Time User (Happy Path)

**Scenario**: A brand new user signs up and completes the entire onboarding.

| Step | Page | Action | Next Step | Database State |
|------|------|--------|-----------|----------------|
| 1 | `/` (Landing) | User clicks "Get Started" | `/login` | No user record yet |
| 2 | `/login` | User clicks "Continue with Google" | Google OAuth | No user record yet |
| 3 | Google OAuth | User grants account access | Better-auth callback | User created with `completedOnboardingAt = NULL` |
| 4 | Auto-redirect | Better-auth processes callback | `/` | Session created |
| 5 | `/login` | Detects auth, auto-redirects | `/welcome-redirect` | Authenticated |
| 6 | `/welcome-redirect` | Checks `completedOnboardingAt` (NULL) | `/value-prop` | Still NULL |
| 7 | `/value-prop` | User sees value propositions, clicks "Continue" | `/connect-gmail` | Still NULL |
| 8 | `/connect-gmail` | User clicks "Connect Gmail" | Gmail OAuth flow | Still NULL |
| 9 | Gmail OAuth | User grants Gmail API access | Gmail callback | Still NULL |
| 10 | Gmail callback | Stores Gmail tokens, redirects | `/ready-for-brief` | Gmail tokens stored |
| 11 | `/ready-for-brief` | User sees Brief teaser, clicks "I'm ready" | `/welcome` | Still NULL |
| 12 | `/welcome` | User answers 4-5 survey questions | `/welcome-upgrade` | Survey answers stored, `completedOnboardingAt` set |
| 13 | `/welcome-upgrade` | User views pricing, clicks "Continue" or "Skip" | `/` (app home) | Onboarding complete |
| 14 | `/` (App Home) | User lands on main dashboard | - | Ready to use app |

**PostHog Events Fired**:
- `value_prop_continue_clicked` (step 7)
- `connect_gmail_clicked` (step 8)
- `ready_for_brief_continue_clicked` (step 11)
- Welcome survey question events (step 12)
- Premium upgrade decision events (step 13)

---

### Flow 2: Returning User (Already Completed Onboarding)

**Scenario**: User who has previously completed onboarding logs back in.

| Step | Page | Action | Next Step | Database State |
|------|------|--------|-----------|----------------|
| 1 | `/login` | User clicks "Continue with Google" | Google OAuth | User exists with `completedOnboardingAt` set |
| 2 | Google OAuth | User grants access | Better-auth callback | No changes |
| 3 | Auto-redirect | Better-auth processes callback | `/` | Session created |
| 4 | `/login` | Detects auth, auto-redirects | `/welcome-redirect` | Authenticated |
| 5 | `/welcome-redirect` | Checks `completedOnboardingAt` (NOT NULL) | `/` (app home) | Skip onboarding |
| 6 | `/` (App Home) | User lands on dashboard | - | Ready to use app |

**Key Difference**: `completedOnboardingAt` is already set, so `/welcome-redirect` skips directly to the app.

---

### Flow 3: User Abandons During Onboarding

**Scenario**: User starts onboarding but closes the browser before completing.

**Abandonment Point: After Value Prop, Before Gmail Connection**

| Step | Page | Action | Next Step | Database State |
|------|------|--------|-----------|----------------|
| 1 | Previous session | User left at `/value-prop` or `/connect-gmail` | Browser closed | `completedOnboardingAt = NULL` |
| 2 | `/login` | User logs back in days later | Google OAuth | `completedOnboardingAt = NULL` |
| 3 | `/welcome-redirect` | Checks `completedOnboardingAt` (NULL) | `/value-prop` | Still NULL |
| 4 | `/value-prop` onward | User resumes onboarding | Continue as Flow 1 | Completes onboarding |

**Abandonment Point: After Gmail Connection, Before Survey**

| Step | Page | Action | Next Step | Database State |
|------|------|--------|-----------|----------------|
| 1 | Previous session | User left at `/ready-for-brief` or `/welcome` | Browser closed | `completedOnboardingAt = NULL`, Gmail connected |
| 2 | `/login` | User logs back in | Google OAuth | `completedOnboardingAt = NULL` |
| 3 | `/welcome-redirect` | Checks `completedOnboardingAt` (NULL) | `/value-prop` | Still NULL |
| 4 | `/value-prop` | User clicks "Continue" | `/connect-gmail` | Gmail already connected |
| 5 | `/connect-gmail` | Detects Gmail already connected, auto-redirects | `/ready-for-brief` | Skips reconnection |
| 6 | `/ready-for-brief` onward | User resumes onboarding | Continue as Flow 1 | Completes onboarding |

**Key Insight**: Abandoned users always restart from `/value-prop` but can skip steps if already completed (like Gmail connection).

---

### Flow 4: User Manually Navigates to Onboarding Pages

**Scenario**: User with completed onboarding tries to access onboarding pages directly.

| Page Visited | User State | Result |
|--------------|------------|--------|
| `/value-prop` | `completedOnboardingAt` set | Redirects to `/` (app home) |
| `/connect-gmail` | `completedOnboardingAt` set | Redirects to `/` (app home) |
| `/ready-for-brief` | `completedOnboardingAt` set | Redirects to `/` (app home) |
| `/welcome` | `completedOnboardingAt` set | Allowed (can re-answer survey with `?force=true`) |
| `/welcome-redirect` | `completedOnboardingAt` set | Redirects to `/` (app home) |

**Protection**: All onboarding pages check `completedOnboardingAt` and redirect if set.

---

### Flow 5: Error During Gmail Connection

**Scenario**: User encounters an error during the Gmail OAuth flow.

| Step | Page | Action | Next Step | Error Type |
|------|------|--------|-----------|------------|
| 1 | `/connect-gmail` | User clicks "Connect Gmail" | Gmail OAuth | - |
| 2 | Gmail OAuth | User denies permissions | Gmail callback with error | `error=access_denied` |
| 3 | Gmail callback | Detects error, redirects | `/connect-gmail?error=missing_code` | Error query param |
| 4 | `/connect-gmail` | Shows error message to user | User can retry | Retry possible |

**Possible Gmail Callback Errors**:
- `missing_code`: No authorization code received
- `invalid_state`: CSRF token mismatch
- `invalid_state_format`: State parameter corrupted
- `invalid_state_type`: Wrong OAuth flow type
- `unauthorized`: No active session
- `forbidden`: Email account doesn't belong to user
- `missing_refresh_token`: Google didn't return refresh token (user needs to grant offline access)
- `connection_failed`: General error during token exchange

**Recovery**: User is redirected back to `/connect-gmail` with error parameter, shown error message, and can retry connection.

---

## Page-by-Page Breakdown

### 1. Landing Page (`/`)

**Purpose**: Marketing page that introduces Inbox Zero and drives sign-ups.

**Key Elements**:
- Hero section with value proposition
- "Get Started" CTA button
- Feature highlights
- Social proof / testimonials

**User Actions**:
- Click "Get Started" → Redirects to `/login`
- Already logged in → Auto-redirects to app home

**Technical Notes**:
- Static landing page, no authentication required
- Can be visited by anyone

---

### 2. Login Page (`/login`)

**Purpose**: Authentication page for both new sign-ups and returning users.

**File**: `apps/web/app/(landing)/login/page.tsx`

**Server-Side Logic**:
```typescript
1. Check if user is authenticated via auth()
2. If authenticated AND no error in searchParams:
   - If ?next query param exists → redirect(searchParams.next)
   - Otherwise → redirect(WELCOME_PATH) // = "/welcome-redirect"
3. If not authenticated → Render login form
```

**Key Elements**:
- "Sign In" heading
- "Continue with Google" button (via LoginForm component)
- Terms of Service & Privacy Policy links
- Google API User Data Policy disclosure

**User Actions**:
- Click "Continue with Google" → Initiates Google OAuth flow
- After OAuth success → Auto-redirects to `/welcome-redirect`

**Error Handling**:
- `?error=RequiresReconsent`: Silent (no alert shown)
- `?error=OAuthAccountNotLinked`: Shows "Account already attached" alert with merge option
- Other errors: Shows generic error alert

**Technical Notes**:
- Uses better-auth for OAuth
- OAuth redirect is configured in `apps/web/utils/auth.ts` line 59: `callbacks.redirect.signIn: "/"`
- Login page then detects auth and redirects to `WELCOME_PATH`

---

### 3. Welcome Redirect (`/welcome-redirect`)

**Purpose**: Router page that directs users to the appropriate destination based on onboarding status.

**File**: `apps/web/app/(landing)/welcome-redirect/page.tsx`

**Server-Side Logic**:
```typescript
1. Check authentication → If NO → redirect("/login")
2. Query user from database (completedOnboardingAt, utms)
3. If user not found → redirect("/login")
4. If completedOnboardingAt is NOT NULL (unless ?force=true) → redirect(APP_HOME_PATH)
5. Otherwise → redirect("/value-prop")
```

**Key Features**:
- No UI rendered (pure router page)
- Can force re-entry to onboarding with `?force=true` query param
- Stores UTM parameters for analytics

**Technical Notes**:
- This is the single point of entry for post-authentication routing
- Changed from redirecting to `/onboarding` to redirecting to `/value-prop`

---

### 4. Value Prop Page (`/value-prop`) ⭐ NEW

**Purpose**: Show value propositions to build excitement before asking for Gmail access.

**Files**:
- Server: `apps/web/app/(landing)/value-prop/page.tsx`
- Client: `apps/web/app/(landing)/value-prop/ValuePropContent.tsx`

**Server-Side Logic**:
```typescript
1. Check authentication → If NO → redirect("/login")
2. Query user (completedOnboardingAt, name, email)
3. If user not found → redirect("/login")
4. If completedOnboardingAt is NOT NULL → redirect(APP_HOME_PATH)
5. Otherwise → Render ValuePropContent with userName
```

**Key Elements**:
- Personalized heading: "Let's help you reclaim your focus, {userName}."
- Subheading explaining daily Briefs
- 4 value proposition cards:
  1. **Morning Brief** (SparklesIcon) - "Your curated digest of what matters, delivered at 8am"
  2. **One-Click Actions** (ZapIcon) - "Quick unsubscribe, archive, and organize with a single click"
  3. **Track Important Conversations** (BellIcon) - "Never miss a reply or forget to follow up"
  4. **No Clutter, No Noise** (ShieldCheckIcon) - "Block cold emails and focus on what actually matters"
- Privacy reassurance: "You'll connect your inbox next — we only read what's new since you joined."
- "Continue" button with arrow icon

**User Actions**:
- Click "Continue" button → Fires `value_prop_continue_clicked` event, navigates to `/connect-gmail`

**UI/UX Details**:
- Full-screen with SquaresPattern background
- White card with shadow, max-width 2xl (672px)
- Smooth fade-in animation
- Responsive grid/stack layout
- Mobile-friendly button styling

**Technical Notes**:
- Server component handles auth/redirects, client component handles UI/interactions
- Uses PostHog for analytics tracking
- Falls back to email username if user has no name

---

### 5. Connect Gmail Page (`/connect-gmail`) ⭐ NEW

**Purpose**: Request Gmail API access with proper scopes for email management.

**Files**:
- Server: `apps/web/app/(landing)/connect-gmail/page.tsx`
- Client: `apps/web/app/(landing)/connect-gmail/ConnectGmailContent.tsx`

**Server-Side Logic**:
```typescript
1. Check authentication → If NO → redirect("/login")
2. Query user (completedOnboardingAt, name, email)
3. If user not found → redirect("/login")
4. If completedOnboardingAt is NOT NULL → redirect("/")
5. Otherwise → Render ConnectGmailContent with userName
```

**Key Elements**:
- Heading explaining Gmail connection
- Description of what permissions are needed and why
- "Connect Gmail" button that initiates OAuth flow
- Error messages if connection fails (via `?error` query param)

**User Actions**:
- Click "Connect Gmail" → Initiates Gmail OAuth flow with proper scopes
- After OAuth success → Redirects to `/ready-for-brief`

**OAuth Flow**:
1. Client calls API to generate OAuth URL with state
2. User redirected to Google's OAuth consent screen
3. User grants permissions
4. Google redirects to `/api/google/gmail/callback`
5. Callback validates state, exchanges code for tokens, stores in database
6. Callback redirects to `/ready-for-brief`

**Error Handling**:
- Shows error messages based on `?error` query parameter
- User can retry connection on error
- See "Flow 5: Error During Gmail Connection" for error types

**Technical Notes**:
- Uses separate Gmail OAuth client with Gmail-specific scopes
- State parameter includes CSRF protection
- Stores access_token and refresh_token in database
- See `apps/web/app/api/google/gmail/callback/route.ts` for callback logic

---

### 6. Ready for Brief Page (`/ready-for-brief`) ⭐ NEW

**Purpose**: Build anticipation for the first Brief (daily email digest) after Gmail connection.

**Files**:
- Server: `apps/web/app/(landing)/ready-for-brief/page.tsx`
- Client: `apps/web/app/(landing)/ready-for-brief/ReadyForBriefContent.tsx`

**Server-Side Logic**:
```typescript
1. Check authentication → If NO → redirect("/login")
2. Query user (completedOnboardingAt, name, email)
3. If user not found → redirect("/login")
4. If completedOnboardingAt is NOT NULL → redirect(APP_HOME_PATH)
5. Otherwise → Render ReadyForBriefContent with userName
```

**Key Elements**:
- Heading: "Get ready for your first Brief, {userName}!"
- 2-3 sentences building excitement about organizing inbox and first Brief
- Large "I'm ready" button

**User Actions**:
- Click "I'm ready" → Fires `ready_for_brief_continue_clicked` event, navigates to `/welcome`

**UI/UX Details**:
- Matches visual style of value-prop and connect-gmail pages
- SquaresPattern background with CardBasic wrapper
- Responsive design for mobile and desktop

**Technical Notes**:
- Server component for auth/data fetching, client component for interactions
- PostHog tracking for button click
- Simple intermediary page to control pacing

---

### 7. Welcome Survey Page (`/welcome`)

**Purpose**: Collect user preferences and information through a multi-step questionnaire.

**File**: `apps/web/app/(landing)/welcome/page.tsx`

**Server-Side Logic**:
```typescript
1. Get current question index from ?question query param (default 0)
2. Fetch user and store UTM parameters (in background via after())
3. Render OnboardingForm with current question index
```

**Key Elements**:
- "Welcome to Inbox Zero" heading
- "Let's get you set up!" subheading
- Multi-step form with progress indicator
- Question types:
  - Multiple choice (features, source)
  - Single choice (role, goal, company size)
  - Open text (improvements)

**Survey Questions** (typical flow):
1. What features are you interested in?
2. What's your role?
3. What do you want to achieve with Inbox Zero?
4. How large is your company?
5. How did you hear about us?
6. What would you like to improve about your email workflow? (optional)

**User Actions**:
- Answer questions → Progress through survey
- Complete final question → Survey answers stored, `completedOnboardingAt` set, redirect to `/welcome-upgrade`

**Technical Notes**:
- Question index controlled via URL query param
- Answers stored in `User.onboardingAnswers` (JSON) and extracted to specific fields
- Sets `completedOnboardingAt` timestamp upon completion
- Uses PostHog for survey response tracking
- Can be accessed with `?force=true` to re-answer even if completed

---

### 8. Welcome Upgrade Page (`/welcome-upgrade`)

**Purpose**: Offer premium subscription with pricing and social proof.

**File**: `apps/web/app/(landing)/welcome-upgrade/page.tsx`

**Server-Side Logic**:
- No authentication requirement or redirects
- Open to all users (can be accessed directly)

**Key Elements**:
- WelcomeUpgradeNav (navigation header)
- WelcomeUpgradeHeader (upgrade pitch)
- PricingLazy component with plans and pricing
- "Skip Upgrade" option to continue to app
- Testimonial section with social proof
- Footer

**User Actions**:
- Choose a plan → Initiates checkout flow
- Click "Skip Upgrade" → Navigates to `/` (app home)
- Click "Continue to App" → Navigates to `/` (app home)

**Technical Notes**:
- Uses lazy-loaded pricing component for performance
- Integrated with billing system (Stripe/Lemon Squeezy)
- Optional step in onboarding (can be skipped)
- No database changes on this page (premium status set elsewhere)

---

### 9. App Home (`/`)

**Purpose**: Main application dashboard where users manage their inbox.

**Entry Conditions**:
- User is authenticated
- `completedOnboardingAt` is set (onboarding complete)
- OR user manually navigates to app (will be redirected if needed)

**Key Features**:
- Inbox view with emails
- Brief digest (if available)
- Quick actions (archive, unsubscribe, etc.)
- Sidebar navigation
- Settings access

**Technical Notes**:
- Main app functionality begins here
- Protected by authentication middleware
- See main app documentation for detailed features

---

## Database Schema

### User Model

**File**: `apps/web/prisma/schema.prisma` (lines 49-99)

**Key Fields for Onboarding**:

```prisma
model User {
  id                       String    @id @default(cuid())
  name                     String?   // Used for personalization
  email                    String    @unique
  emailVerified            Boolean?  @default(false)
  
  // Onboarding tracking
  completedOnboardingAt    DateTime? // NULL = not completed, NOT NULL = completed
  completedAppOnboardingAt DateTime? // In-app onboarding tutorial
  onboardingAnswers        Json?     // Raw survey answers
  
  // Survey answers (extracted from onboardingAnswers)
  surveyFeatures           String[]  // Multiple choice features
  surveyRole               String?   // User's role
  surveyGoal               String?   // User's goal
  surveyCompanySize        Int?      // Company size (1, 5, 50, 500, 1000)
  surveySource             String?   // How they heard about us
  surveyImprovements       String?   // Open text feedback
  
  // Analytics
  utms                     Json?     // UTM parameters
  lastLogin                DateTime?
  
  // Relationships
  accounts                 Account[]
  sessions                 Session[]
  emailAccounts            EmailAccount[]
  
  // ... other fields
}
```

**Critical Field: `completedOnboardingAt`**
- Type: `DateTime?` (nullable)
- Purpose: Single source of truth for onboarding status
- `NULL`: User hasn't completed onboarding → Show onboarding flow
- `NOT NULL`: User has completed onboarding → Skip to app
- Set when: User completes welcome survey (final question)

**Survey Fields**:
- Populated from `onboardingAnswers` JSON for easier querying
- Used for analytics, personalization, and product insights
- Optional fields (can be NULL if user skips questions)

### EmailAccount Model

**Key Fields for Gmail Connection**:

```prisma
model EmailAccount {
  id        String   @id @default(cuid())
  email     String   @unique
  userId    String   // Foreign key to User
  accountId String   // Foreign key to Account (OAuth)
  
  // ... other fields
}
```

### Account Model (OAuth)

**Key Fields for Gmail Tokens**:

```prisma
model Account {
  id            String    @id @default(cuid())
  userId        String    // Foreign key to User
  providerId    String    // "google"
  access_token  String?   // Gmail API access token
  refresh_token String?   // Gmail API refresh token
  expires_at    DateTime? // Token expiration
  
  // ... other fields
}
```

**Gmail Connection Flow**:
1. User account created with basic Google OAuth (sign-in only)
2. EmailAccount record created linked to User
3. Later, user goes through `/connect-gmail` flow
4. Account tokens updated with Gmail API access
5. Tokens stored in Account model, linked via EmailAccount

---

## Technical Implementation

### Authentication Flow

**Libraries**:
- `better-auth`: Main authentication library
- `next/navigation`: Server-side redirects
- `@/utils/auth`: Auth utility with `auth()` function

**Configuration** (`apps/web/utils/auth.ts`):
```typescript
export const auth = betterAuth({
  // ... config
  callbacks: {
    redirect: {
      signIn: "/",  // After OAuth, redirect to home
    },
  },
});
```

**Auth Check Pattern** (used in all protected pages):
```typescript
const session = await auth();
if (!session?.user) {
  redirect("/login");
}
```

### Redirect Logic Pattern

**Welcome Redirect** (central router):
```typescript
// 1. Check auth
if (!session?.user) redirect("/login");

// 2. Get user data
const user = await prisma.user.findUnique({
  where: { id: session.user.id },
  select: { completedOnboardingAt: true, utms: true },
});

// 3. Check onboarding status
if (!searchParams.force && user.completedOnboardingAt) {
  redirect(APP_HOME_PATH);
}

// 4. Redirect to onboarding start
redirect("/value-prop");
```

**Onboarding Page Pattern** (value-prop, connect-gmail, ready-for-brief):
```typescript
// 1. Check auth
if (!session?.user) redirect("/login");

// 2. Get user data
const user = await prisma.user.findUnique({
  where: { id: session.user.id },
  select: { completedOnboardingAt: true, name: true, email: true },
});

// 3. If already completed, skip to app
if (user.completedOnboardingAt) {
  redirect(APP_HOME_PATH);
}

// 4. Otherwise, render page
return <PageContent userName={userName} />;
```

### OAuth State Management

**CSRF Protection** for Gmail OAuth:

**State Generation** (`/connect-gmail`):
```typescript
const state = createOAuthState({
  emailAccountId: user.emailAccountId,
  type: "gmail",
  nonce: randomString(),
});

// Store in HTTP-only cookie
cookies.set(GMAIL_STATE_COOKIE_NAME, state);

// Include in OAuth URL
const authUrl = `${GOOGLE_OAUTH_URL}?state=${state}&...`;
```

**State Validation** (`/api/google/gmail/callback`):
```typescript
const receivedState = searchParams.get("state");
const storedState = request.cookies.get(GMAIL_STATE_COOKIE_NAME);

// Verify match
if (storedState !== receivedState) {
  throw new Error("Invalid state");
}

// Parse and validate
const decodedState = parseOAuthState(storedState);
if (decodedState.type !== "gmail") {
  throw new Error("Invalid state type");
}

// Verify ownership
const emailAccount = await prisma.emailAccount.findFirst({
  where: {
    id: decodedState.emailAccountId,
    userId: session.user.id,
  },
});
```

### Component Patterns

**Server Components** (data fetching, auth, redirects):
```typescript
// page.tsx
export default async function PageName() {
  const session = await auth();
  const user = await prisma.user.findUnique({ ... });
  
  return <ClientContent data={data} />;
}
```

**Client Components** (interactivity, navigation, analytics):
```typescript
// PageContent.tsx
"use client";

export function PageContent({ userName }: { userName: string }) {
  const router = useRouter();
  const posthog = usePostHog();
  
  const handleClick = () => {
    posthog.capture("event_name");
    router.push("/next-page");
  };
  
  return <button onClick={handleClick}>Continue</button>;
}
```

### Analytics Tracking

**PostHog Events**:
- `value_prop_continue_clicked`: User clicks Continue on value prop page
- `connect_gmail_clicked`: User initiates Gmail OAuth
- `ready_for_brief_continue_clicked`: User proceeds from brief teaser
- `onboarding_question_answered`: User answers survey question
- `onboarding_completed`: User completes all survey questions
- `upgrade_plan_selected`: User chooses premium plan
- `upgrade_skipped`: User skips premium upgrade

**Implementation Pattern**:
```typescript
const posthog = usePostHog();

const handleAction = () => {
  posthog.capture("event_name", {
    property1: "value1",
    property2: "value2",
  });
  
  // Continue with action
  router.push("/next-page");
};
```

---

## Edge Cases & Error Handling

### 1. User Has No Name

**Scenario**: User's Google account doesn't provide a name.

**Handling**:
```typescript
const userName = user.name || user.email?.split("@")[0] || "there";
```

**Fallback Order**:
1. Use `user.name` if available
2. Use email username (before @) if available
3. Use "there" as final fallback

---

### 2. User Manually Visits Onboarding After Completion

**Scenario**: User bookmarks `/value-prop` and visits after completing onboarding.

**Handling**: All onboarding pages check `completedOnboardingAt`:
```typescript
if (user.completedOnboardingAt) {
  redirect(APP_HOME_PATH);
}
```

**Exception**: `/welcome` can be re-accessed with `?force=true` to update survey answers.

---

### 3. Gmail OAuth Errors

**Scenario**: User denies permissions or encounters error during Gmail OAuth.

**Errors & Handling**:

| Error Code | Cause | User Message | Recovery |
|------------|-------|--------------|----------|
| `missing_code` | No authorization code | "Connection failed. Please try again." | Retry button |
| `invalid_state` | CSRF token mismatch | "Security check failed. Please try again." | Retry button |
| `invalid_state_format` | Corrupted state | "Something went wrong. Please try again." | Retry button |
| `invalid_state_type` | Wrong OAuth type | "Invalid connection type. Please try again." | Retry button |
| `unauthorized` | No session | "Please log in first." | Redirect to login |
| `forbidden` | Wrong user | "This account doesn't belong to you." | Redirect to login |
| `missing_refresh_token` | No offline access | "Please grant offline access." | Retry with prompt=consent |
| `connection_failed` | General error | "Connection failed. Please try again." | Retry button |

**Implementation**:
```typescript
// Callback redirects with error
redirectUrl.searchParams.set("error", "missing_code");
return NextResponse.redirect(redirectUrl);

// Connect Gmail page shows error
if (searchParams.error) {
  return <ErrorMessage error={searchParams.error} />;
}
```

---

### 4. User Closes Browser Mid-Onboarding

**Scenario**: User starts onboarding but doesn't complete it in one session.

**Behavior**:
1. `completedOnboardingAt` remains `NULL`
2. User can log back in anytime
3. Redirected to `/welcome-redirect`
4. Sent back to `/value-prop` to resume
5. Can skip already-completed steps (e.g., Gmail connection)

**Why Start at `/value-prop`?**
- Ensures user always sees the value proposition
- Provides context for why Gmail access is needed
- Consistent entry point for all incomplete onboarding

---

### 5. PostHog Not Loaded

**Scenario**: PostHog script fails to load or is blocked.

**Handling**:
```typescript
const posthog = usePostHog();

const handleClick = () => {
  // PostHog capture fails silently if not loaded
  posthog?.capture("event_name");
  
  // Navigation still works
  router.push("/next-page");
};
```

**Result**: Page functionality unaffected, analytics event silently skipped.

---

### 6. Database Query Fails

**Scenario**: Prisma query fails (database down, network issue).

**Handling**: Let error propagate to Next.js error boundary:
```typescript
const user = await prisma.user.findUnique({ ... });
// If fails, Next.js shows error page
```

**User Experience**:
- Next.js error page shown
- User can refresh to retry
- Error logged to monitoring (Sentry, etc.)

---

### 7. User Logs Out Mid-Onboarding

**Scenario**: User logs out before completing onboarding.

**Behavior**:
1. Session destroyed
2. `completedOnboardingAt` still `NULL`
3. User redirected to login on next onboarding page visit
4. Can log back in and resume later

---

### 8. Multiple Browser Tabs

**Scenario**: User opens onboarding in multiple tabs simultaneously.

**Behavior**:
1. Each tab operates independently
2. Database writes are atomic (last write wins)
3. One tab can complete onboarding
4. Other tabs redirect to app on next navigation (detect `completedOnboardingAt`)

**Potential Issue**: User could complete survey twice in different tabs.

**Mitigation**: `completedOnboardingAt` ensures redirect after first completion.

---

### 9. Gmail Already Connected

**Scenario**: User has already connected Gmail but abandons before completing onboarding.

**Expected Behavior**:
1. User returns to `/connect-gmail`
2. Page detects Gmail tokens already exist
3. Auto-redirects to `/ready-for-brief`
4. User continues from there

**Current Implementation**: User can re-initiate Gmail OAuth (tokens overwritten).

**Improvement Opportunity**: Check if Gmail tokens exist and skip to next step.

---

### 10. User Changes Email Mid-Onboarding

**Scenario**: User logs in with different Google account after starting onboarding.

**Behavior**:
1. Separate user record created for each email
2. Each has its own `completedOnboardingAt` status
3. No cross-contamination of onboarding progress

---

## Analytics & Tracking

### Onboarding Funnel Metrics

**Key Metrics to Track**:

1. **Sign-Up Funnel**:
   - Landing page visits
   - "Get Started" clicks
   - Login page loads
   - "Continue with Google" clicks
   - Successful authentications

2. **Value Prop Stage**:
   - `/value-prop` page loads
   - Time spent on page
   - "Continue" button clicks
   - Drop-off rate

3. **Gmail Connection Stage**:
   - `/connect-gmail` page loads
   - "Connect Gmail" clicks
   - OAuth consent screen views (external)
   - Successful connections
   - Error rate by error type
   - Drop-off rate

4. **Brief Teaser Stage**:
   - `/ready-for-brief` page loads
   - "I'm ready" clicks
   - Drop-off rate

5. **Survey Stage**:
   - `/welcome` page loads by question number
   - Answers per question
   - Time spent per question
   - Question skip rate
   - Survey completion rate
   - Drop-off by question

6. **Upgrade Stage**:
   - `/welcome-upgrade` page loads
   - Plan selection clicks
   - Upgrade completion rate
   - Skip rate
   - Time spent on page

7. **Overall**:
   - End-to-end completion rate (login → app home)
   - Time to complete onboarding
   - Drop-off points (where users abandon)

### PostHog Implementation

**Event Naming Convention**:
- Lowercase with underscores
- Action-focused (e.g., `button_clicked`, `page_viewed`)
- Contextual (e.g., `value_prop_continue_clicked` not just `continue_clicked`)

**Standard Properties**:
```typescript
posthog.capture("event_name", {
  page: "/value-prop",
  user_id: session.user.id,
  email: session.user.email,
  timestamp: new Date().toISOString(),
});
```

**Survey Answer Tracking**:
```typescript
posthog.capture("onboarding_question_answered", {
  question_index: 0,
  question_text: "What features are you interested in?",
  answer: ["Brief", "Unsubscribe", "Block cold emails"],
});
```

### Conversion Goals

**Primary Goal**: User completes onboarding (`completedOnboardingAt` set)

**Secondary Goals**:
- User connects Gmail (has valid tokens)
- User subscribes to premium
- User remains active 7 days after onboarding

**Drop-Off Analysis**:
- Calculate conversion rate between each step
- Identify bottlenecks (steps with highest drop-off)
- A/B test messaging and flow changes

---

## Key Files Reference

### Core Onboarding Pages

| File | Type | Purpose |
|------|------|---------|
| `apps/web/app/(landing)/login/page.tsx` | Server | Login page, handles OAuth redirect |
| `apps/web/app/(landing)/login/LoginForm.tsx` | Client | Google OAuth button |
| `apps/web/app/(landing)/welcome-redirect/page.tsx` | Server | Router to appropriate destination |
| `apps/web/app/(landing)/value-prop/page.tsx` | Server | Value proposition page |
| `apps/web/app/(landing)/value-prop/ValuePropContent.tsx` | Client | Value prop UI and interaction |
| `apps/web/app/(landing)/connect-gmail/page.tsx` | Server | Gmail connection page |
| `apps/web/app/(landing)/connect-gmail/ConnectGmailContent.tsx` | Client | Gmail connection UI |
| `apps/web/app/api/google/gmail/callback/route.ts` | API | Gmail OAuth callback handler |
| `apps/web/app/(landing)/ready-for-brief/page.tsx` | Server | Brief teaser page |
| `apps/web/app/(landing)/ready-for-brief/ReadyForBriefContent.tsx` | Client | Brief teaser UI |
| `apps/web/app/(landing)/welcome/page.tsx` | Server | Welcome survey page |
| `apps/web/app/(landing)/welcome/form.tsx` | Client | Multi-step survey form |
| `apps/web/app/(landing)/welcome-upgrade/page.tsx` | Server | Premium upgrade page |

### Authentication & Utilities

| File | Type | Purpose |
|------|------|---------|
| `apps/web/utils/auth.ts` | Util | Better-auth configuration, `auth()` function |
| `apps/web/utils/config.ts` | Util | Constants (WELCOME_PATH, etc.) |
| `apps/web/utils/prisma.ts` | Util | Prisma client instance |
| `apps/web/utils/gmail/client.ts` | Util | Gmail OAuth client setup |
| `apps/web/utils/gmail/constants.ts` | Util | Gmail-related constants |
| `apps/web/utils/gmail/scopes.ts` | Util | Gmail API scopes definition |
| `apps/web/utils/oauth/state.ts` | Util | OAuth state creation and parsing |

### Database

| File | Type | Purpose |
|------|------|---------|
| `apps/web/prisma/schema.prisma` | Schema | Database models (User, Account, EmailAccount) |

### Shared Components

| File | Type | Purpose |
|------|------|---------|
| `apps/web/components/ui/card.tsx` | Component | CardBasic wrapper |
| `apps/web/components/ui/button.tsx` | Component | Button component |
| `apps/web/components/Typography.tsx` | Component | PageHeading, TypographyP |
| `apps/web/app/(landing)/home/SquaresPattern.tsx` | Component | Background pattern |

---

## Future Improvements

### Potential Enhancements

1. **Skip Gmail Connection If Already Connected**:
   - Check for existing tokens in `/connect-gmail`
   - Auto-redirect if already connected
   - Avoid unnecessary re-authorization

2. **Progress Indicator**:
   - Show "Step X of Y" across onboarding pages
   - Help users understand how far they are
   - Reduce abandonment by showing progress

3. **Back Button Support**:
   - Allow users to go back and change answers
   - Store partial state in database or session
   - Update survey to support back navigation

4. **Email Verification**:
   - Send verification email after sign-up
   - Require verification before accessing app
   - Reduce fake accounts

5. **Onboarding Resume Email**:
   - Send email to users who abandon onboarding
   - Include direct link to resume
   - Increase completion rate

6. **A/B Testing Framework**:
   - Test different value prop copy
   - Test number of survey questions
   - Test upgrade page placement

7. **Personalized Onboarding**:
   - Show different value props based on UTM source
   - Customize survey questions by role
   - Tailor app home based on survey answers

8. **In-App Onboarding Tutorial**:
   - Separate from initial onboarding
   - Guide users through first actions in app
   - Use `completedAppOnboardingAt` field

9. **Mobile App Deep Linking**:
   - If user has mobile app, deep link instead of web
   - Seamless cross-platform onboarding

10. **Internationalization**:
    - Translate onboarding pages
    - Detect user language from browser
    - Store language preference

---

## Appendix

### Environment Variables

**Required for Onboarding**:

```bash
# Google OAuth (Account Access)
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/callback/google

# Google OAuth (Gmail Access)
GMAIL_OAUTH_CLIENT_ID=xxx
GMAIL_OAUTH_CLIENT_SECRET=xxx
GMAIL_OAUTH_REDIRECT_URI=http://localhost:3000/api/google/gmail/callback

# Database
DATABASE_URL=postgresql://xxx

# App Config
NEXT_PUBLIC_APP_HOME_PATH=/
NEXT_PUBLIC_SUPPORT_EMAIL=support@example.com

# Analytics
NEXT_PUBLIC_POSTHOG_KEY=xxx
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

### Testing Checklist

**Manual Testing Steps**:

1. ☐ New user sign-up flow end-to-end
2. ☐ Returning user (completed onboarding) login
3. ☐ Abandoned onboarding resume (various stages)
4. ☐ Gmail OAuth error handling (deny permissions)
5. ☐ Survey question answering and navigation
6. ☐ Premium upgrade and skip flows
7. ☐ Direct navigation to onboarding pages (should redirect)
8. ☐ Mobile responsiveness on all pages
9. ☐ PostHog events firing correctly
10. ☐ Database fields updating correctly

**Automated Testing**:
- See `apps/web/__tests__/value-prop-*.test.ts*` for examples
- Test redirect logic for each page
- Test auth checks
- Test error handling

### Support Scenarios

**Common User Issues**:

1. **"I'm stuck on the Gmail connection page"**:
   - Check browser console for errors
   - Verify Gmail OAuth credentials
   - Try different browser (pop-up blockers)
   - Clear cookies and retry

2. **"I completed onboarding but it's asking me to do it again"**:
   - Check `completedOnboardingAt` in database
   - Verify user is logged into correct account
   - Check for session issues

3. **"The survey won't let me continue"**:
   - Check if question is required
   - Verify form validation
   - Check browser console for errors
   - Try refreshing page

4. **"I want to change my survey answers"**:
   - Direct to `/welcome?force=true`
   - This allows re-answering survey

5. **"I granted Gmail access but nothing happened"**:
   - Check callback logs for errors
   - Verify tokens were stored in database
   - Check if user denied offline access
   - Retry Gmail connection

---

**Document Version**: 1.0  
**Last Reviewed**: October 18, 2025  
**Next Review**: January 2026 or upon significant flow changes

For questions or updates, contact the Product team or update this document directly.

