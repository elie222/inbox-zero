export const examplePrompts = [
  'Label newsletters as "Newsletter" and archive them',
  'Label marketing emails as "Marketing" and archive them',
  'Label emails that require a reply as "Reply Required"',
  'Label urgent emails as "Urgent"',
  'Label receipts as "Receipt" and forward them to jane@accounting.com',
  'Label pitch decks as "Pitch Deck" and forward them to john@investing.com',
  "Reply to cold emails by telling them to check out Inbox Zero. Then mark them as spam",
  'Label high priority emails as "High Priority"',
  "If a founder asks to set up a call, send them my Cal link: https://cal.com/example",
  "If someone asks to cancel a plan, ask to set up a call by sending my Cal link",
  'If a founder sends me an investor update, label it "Investor Update" and archive it',
  'If someone pitches me their startup, label it as "Investing", archive it, and respond with a friendly reply that I no longer have time to look at the email but if they get a warm intro, that\'s their best bet to get funding from me',
  "If someone asks for a discount, reply with the discount code INBOX20",
  "If someone asks for help with MakerPad, tell them I no longer work there, but they should reach out to the Zapier team for support",
  "Review any emails from questions@pr.com and see if any are about finance. If so, draft a friendly reply that answers the question",
  'If people ask me to speak at an event, label the email "Speaker Opportunity" and archive it',
  'Label customer emails as "Customer"',
  'Label legal documents as "Legal"',
  'Label server errors as "Error"',
  'Label Stripe emails as "Stripe"',
];

export const personas = {
  founder: {
    label: "🚀 Founder",
    prompt: `Label emails that require a reply as "Reply Required".
Label urgent emails as "Urgent".
Label newsletters as "Newsletter" and archive them.
Label marketing emails as "Marketing" and archive them.
If someone asks to set up a call, draft a reply with my Cal link: https://cal.com/example.
Label customer feedback emails as "Customer Feedback".
Label customer support emails as "Customer Support".
Label emails from @mycompany.com addresses as "Team".
Label emails from investors as "Investor".
Label legal documents as "Legal".
Label receipts as "Receipt".
Label emails about travel as "Travel".`,
  },
  investor: {
    label: "💰 Investor",
    prompt: `Label emails that require a reply as "Reply Required".
Label urgent emails as "Urgent".
Label newsletters as "Newsletter" and archive them.
Label marketing emails as "Marketing" and archive them.
If a founder asks to set up a call, draft a reply with my Cal link: https://cal.com/example.
If a founder sends me an investor update, label it "Investor Update" and archive it.
If a founder pitches me their startup, label it "Pitch Deck", and forward it to analyst@vc.com that asks them to review it.
Label emails from @mycompany.com addresses as "Team".
Label emails from LPs as "LP".
Label emails about LP meetings or annual reports as "LP".
Label legal documents as "Legal".
Label receipts as "Receipt".
Label emails about travel as "Travel".
If someone asks about investment thesis, reply with a link to our public investment memo: https://example.com/thesis
Label emails about portfolio company exits as "Exit Opportunity".
Label emails containing term sheets as "Term Sheet".
If a portfolio company reports bad news, label as "Portfolio Alert" and draft a reply to schedule an emergency call.
Label due diligence related emails as "Due Diligence".
Forward emails about industry research reports to research@vc.com
If someone asks for a warm intro to a portfolio company, draft a reply asking for more context about why they want to connect.
Label emails about fund administration as "Fund Admin".
Label emails about speaking at investment conferences as "Speaking Opportunity".`,
  },
  assistant: {
    label: "📋 Assistant",
    prompt: "",
  },
  developer: {
    label: "👨‍💻 Developer",
    prompt: "",
  },
  designer: {
    label: "🎨 Designer",
    prompt: "",
  },
  sales: {
    label: "🤝 Sales",
    prompt: "",
  },
  marketing: {
    label: "📢 Marketing",
    prompt: "",
  },
  support: {
    label: "🛠️ Support",
    prompt: "",
  },
  recruiter: {
    label: "👥 Recruiter",
    prompt: "",
  },
  student: {
    label: "👩‍🎓 Student",
    prompt: "",
  },
  other: {
    label: "🤖 Other",
    prompt: "",
  },
};
