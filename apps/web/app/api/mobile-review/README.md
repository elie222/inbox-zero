# Mobile App Review Access

These endpoints support internal App Store review access for the private mobile
app. Do not list these settings in `.env.example`; regular self-hosted users do
not need them.

Configure `APP_REVIEW_DEMO_ACCOUNTS` with every account App Review needs, such
as one active account and one expired-subscription account:

```env
APP_REVIEW_DEMO_ENABLED=true
APP_REVIEW_DEMO_ACCOUNTS='[{"email":"review-active@example.com","code":"active-password"},{"email":"review-expired@example.com","code":"expired-password"}]'
```

Each entry maps the email entered in the mobile login form to the access code
used as the password. The sign-in endpoint requires email and matches both
values before creating a session.
