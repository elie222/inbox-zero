## AI Automation

- [x] Don't call "Args for rule" when we don't need it called and there's no dynamic data.
- [x] Check why elie's rule was not automated
- [x] Accept all in Planned
- [] Send email update with planned tasks
- [] Make sure that when a user upgrades to premium, that we watch their emails in pubsub.
- [x] We won't always need to fill in extra info with `getArgsAiResponse()`. eg. we should allow all fields to be set, and CC/BCC could automatically be empty
- [x] "No plain text found" error for Leeann when trying to test her AI automations.
- [] Leeann is premium, but the webhooks don't process for her because she isn't premium. It doesn't show her an error in the UI about this :(. Need to make this more clear to users and also fix it for all old users that should have AI access.
- [] p-queue

## Pricing

- [] Make it more clear how many users they want to upgrade on sign up (and show price) . Drop down works.
- [] Offer a cheaper annual plan. eg. $60 or $80 per year. Instead of $100.
- [] Send out email with new pricing plans

## Onboarding

- [] Save answers in JSON object in db

# Cold email blocker

[x] Settings UI
[x] List UI
[x] List endpoint
[x] Update settings endpoint
[x] Fetch settings endpoint
[x] Webhook
[x] Label to use
[x] Test it out
[x] List cold emails
[x] Edit prompt
[x] Pricing - add tier for Cold Email/AI
[x] Pricing - make sure new links work
[x] Pricing - save PremiumTier on upgrade/webhook
[x] Pricing - don't have link for current plan
[x] Pricing - add additional users to account
[x] "Current plan" for Business
[x] Pricing - LS upgrade multi user
[x] Lifetime plan - add users
[x] Limit access with FeatureAccess
[x] Change FeatureAccess on upgrade
[x] Create migration: 1st add the Premium model. Then add some code to migrate over. Then delete old fields on user
[] Make sure that premium usage is attributed when actions are taken like unsub and AI usage
[] Give AI credits on upgrade
[] Redirect to thank you page

// TODO
// lifetime users should have $100 of AI credits
// regular users should have AI credits that reset each month
// only drop a user's AI credits if they're not using their own API key
