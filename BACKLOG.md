# TODOs

- Figure out a way to get Tinybird costs down.

  - Limit the history we store for free users to one week. Delete data older than one week.

- See what's going on with the transactional Resend emails.

- A good viral loop would be allowing users to share just how much they've cleaned up their inbox on Twitter. Share worthy to know you've cleared out 30 subscriptions and 150 emails per month, for example.

- Add GTM: https://nextjs.org/docs/app/building-your-application/optimizing/third-party-libraries#google-tag-manager

## Feedback from Gabe

- Mention privacy on the landing page
- Make load stats button black (or just load the stats properly)
- Move load stats and other buttons to the right
- The colours for the charts aren't good
- AI automation page was very confusing to him
- Make it clear what the check/x does on the mail screen for when he clicked it
- LOW - Maybe add a sub dropdown to the Mail tab for things like Sent/Archived and so on
- His app started crashing at the end that data wasn't coming from the backend. Maybe because I hit gmail API limits?

## Feedback

- Figure out pricing
  - Offer lifetime plan? With credit limits
  - Offer 14-day trial
  - Offer limit on number of unsubscribes. eg 20

## Other

- Send out email for testimonials
- Send out waitlist invites

- Create landing pages focused on specific features

- Video for newsletters

- Newsletter summarisation

- Command K on newsletters?

- Gmail webhook updates

  - categorise - we don't always need it. can toggle this as a setting for users. will save processing costs

- Launch on PH

- use hasPreviousEmail/unsubscribeLink in webhook to label cold emails

- Settings

  - Categorize

- Create airtable like options/filters:

  - Table sort columns. eg by date, by sender, by subject, by category
  - Filter by category
  - Save views

- Create video on stats page

- Create landing page for email analytics

- Block cold emailers

- Human readable recommendations. eg. "You received 100 emails from Codie but only read 5%. Suggest unsubscribe or filter to a folder"

- Create onboarding video
- Add question: how did you hear about IZ

- Search newsletters for stats
- Semantic search and labelling
- Email AI generated text insights

- Days of week where you send/receive most emails
- Time of day where you send/receive most emails
- GitHub type activity chart for days you send emails
- Share report on social media

- CLA

In the context of your question, "CLA" stands for Contributor License Agreement. This is a legal document that contributors to a software project must sign, which gives the project maintainers some rights over their contributions. Typically, a CLA ensures that the project maintainers have the legal ability to relicense the contributed code, for instance, for use in commercial or enterprise versions of the software. This is common in open-source and community-driven software projects.

- Docker Compose

- Fix order by read/archived in newsletter feed. use tooltip to explain how it works (didn't work :()). it's not broken. it's just ordered by a hidden number. Or order by % to make it clear

- Enable using the app without storing any data? Or with a users private hash key?

- Show a list of emails that require action - Arvad mentioned this on Twitter as something he wants

- Feature: Instruct your email what to do with looping function calls. Have user confirm steps before they're done. The AI doesn't need to know about the confirmation part. It will assume the archive action was done for example. Bonus: talk to your email using Whisper.

- Fix constant log out - Saw this was a Next Auth issue impacting others too.

- Block cold emails with AI - https://x.com/bardeenai/status/1723094352489001370?s=20

- Move token usage from Redit to Postgres

- Use Prettier sort config that this person is using: https://github.com/tailwindlabs/prettier-plugin-tailwindcss/issues/113#issuecomment-1887813405
