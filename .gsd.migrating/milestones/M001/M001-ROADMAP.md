# M001: Personal Email AI — inbox.tdfurn.com

**Vision:** A single-tenant AI email management system built on a self-hosted fork of Inbox Zero, running on AWS EC2 for rebekah@trueocean.com.

## Success Criteria

- Daily digest arrives at 9am ET with AI-generated narrative and actionable summaries
- Classification engine routes email to correct rules at ≥90% accuracy
- AI cost ≤ $10/mo additional (three-tier: rules → Haiku → Sonnet)
- Rules UI allows create/edit/delete without touching code
- Feedback signals feed back into classification
- 100k backlog triage completed with batch approval workflow

## Slices

- [x] **S01: S01** `risk:medium` `depends:[]`
  > After this: Digest email sends successfully; signup locked to allowed domain; Docker image builds and deploys on push to main

- [x] **S02: S02** `risk:medium` `depends:[]`
  > After this: Recon report delivered: known gaps documented, no surprises in Phase 3+

- [x] **S03: S03** `risk:medium` `depends:[]`
  > After this: Emails classified correctly in production; cost within budget; rules seeded and working

- [x] **S04: S04** `risk:medium` `depends:[]`
  > After this: Digest email arrives at 9am ET with correct content tiers; no duplicate sends; Marketing emails included

- [ ] **S05: S05** `risk:medium` `depends:[]`
  > After this: Create a new rule via UI, verify it fires on next matching email

- [ ] **S06: Feedback System** `risk:medium` `depends:[S05]`
  > After this: Click 'wrong label' in digest, verify classification updated for that sender

- [ ] **S07: Backlog Triage** `risk:medium` `depends:[S06]`
  > After this: Batch triage UI shows pending emails, approve/reject actions fire, backlog count decreases

## Boundary Map

Not provided.
