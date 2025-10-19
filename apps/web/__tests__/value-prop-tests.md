# Value Proposition Page Tests

## Overview

Comprehensive test suite for the value proposition onboarding page (`/value-prop`). These tests cover the complete user journey from authentication through onboarding, including edge cases and integration scenarios.

## Test Files

### 1. `value-prop.test.tsx` - Component Tests
Tests for the client-side `ValuePropContent` component.

**Coverage:**
- ✅ Rendering with different user names (58 test cases)
- ✅ All 4 value proposition cards display correctly
- ✅ Continue button interaction and navigation
- ✅ PostHog analytics event firing
- ✅ Handling missing PostHog gracefully
- ✅ Different PostHog survey configurations
- ✅ Accessibility features
- ✅ Responsive design classes
- ✅ Edge cases (long names, emojis, special characters)
- ✅ Content validation

**Key Test Suites:**
- `Rendering Tests` - Verifies UI elements render correctly
- `Continue Button Interaction Tests` - Tests button click behavior
- `Value Propositions Content Tests` - Validates content accuracy
- `Accessibility Tests` - Ensures accessibility compliance
- `Responsive Design Tests` - Checks mobile/desktop styles
- `Edge Cases` - Handles unusual inputs
- `Content Validation` - Verifies copy matches requirements

### 2. `value-prop-page.test.ts` - Server-Side Logic Tests
Tests for the server component page logic and redirect behavior.

**Coverage:**
- ✅ Authentication checks (redirect to /login if not authenticated)
- ✅ Database user queries
- ✅ Onboarding status checks (completedOnboardingAt)
- ✅ User name handling and fallbacks
- ✅ Redirect logic to app home when onboarding completed
- ✅ Database errors and timeouts
- ✅ Malformed session data
- ✅ Page metadata

**Key Test Suites:**
- `Authentication Checks` - Session validation
- `User Database Checks` - Database query validation
- `Onboarding Status Checks` - Completion flag handling
- `User Name Handling` - Name extraction logic
- `Redirect Logic` - Navigation paths
- `Edge Cases` - Error scenarios
- `Metadata Tests` - SEO metadata

### 3. `value-prop-integration.test.ts` - Integration Tests
Tests for the complete user flow from authentication to onboarding completion.

**Coverage:**
- ✅ Welcome redirect → Value prop flow
- ✅ Access control for different user states
- ✅ New user sign-up journey
- ✅ Returning user who abandoned onboarding
- ✅ Fully onboarded user (skip value prop)
- ✅ Manual URL access after onboarding
- ✅ Concurrent onboarding attempts
- ✅ Session expiry during onboarding
- ✅ Data integrity across flow
- ✅ PostHog configuration handling
- ✅ URL and route configuration

**Key Test Suites:**
- `Welcome Redirect → Value Prop Flow` - End-to-end redirect chain
- `Value Prop Page Access Control` - Authorization checks
- `Complete User Journey - New Sign Up` - Full onboarding flow
- `Edge Cases in User Flow` - Unusual scenarios
- `Data Integrity Tests` - Data consistency
- `PostHog Configuration Tests` - Analytics setup
- `URL and Route Configuration` - Path validation
- `Performance and Timing Tests` - Load handling

## Running Tests

### Run All Tests
```bash
pnpm test
```

### Run Only Value Prop Tests
```bash
pnpm test value-prop
```

### Run Specific Test File
```bash
# Component tests only
pnpm test value-prop.test.tsx

# Server logic tests only
pnpm test value-prop-page.test.ts

# Integration tests only
pnpm test value-prop-integration.test.ts
```

### Run Tests in Watch Mode
```bash
pnpm test --watch value-prop
```

### Run Tests with Coverage
```bash
pnpm test --coverage value-prop
```

## Test Statistics

**Total Test Cases:** 100+
- Component Tests: 50+ test cases
- Server Logic Tests: 20+ test cases
- Integration Tests: 30+ test cases

**Coverage Areas:**
1. ✅ Authentication & Authorization
2. ✅ Database Queries & User Management
3. ✅ UI Rendering & Display
4. ✅ User Interactions (clicks, navigation)
5. ✅ Analytics (PostHog events)
6. ✅ Redirect Logic & Flow Control
7. ✅ Error Handling & Edge Cases
8. ✅ Accessibility & Responsive Design
9. ✅ Content Validation
10. ✅ Integration & End-to-End Flows

## Testing Requirements Met

### From value-prop.plan.md

#### Phase 1: File System Verification ✅
- Verified /value-prop route exists
- All files created correctly

#### Phase 2: Basic Route & Redirect Tests ✅
- ✅ Redirect to /login when logged out
- ✅ Redirect to app home when completedOnboardingAt is set
- ✅ Show page when logged in without completedOnboardingAt

#### Phase 3: UI Component Tests ✅
- ✅ User name displays correctly in heading
- ✅ All 4 value proposition cards display
- ✅ Icons, titles, and descriptions render
- ✅ Privacy text displays
- ✅ Continue button renders

#### Phase 4: Interaction Tests ✅
- ✅ Continue button navigates to /welcome
- ✅ PostHog event fires on click
- ✅ Handles missing PostHog gracefully

#### Phase 5: Integration Tests ✅
- ✅ After auth, redirects through welcome-redirect → value-prop
- ✅ Complete end-to-end flow tested
- ✅ Multiple user scenarios covered

## Edge Cases Tested

### User Authentication
- ✅ No session (logged out)
- ✅ Invalid session
- ✅ Session expiry during flow
- ✅ User deleted from database but session exists
- ✅ Malformed session data

### User Names
- ✅ Full name present
- ✅ Name is null (fallback to email prefix)
- ✅ Name is empty string
- ✅ No email (fallback to "there")
- ✅ Email without @ symbol
- ✅ Complex email addresses (with +, etc.)
- ✅ Very long names (100+ characters)
- ✅ Names with emojis
- ✅ Names with numbers
- ✅ Names with special characters

### Onboarding Status
- ✅ completedOnboardingAt is null
- ✅ completedOnboardingAt is set (any date)
- ✅ Future date in completedOnboardingAt
- ✅ Past date in completedOnboardingAt

### User Scenarios
- ✅ Brand new user
- ✅ Returning user who abandoned onboarding
- ✅ Fully onboarded user
- ✅ User manually visits /value-prop after onboarding
- ✅ Concurrent onboarding attempts

### PostHog Configuration
- ✅ PostHog survey ID configured
- ✅ PostHog survey ID not configured
- ✅ PostHog not loaded
- ✅ PostHog undefined

### Database & Network
- ✅ Database connection errors
- ✅ Auth timeout errors
- ✅ Slow database queries
- ✅ Rapid sequential requests

### Button Interactions
- ✅ Single click
- ✅ Multiple rapid clicks
- ✅ Click with missing router

## Mock Strategy

### Mocked Dependencies
1. **next/navigation**
   - `redirect()` - Throws error with redirect URL
   - `useRouter()` - Returns mock router with push, replace, etc.

2. **@/utils/auth**
   - `auth()` - Returns mock session

3. **@/utils/prisma**
   - `prisma.user.findUnique()` - Returns mock user data

4. **posthog-js/react**
   - `usePostHog()` - Returns mock PostHog client

5. **@/utils/actions/onboarding**
   - `completedOnboardingAction()` - Mock server action

6. **@/env**
   - Environment variables mocked for testing

### Why These Mocks?
- **Server-Only Code**: Can't run server components directly in tests
- **External Services**: PostHog, database, auth providers
- **Next.js Routing**: Testing redirects without browser
- **Isolation**: Each test runs independently

## Continuous Integration

These tests should be run:
- ✅ On every commit (pre-commit hook)
- ✅ On every pull request
- ✅ Before deployment
- ✅ In CI/CD pipeline

## Test Maintenance

### When to Update Tests

Update tests when:
1. Value proposition copy changes
2. Number of value props changes
3. Redirect logic changes
4. Authentication flow changes
5. PostHog event names change
6. New edge cases discovered

### Adding New Tests

To add new tests:
1. Identify the scenario to test
2. Choose appropriate test file:
   - Component behavior → `value-prop.test.tsx`
   - Server logic → `value-prop-page.test.ts`
   - Full flow → `value-prop-integration.test.ts`
3. Follow existing patterns
4. Use descriptive test names
5. Clean up mocks in `beforeEach()`

## Known Limitations

1. **Visual Testing**: These tests don't validate visual appearance, only DOM structure
2. **E2E Testing**: Not true end-to-end tests (use Playwright/Cypress for that)
3. **Performance**: Don't measure actual page load times
4. **Browser Compatibility**: Run in jsdom, not real browsers

## Future Enhancements

- [ ] Add visual regression testing (Percy, Chromatic)
- [ ] Add E2E tests with Playwright
- [ ] Add performance benchmarks
- [ ] Add snapshot tests for UI
- [ ] Add tests for different screen sizes
- [ ] Add tests for keyboard navigation
- [ ] Add tests for screen readers

## Troubleshooting

### Tests Failing?

1. **Check dependencies**: Run `pnpm install`
2. **Clear cache**: Run `pnpm test --no-cache`
3. **Check mocks**: Verify mock setup in `beforeEach()`
4. **Check environment**: Ensure test env vars are set in `vitest.config.mts`
5. **Check setup file**: Verify `__tests__/setup.ts` is loaded

### Common Issues

**Issue**: `toBeInTheDocument is not a function`
- **Fix**: Ensure `@testing-library/jest-dom` is imported in setup file

**Issue**: `useRouter is not a function`
- **Fix**: Check that `next/navigation` mock is properly configured

**Issue**: `Cannot find module`
- **Fix**: Run `pnpm install` and verify `vite-tsconfig-paths` plugin

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Testing Library Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Next.js Testing Guide](https://nextjs.org/docs/testing)

