import { getEmailTerminology } from "@/utils/terminology";

export type Personas = ReturnType<typeof getPersonas>;

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
  actions: { content?: string | null }[];
}) {
  return (
    rule.condition.static?.to?.includes("@company.com") ||
    rule.condition.static?.from?.includes("@mycompany.com") ||
    rule.actions.some((a) => a.content?.includes("cal.com/example"))
  );
}

function formatPromptArray(promptArray: string[]): string {
  return `${promptArray.map((item) => `* ${item}`).join(".\n")}.`;
}

function processPromptsWithTerminology(
  prompts: string[],
  provider: string,
): string[] {
  const terminology = getEmailTerminology(provider);
  return prompts.map((prompt) => {
    // Replace "Label" at the beginning of sentences or after punctuation
    let processed = prompt.replace(/\bLabel\b/g, terminology.label.action);
    // Replace lowercase "label" in the middle of sentences
    processed = processed.replace(
      /\blabel\b/g,
      terminology.label.action.toLowerCase(),
    );
    return processed;
  });
}

const commonPrompts = [
  "Label urgent emails as @[Urgent]",
  "Label emails from @mycompany.com addresses as @[Team]",
];

const examplePromptsBase = [
  ...commonPrompts,
  "Forward receipts to jane@accounting.com and label them @[Receipt]",
  "Forward pitch decks to john@investing.com and label them @[Pitch Deck]",
  "Reply to cold emails by telling them to check out Inbox Zero. Then mark them as spam",
  "Label high priority emails as @[High Priority]",
  "If a founder asks to set up a call, draft a reply with my calendar link: https://cal.com/example",
  "If someone asks to cancel a plan, draft a reply with the cancellation link: https://company.com/cancel",
  "If a founder sends me an investor update, label it @[Investor Update] and archive it",
  "If someone pitches me their startup, label it as @[Investing], archive it, and draft a friendly reply that I no longer have time to look at the email but if they get a warm intro, that's their best bet to get funding from me",
  "If someone asks for a discount, reply with the discount code INBOX20",
  "If someone asks for help with Product or Company, draft a reply telling them I no longer work there, but they should reach out to Company for support",
  "Review any emails from questions@pr.com and see if any are about finance. If so, draft a friendly reply that answers the question",
  "If people ask me to speak at an event, label the email @[Speaker Opportunity] and archive it",
  "Label customer emails as @[Customer]",
  "Label legal documents as @[Legal]",
  "Label server errors as @[Error]",
  "Label Stripe emails as @[Stripe]",
];

export function getExamplePrompts(
  provider: string,
  examples?: string[],
): string[] {
  return processPromptsWithTerminology(
    examples || examplePromptsBase,
    provider,
  );
}

const founderPromptArray = [
  ...commonPrompts,
  "If someone asks to set up a call, draft a reply with my calendar link: https://cal.com/example",
  "Label customer feedback emails as @[Customer Feedback]",
  "Label customer support emails as @[Customer Support]",
  "Label emails from investors as @[Investor]",
  "Label legal documents as @[Legal]",
  "Label emails about travel as @[Travel]",
  "Label recruitment related emails as @[Hiring]",
];

export function getPersonas(provider: string) {
  return {
    founder: {
      label: "🚀 Founder",
      promptArray: processPromptsWithTerminology(founderPromptArray, provider),
      get prompt() {
        return formatPromptArray(this.promptArray);
      },
    },
    influencer: {
      label: "📹 Influencer",
      promptArray: processPromptsWithTerminology(
        [
          ...commonPrompts,
          `Label sponsorship inquiries as @[Sponsorship] and draft a reply as follows:
> Hey NAME,
>
> I've attached my media kit and pricing`,
          "Label emails about affiliate programs as @[Affiliate] and archive them",
          "Label collaboration requests as @[Collab] and draft a reply asking about their audience size and engagement rates",
          "Label brand partnership emails as @[Brand Deal] and forward to manager@example.com",
          "Label media inquiries as @[Press] and draft a reply a polite reply",
        ],
        provider,
      ),
      get prompt() {
        return formatPromptArray(this.promptArray);
      },
    },
    realtor: {
      label: "🏠 Realtor",
      promptArray: processPromptsWithTerminology(
        [
          ...commonPrompts,
          "Label emails from potential buyers as @[Buyer Lead] and draft a reply asking about their budget and preferred neighborhoods",
          "Label emails from potential sellers as @[Seller Lead] and draft a reply with my calendar link to schedule a home evaluation: https://cal.com/example",
          "If someone asks about home prices in a specific area, label as @[Market Inquiry] and draft a reply with recent comparable sales data",
          "Label emails from mortgage brokers and lenders as @[Lender] and archive them",
          "If someone asks to schedule a showing, label as @[Showing Request] and draft a reply with available time slots",
          "Label emails about closing documents as @[Closing] and forward to transactions@realty.com",
          "If someone asks about the home buying process, draft a reply with our buyer's guide link: https://realty.com/buyers-guide",
          "Label emails from home inspectors as @[Inspector] and forward to scheduling@realty.com",
          "If someone refers a client to me, label as @[Referral] and draft a thank you reply with my calendar link to schedule a consultation",
        ],
        provider,
      ),
      get prompt() {
        return formatPromptArray(this.promptArray);
      },
    },
    investor: {
      label: "💰 Investor",
      promptArray: processPromptsWithTerminology(
        [
          ...commonPrompts,
          "If a founder asks to set up a call, draft a reply with my calendar link: https://cal.com/example",
          "If a founder sends me an investor update, label it @[Investor Update] and archive it",
          "Forward pitch decks to analyst@vc.com that asks them to review it and label them @[Pitch Deck]",
          "Label emails from LPs as @[LP]",
          "Label legal documents as @[Legal]",
          "Label emails about travel as @[Travel]",
          "Label emails about portfolio company exits as @[Exit Opportunity]",
          "Label emails containing term sheets as @[Term Sheet]",
          "If a portfolio company reports bad news, label as @[Portfolio Alert] and draft a reply to schedule an emergency call",
          "Label due diligence related emails as @[Due Diligence]",
          "Forward emails about industry research reports to research@vc.com",
          "If someone asks for a warm intro to a portfolio company, draft a reply asking for more context about why they want to connect",
          "Label emails about fund administration as @[Fund Admin]",
          "Label emails about speaking at investment conferences as @[Speaking Opportunity]",
        ],
        provider,
      ),
      get prompt() {
        return formatPromptArray(this.promptArray);
      },
    },
    assistant: {
      label: "📋 Assistant",
      promptArray: processPromptsWithTerminology(founderPromptArray, provider),
      get prompt() {
        return formatPromptArray(this.promptArray);
      },
    },
    developer: {
      label: "👨‍💻 Developer",
      promptArray: processPromptsWithTerminology(
        [
          ...commonPrompts,
          "Label server errors, deployment failures, and other server alerts as @[Alert] and forward to oncall@company.com",
          "Label emails from GitHub as @[GitHub] and archive them",
          "Label emails from Figma as @[Design] and archive them",
          "Label emails from Stripe as @[Stripe] and archive them",
          "Label emails from Slack as @[Slack] and archive them",
          "Label emails about bug reports as @[Bug]",
          "If someone reports a security vulnerability, label as @[Security] and forward to security@company.com",
          "Label emails about job interviews as @[Job Search]",
          "Label emails from recruiters as @[Recruiter] and archive them",
        ],
        provider,
      ),
      get prompt() {
        return formatPromptArray(this.promptArray);
      },
    },
    designer: {
      label: "🎨 Designer",
      promptArray: processPromptsWithTerminology(
        [
          ...commonPrompts,
          "Label emails from Figma, Adobe, Sketch, and other design tools as @[Design] and archive them",
          "Label emails from clients as @[Client]",
          "If someone sends design assets, label as @[Design Assets] and forward to assets@company.com",
          "Label emails from Dribbble, Behance, and other design inspiration sites as @[Inspiration] and archive them",
          "Label emails about design conferences as @[Conference]",
          "If someone requests brand assets, draft a reply with a link to our brand portal: https://brand.company.com",
          "Label emails about user research as @[Research]",
          "Label emails about job interviews as @[Job Search]",
          "Label emails from recruiters as @[Recruiter] and archive them",
        ],
        provider,
      ),
      get prompt() {
        return formatPromptArray(this.promptArray);
      },
    },
    sales: {
      label: "🤝 Sales",
      promptArray: processPromptsWithTerminology(
        [
          ...commonPrompts,
          "Label emails from prospects as @[Prospect]",
          "Label emails from customers as @[Customer]",
          "Label emails about deal negotiations as @[Deal Discussion]",
          "Label emails from sales tools as @[Sales Tool] and archive them",
          "Label emails about sales opportunities as @[Sales Opportunity]",
          "If someone asks for pricing, draft a reply with our pricing page link: https://company.com/pricing",
          "Label emails containing signed contracts as @[Signed Contract] and forward to legal@company.com",
          "If someone requests a demo, draft a reply with my calendar link: https://cal.com/example",
          "If someone asks about product features, draft a reply with relevant feature documentation links",
          "If someone reports implementation issues, label as @[Support Need] and forward to support@company.com",
          "If someone asks about enterprise pricing, draft a reply asking about their company size and requirements",
          "If a customer mentions churn risk, label as @[Churn Risk] and draft an urgent notification to the customer success team",
        ],
        provider,
      ),
      get prompt() {
        return formatPromptArray(this.promptArray);
      },
    },
    marketer: {
      label: "📢 Marketer",
      promptArray: processPromptsWithTerminology(
        [
          ...commonPrompts,
          "Label emails from influencers as @[Influencer]",
          "Label emails from ad platforms (Google, Meta, LinkedIn) as @[Advertising]",
          "Label press inquiries as @[Press] and forward to pr@company.com",
          "Label emails about content marketing as @[Content]",
          "If someone asks about sponsorship, label as @[Sponsorship] and draft a reply asking about their audience size",
          "If someone requests to guest post, label as @[Guest Post] and draft a reply with our guidelines",
          "If someone asks about partnership opportunities, label as @[Partnership] and draft a reply asking for their media kit",
          "If someone reports broken marketing links, label as @[Bug] and forward to tech@company.com",
        ],
        provider,
      ),
      get prompt() {
        return formatPromptArray(this.promptArray);
      },
    },
    support: {
      label: "🛠️ Support",
      promptArray: processPromptsWithTerminology(
        [
          ...commonPrompts,
          "Label customer support tickets as @[Support Ticket]",
          "If someone reports a critical issue, label as @[Urgent Support] and forward to urgent@company.com",
          "Label bug reports as @[Bug] and forward to engineering@company.com",
          "Label feature requests as @[Feature Request] and forward to product@company.com",
          "If someone asks for refund, draft a reply with our refund policy link: https://company.com/refund-policy",
          "Label emails about account access issues as @[Access Issue] and draft a reply asking for their account details",
          "If someone asks for product documentation, draft a reply with our help center link: https://help.company.com",
          "Label emails about service outages as @[Service Issue] and forward to status@company.com",
          "If someone needs technical assistance, draft a reply asking for their account details and specific error messages",
          "Label positive feedback as @[Testimonial] and forward to marketing@company.com",
          "Label emails about API integration issues as @[API Support]",
          "If someone reports data privacy concerns, label as @[Privacy], and draft a reply with our privacy policy link: https://company.com/privacy-policy",
        ],
        provider,
      ),
      get prompt() {
        return formatPromptArray(this.promptArray);
      },
    },
    recruiter: {
      label: "👥 Recruiter",
      promptArray: processPromptsWithTerminology(
        [
          ...commonPrompts,
          "Label emails from candidates as @[Candidate]",
          "Label emails from hiring managers as @[Hiring Manager]",
          "Label emails from recruiters as @[Recruiter] and draft a reply with our hiring process overview link: https://company.com/hiring-process",
          "Label emails from job boards as @[Job Board] and archive them",
          "Label emails from LinkedIn as @[LinkedIn] and archive them",
          "If someone applies for a job, label as @[New Application] and draft a reply acknowledging their application",
          "Label emails containing resumes or CVs as @[Resume]",
          "If a candidate asks about application status, label as @[Status Update] and draft a reply asking for their position and date applied",
          "Label emails about interview scheduling as @[Interview Scheduling]",
          "If someone accepts an interview invite, label as @[Interview Confirmed] and forward to calendar@company.com",
          "If someone declines a job offer, label as @[Offer Declined] and forward to hiring-updates@company.com",
          "If someone accepts a job offer, label as @[Offer Accepted] and forward to onboarding@company.com",
          "Label emails about salary negotiations as @[Compensation]",
          "Label emails about reference checks as @[References]",
          "If someone asks about benefits, draft a reply with our benefits overview link: https://company.com/benefits",
          "Label emails about background checks as @[Background Check]",
          "If an internal employee refers someone, label as @[Employee Referral]",
          "Label emails about recruitment events or job fairs as @[Recruiting Event]",
          "If someone withdraws their application, label as @[Withdrawn]",
        ],
        provider,
      ),
      get prompt() {
        return formatPromptArray(this.promptArray);
      },
    },
    student: {
      label: "👩‍🎓 Student",
      promptArray: processPromptsWithTerminology(
        [
          "Label emails from professors and teaching assistants as @[School]",
          "Label emails about assignments and homework as @[Assignment]",
          "If someone sends class notes or study materials, label as @[Study Materials]",
          "Label emails about internships as @[Internship] and forward to my personal email me@example.com",
          "Label emails about exam schedules as @[Exam]",
          "Label emails about campus events as @[Event] and archive them",
          "If someone asks for class notes, draft a reply with our shared Google Drive folder link: https://drive.google.com/drive/u/0/folders/1234567890",
          "Label emails about tutoring opportunities as @[Tutoring] and draft a reply with that my rate is $70/hour or $40/hour for group tutoring",
        ],
        provider,
      ),
      get prompt() {
        return formatPromptArray(this.promptArray);
      },
    },
    reachout: {
      label: "💬 Outreach",
      promptArray: processPromptsWithTerminology(
        [
          "If someone replies to me that they're interested, label it @[Interested] and draft a reply with my calendar link: https://cal.com/example",
        ],
        provider,
      ),
      get prompt() {
        return formatPromptArray(this.promptArray);
      },
    },
    other: {
      label: "🤖 Other",
      promptArray: getExamplePrompts(provider),
      get prompt() {
        return formatPromptArray(this.promptArray);
      },
    },
  };
}
