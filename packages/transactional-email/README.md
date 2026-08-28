# Email updates

This package provides transactional email templates and delivery APIs. Email
delivery supports Resend and Amazon SES behind a provider interface.

Resend remains the default when `RESEND_API_KEY` is set. To use SES, set
`TRANSACTIONAL_EMAIL_PROVIDER=ses` and configure an AWS region and credentials.
The AWS SDK default credential chain is used, so credentials can come from
environment variables, shared AWS configuration, or an IAM role.
The sending identity must be verified, and the AWS principal needs
`ses:SendEmail` permission. SES does not provide a request idempotency token,
so `idempotencyKey` is only enforced by the Resend provider.

## Running locally

To run:

```bash
pnpm dev
```

Then visit http://localhost:3010/ to view email previews.
