feat: implement Gmail onboarding flow with connection wizard

User Journey:
- Add connect-gmail page in the current flow with OAuth flow for Gmail access
- Add ready-for-brief page showing email stats after connection
- Update value-prop flow to redirect to Gmail connection

Tech:
- Enhance Google OAuth callback to handle Gmail-specific tokens
- Add basic vs full Gmail scopes for progressive permission model
- Add onboarding stats API endpoint for email metrics
- Add comprehensive test suite for onboarding flow
- Update testing dependencies (vitest, testing-library)
- Add documentation for digest functionality and onboarding flows

BREAKING CHANGE: Value prop flow now redirects to Gmail connection instead of welcome/app