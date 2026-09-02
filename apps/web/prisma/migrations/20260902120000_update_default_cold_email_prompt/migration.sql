-- Move accounts still on a stock Cold Email prompt to the new default. The two
-- matched texts are the exact previous defaults; customized prompts are left alone.
UPDATE "Rule"
SET "instructions" = $q$Cold emails are unsolicited outreach from someone you have no existing relationship with, sent to get something from you rather than because you need it. The aim is to recognize outreach that doesn't matter to you while not mistaking outreach that does.

Examples of cold emails:
- Sell a product or service (e.g., agency pitching their services)
- Request a partnership or collaboration out of the blue
- Templated outreach that could have been sent to anyone, including "are you open to opportunities" fishing

Unsolicited outreach is NOT a cold email when it is specific to you and worth your attention, such as:
- A potential customer or partner with a concrete need or opportunity
- An investor that wants to learn more or invest in the company

Emails that are NOT cold emails include:
- Email from a friend or colleague
- Email from someone you met at a conference
- Intro emails where someone is introducing you to another person
- Email from a customer
- Newsletter
- Password reset
- Welcome emails
- Receipts
- Promotions
- Alerts
- Updates
- Calendar invites

Regular marketing or automated emails are NOT cold emails, even if unwanted.$q$
WHERE "systemType" = 'COLD_EMAIL'
  AND "instructions" IN (
    $q$Examples of cold emails:
- Sell a product or service (e.g., agency pitching their services)
- Recruit for a job position
- Request a partnership or collaboration

Emails that are NOT cold emails include:
- Email from an investor that wants to learn more or invest in the company
- Email from a friend or colleague
- Email from someone you met at a conference
- Email from a customer
- Newsletter
- Password reset
- Welcome emails
- Receipts
- Promotions
- Alerts
- Updates
- Calendar invites

Regular marketing or automated emails are NOT cold emails, even if unwanted.$q$,
    $q$Examples of cold emails:
- Sell a product or service (e.g., agency pitching their services)
- Recruit for a job position
- Request a partnership or collaboration

Emails that are NOT cold emails include:
- Email from an investor that wants to learn more or invest in the company
- Email from a friend or colleague
- Email from someone you met at a conference
- Intro emails where someone is introducing you to another person
- Email from a customer
- Newsletter
- Password reset
- Welcome emails
- Receipts
- Promotions
- Alerts
- Updates
- Calendar invites

Regular marketing or automated emails are NOT cold emails, even if unwanted.$q$
  );
