// NOTE: some users save the example rules when trying out the platform, and start auto sending emails
// to people without realising it. This is a simple check to avoid that.
// This needs changing when the examples change. But it works for now.
export function hasExampleParams(rule: {
  condition: {
    static?: {
      to?: string | null;
      from?: string | null;
    } | null;
  };
  actions: { fields?: { content?: string | null } }[];
}) {
  return (
    rule.condition.static?.to?.includes("@company.com") ||
    rule.condition.static?.from?.includes("@mycompany.com") ||
    rule.actions.some((a) => a.fields?.content?.includes("cal.com/example"))
  );
}

const commonPrompts = [
  "Label emails that require a reply as 'Reply Required'",
  "Label urgent emails as 'Urgent'",
  "Label newsletters as 'Newsletter' and archive them",
  "Label marketing emails as 'Marketing' and archive them",
  "Label emails from @mycompany.com addresses as 'Team'",
  "Label receipts as 'Receipt' and archive them",
];

const common = `${commonPrompts.map((prompt) => `* ${prompt}`).join(".\n")}.`;

export const examplePrompts = [
  ...commonPrompts,
  'Label pitch decks as "Pitch Deck" and forward them to john@investing.com',
  'Label receipts as "Receipt" and forward them to jane@accounting.com',
  "Reply to cold emails by telling them to check out Inbox Zero. Then mark them as spam",
  'Label high priority emails as "High Priority"',
  "If a founder asks to set up a call, send them my calendar link: https://cal.com/example",
  "If someone asks to cancel a plan, ask to set up a call by sending my calendar link",
  'If a founder sends me an investor update, label it "Investor Update" and archive it',
  'If someone pitches me their startup, label it as "Investing", archive it, and respond with a friendly reply that I no longer have time to look at the email but if they get a warm intro, that\'s their best bet to get funding from me',
  "If someone asks for a discount, reply with the discount code INBOX20",
  "If someone asks for help with Product or Company, tell them I no longer work there, but they should reach out to Company for support",
  "Review any emails from questions@pr.com and see if any are about finance. If so, draft a friendly reply that answers the question",
  'If people ask me to speak at an event, label the email "Speaker Opportunity" and archive it',
  'Label customer emails as "Customer"',
  'Label legal documents as "Legal"',
  'Label server errors as "Error"',
  'Label Stripe emails as "Stripe"',
];

const founderPrompt = `${common}
* If someone asks to set up a call, draft a reply with my calendar link: https://cal.com/example.
* Label customer feedback emails as "Customer Feedback".
* Label customer support emails as "Customer Support".
* Label emails from investors as "Investor".
* Label legal documents as "Legal".
* Label emails about travel as "Travel".
* Label recruitment related emails as "Hiring".
* Label press inquiries as "Press" and forward to PR@company.com.`;

export const personas = {
  founder: {
    label: "🚀 Founder",
    prompt: founderPrompt,
  },
  creator: {
    label: "📹 Creator",
    prompt: `${common}
* Label sponsorship inquiries as "Sponsorship" and draft a reply as follows:
---
Hey NAME,

SENTENCE RELATED TO THEIR INQUIRY

I've attached my media kit and pricing.
---

* If someone asks for fitness advice, draft a reply as follows:
---
Hey,

I've attached my workout program link: https://example.com/program
---

* If someone asks for medical advice, draft a reply explaining I can't give personal medical advice and to consult their doctor.
* If someone asks for free coaching, draft a reply with my coaching packages link: https://example.com/coaching
* Label collaboration requests as "Collab" and draft a reply asking about their audience size and engagement rates.
* Label brand partnership emails as "Brand Deal" and forward to manager@example.com
* Label emails about podcast guest appearances as "Podcast" and draft a reply with calendar link: https://cal.com/example
* Label media inquiries as "Press" and draft a reply a polite reply.
* If someone reports issues with digital products, label as "Support" and forward to support@example.com
* Label emails about speaking opportunities as "Speaking".
* If someone asks about my equipment/gear, draft a reply with my Amazon storefront link: https://amazon.com/shop/creator
* If someone asks about my supplement stack, draft a reply with my recommended supplements page: https://example.com/supplements
* Label emails about affiliate programs as "Affiliate" and archive them.
* If someone asks for a discount code, reply with "CREATOR20" for 20% off.
* Label emails containing user success stories as "Testimonial" and draft a reply thanking them for their support.`,
  },
  investor: {
    label: "💰 Investor",
    prompt: `${common}
* If a founder asks to set up a call, draft a reply with my calendar link: https://cal.com/example.
* If a founder sends me an investor update, label it "Investor Update" and archive it.
* If a founder pitches me their startup, label it "Pitch Deck", and forward it to analyst@vc.com that asks them to review it.
* Label emails from LPs as "LP".
* Label legal documents as "Legal".
* Label emails about travel as "Travel".
* If someone asks about investment thesis, reply with a link to our public investment memo: https://example.com/thesis
* Label emails about portfolio company exits as "Exit Opportunity".
* Label emails containing term sheets as "Term Sheet".
* If a portfolio company reports bad news, label as "Portfolio Alert" and draft a reply to schedule an emergency call.
* Label due diligence related emails as "Due Diligence".
* Forward emails about industry research reports to research@vc.com
* If someone asks for a warm intro to a portfolio company, draft a reply asking for more context about why they want to connect.
* Label emails about fund administration as "Fund Admin".
* Label emails about speaking at investment conferences as "Speaking Opportunity".`,
  },
  assistant: {
    label: "📋 Assistant",
    prompt: founderPrompt,
  },
  developer: {
    label: "👨‍💻 Developer",
    prompt: `${common}
* Label server errors, deployment failures, and other server alerts as "Alert" and forward to oncall@company.com.
* Label emails from GitHub as "GitHub" and archive them.
* Label emails from Figma as "Design" and archive them.
* Label emails from Stripe as "Stripe" and archive them.
* Label emails from Slack as "Slack" and archive them.
* Label emails about bug reports as "Bug".
* If someone reports a security vulnerability, label as "Security" and forward to security@company.com.
* Label emails about job interviews as "Job Search".
* Label emails from recruiters as "Recruiter" and archive them.`,
  },
  designer: {
    label: "🎨 Designer",
    prompt: `${common}
* Label emails from Figma, Adobe, Sketch, and other design tools as "Design" and archive them.
* Label emails from clients as "Client".
* If someone sends design assets, label as "Design Assets" and forward to assets@company.com.
* Label emails from Dribbble, Behance, and other design inspiration sites as "Inspiration" and archive them.
* Label emails about design conferences as "Conference".
* If someone requests brand assets, draft a reply with a link to our brand portal: https://brand.company.com
* Label emails about user research as "Research".
* Label emails about job interviews as "Job Search".
* Label emails from recruiters as "Recruiter" and archive them.`,
  },
  sales: {
    label: "🤝 Sales",
    prompt: `${common}
* Label emails from prospects as "Prospect".
* Label emails from customers as "Customer".
* Label emails about deal negotiations as "Deal Discussion".
* Label emails from sales tools as "Sales Tool" and archive them.
* Label emails about sales opportunities as "Sales Opportunity".
* If someone asks for pricing, draft a reply with our pricing page link: https://company.com/pricing.
* Label emails containing signed contracts as "Signed Contract" and forward to legal@company.com.
* If someone requests a demo, draft a reply with my calendar link: https://cal.com/example
* If someone asks about product features, draft a reply with relevant feature documentation links.
* If someone reports implementation issues, label as "Support Need" and forward to support@company.com
* If someone asks about enterprise pricing, draft a reply asking about their company size and requirements.
* If a customer mentions churn risk, label as "Churn Risk" and draft an urgent notification to the customer success team.`,
  },
  marketing: {
    label: "📢 Marketing",
    prompt: `${common}
* Label emails from influencers as "Influencer".
* Label emails from ad platforms (Google, Meta, LinkedIn) as "Advertising".
* Label press inquiries as "Press" and forward to pr@company.com.
* Label emails about content marketing as "Content".
* If someone asks about sponsorship, label as "Sponsorship" and draft a reply asking about their audience size.
* If someone requests to guest post, label as "Guest Post" and draft a reply with our guidelines.
* If someone asks about partnership opportunities, label as "Partnership" and draft a reply asking for their media kit.
* If someone reports broken marketing links, label as "Bug" and forward to tech@company.com.`,
  },
  support: {
    label: "🛠️ Support",
    prompt: `${common}
* Label customer support tickets as "Support Ticket".
* If someone reports a critical issue, label as "Urgent Support" and forward to urgent@company.com.
* Label bug reports as "Bug" and forward to engineering@company.com.
* Label feature requests as "Feature Request" and forward to product@company.com.
* If someone asks for refund, draft a reply with our refund policy link: https://company.com/refund-policy.
* Label emails about account access issues as "Access Issue" and draft a reply asking for their account details.
* If someone asks for product documentation, draft a reply with our help center link: https://help.company.com
* Label emails about service outages as "Service Issue" and forward to status@company.com.
* If someone needs technical assistance, draft a reply asking for their account details and specific error messages.
* Label positive feedback as "Testimonial" and forward to marketing@company.com.
* Label emails about API integration issues as "API Support".
* If someone reports data privacy concerns, label as "Privacy", and draft a reply with our privacy policy link: https://company.com/privacy-policy.`,
  },
  recruiter: {
    label: "👥 Recruiter",
    prompt: `${common}
* Label emails from candidates as "Candidate".
* Label emails from hiring managers as "Hiring Manager".
* Label emails from recruiters as "Recruiter" and draft a reply with our hiring process overview link: https://company.com/hiring-process.
* Label emails from job boards as "Job Board" and archive them.
* Label emails from LinkedIn as "LinkedIn" and archive them.
* If someone applies for a job, label as "New Application" and draft a reply acknowledging their application.
* Label emails containing resumes or CVs as "Resume".
* If a candidate asks about application status, label as "Status Update" and draft a reply asking for their position and date applied.
* Label emails about interview scheduling as "Interview Scheduling".
* If someone accepts an interview invite, label as "Interview Confirmed" and forward to calendar@company.com.
* If someone declines a job offer, label as "Offer Declined" and forward to hiring-updates@company.com.
* If someone accepts a job offer, label as "Offer Accepted" and forward to onboarding@company.com.
* Label emails about salary negotiations as "Compensation".
* Label emails about reference checks as "References".
* If someone asks about benefits, draft a reply with our benefits overview link: https://company.com/benefits.
* Label emails about background checks as "Background Check".
* If an internal employee refers someone, label as "Employee Referral".
* Label emails about recruitment events or job fairs as "Recruiting Event".
* If someone withdraws their application, label as "Withdrawn".`,
  },
  student: {
    label: "👩‍🎓 Student",
    prompt: `* Label emails that require a reply as 'Reply Required'
* Label emails from professors and teaching assistants as "School".
* Label emails about assignments and homework as "Assignment".
* If someone sends class notes or study materials, label as "Study Materials".
* Label emails about internships as "Internship" and forward to my personal email me@example.com.
* Label emails about exam schedules as "Exam".
* Label emails about campus events as "Event" and archive them.
* If someone asks for class notes, draft a reply with our shared Google Drive folder link: https://drive.google.com/drive/u/0/folders/1234567890.
* Label emails about tutoring opportunities as "Tutoring" and draft a reply with that my rate is $70/hour or $40/hour for group tutoring.

* Label newsletters as 'Newsletter' and archive them
* Label marketing emails as 'Marketing' and archive them`,
  },
  reachout: {
    label: "💬 Reachout",
    prompt: `If someone replies to me that they're interested, label it "Interested" and draft a reply with my calendar link: https://cal.com/example.`,
  },
  other: {
    label: "🤖 Other",
    prompt: common,
  },
};
