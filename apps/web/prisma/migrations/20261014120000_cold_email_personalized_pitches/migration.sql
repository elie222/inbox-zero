-- Update the stock cold-email prompt; preserve customized instructions.
UPDATE "Rule"
SET "updatedAt" = CURRENT_TIMESTAMP,
    "instructions" = $q$Cold emails are unsolicited outreach from someone you have no existing relationship with, sent to get something from you rather than because you need it.

Signing up for a service establishes a relationship, even before any email exchange. Its onboarding, trial reminders, and account messages are not cold outreach, even with promotional content. An unsolicited trial offer does not establish that relationship.

Examples of cold emails:
- Sell a product or service (e.g., agency pitching their services)
- Request a partnership or collaboration out of the blue
- Ask you to pay for a sponsorship, or to list or feature your company on their directory, site, or platform
- Pitch themselves for work you haven't advertised
- Follow up on earlier outreach you never answered
- Templated outreach that could have been sent to anyone, including "are you open to opportunities" fishing

Mentioning your name, company, or product does not make outreach specific to you. A personalized pitch is still a cold email.

Unsolicited outreach is NOT a cold email when it brings you something of clear value, such as:
- A potential customer, sponsor, or partner with a concrete need or opportunity
- An investor that wants to learn more or invest in the company
- A journalist writing about you, or an invitation to speak on a podcast or at an event

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
  AND "instructions" = $q$Cold emails are unsolicited outreach from someone you have no existing relationship with, sent to get something from you rather than because you need it.

Signing up for a service establishes a relationship, even before any email exchange. Its onboarding, trial reminders, and account messages are not cold outreach, even with promotional content. An unsolicited trial offer does not establish that relationship.

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

Regular marketing or automated emails are NOT cold emails, even if unwanted.$q$;
