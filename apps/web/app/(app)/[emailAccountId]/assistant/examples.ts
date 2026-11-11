import mapValues from "lodash/mapValues";
import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { ActionType } from "@/generated/prisma/enums";
import { getEmailTerminology } from "@/utils/terminology";
import { BRAND_NAME } from "@/utils/branding";

export type Personas = ReturnType<typeof getPersonas>;

export function getPersonas(provider: string, i18n: I18n) {
  return mapValues(PERSONAS, (persona) => {
    // The action is set from the English source, since keyword matching on the
    // translated text would miss.
    const examples = persona.prompts.map((prompt) => ({
      text: applyTerminology(i18n._(prompt.message), provider),
      action: prompt.action,
    }));
    const promptArray = examples.map((example) => example.text);

    return {
      label: `${persona.emoji} ${i18n._(persona.name)}`,
      examples,
      promptArray,
      prompt: formatPromptArray(promptArray),
    };
  });
}

const commonPrompts = [
  example(
    msg`Label emails from @mycompany.com addresses as @[Team]`,
    ActionType.LABEL,
  ),
  example(msg`Label urgent emails as @[Urgent]`, ActionType.LABEL),
];

const examplePromptsBase = [
  ...commonPrompts,
  example(
    msg`Forward receipts to jane@accounting.com and label them @[Receipt]`,
    ActionType.FORWARD,
  ),
  example(
    msg`Forward pitch decks to john@investing.com and label them @[Pitch Deck]`,
    ActionType.FORWARD,
  ),
  example(
    msg`Reply to cold emails by telling them to check out ${BRAND_NAME}. Then mark them as spam`,
    ActionType.REPLY,
  ),
  example(
    msg`Label high priority emails as @[High Priority]`,
    ActionType.LABEL,
  ),
  example(
    msg`If a founder asks to set up a call, draft a reply with my calendar link: https://cal.com/example`,
    ActionType.DRAFT_EMAIL,
  ),
  example(
    msg`If someone asks to cancel a plan, draft a reply with the cancellation link: https://company.com/cancel`,
    ActionType.DRAFT_EMAIL,
  ),
  example(
    msg`If a founder sends me an investor update, label it @[Investor Update] and archive it`,
    ActionType.ARCHIVE,
  ),
  example(
    msg`If someone pitches me their startup, label it as @[Investing], archive it, and draft a friendly reply that I no longer have time to look at the email but if they get a warm intro, that's their best bet to get funding from me`,
    ActionType.DRAFT_EMAIL,
  ),
  example(
    msg`If someone asks for a discount, reply with the discount code INBOX20`,
    ActionType.REPLY,
  ),
  example(
    msg`If someone asks for help with Product or Company, draft a reply telling them I no longer work there, but they should reach out to Company for support`,
    ActionType.DRAFT_EMAIL,
  ),
  example(
    msg`Review any emails from questions@pr.com and see if any are about finance. If so, draft a friendly reply that answers the question`,
    ActionType.DRAFT_EMAIL,
  ),
  example(
    msg`If people ask me to speak at an event, label the email @[Speaker Opportunity] and archive it`,
    ActionType.ARCHIVE,
  ),
  example(msg`Label emails from customers as @[Customer]`, ActionType.LABEL),
  example(msg`Label legal documents as @[Legal]`, ActionType.LABEL),
  example(msg`Label server errors as @[Error]`, ActionType.LABEL),
  example(msg`Label Stripe emails as @[Stripe]`, ActionType.LABEL),
];

const founderPromptArray = [
  ...commonPrompts,
  example(
    msg`If someone asks to set up a call, draft a reply with my calendar link: https://cal.com/example`,
    ActionType.DRAFT_EMAIL,
  ),
  example(
    msg`Label emails with feedback from customers about our product as @[Customer Feedback]`,
    ActionType.LABEL,
  ),
  example(
    msg`Label emails from customers who need our help and support as @[Customer Support]`,
    ActionType.LABEL,
  ),
  example(msg`Label emails from investors as @[Investor]`, ActionType.LABEL),
  example(msg`Label legal documents as @[Legal]`, ActionType.LABEL),
  example(msg`Label emails about travel as @[Travel]`, ActionType.LABEL),
  example(msg`Label recruitment related emails as @[Hiring]`, ActionType.LABEL),
];

const PERSONAS = {
  founder: {
    emoji: "🚀",
    name: msg`Founder`,
    prompts: founderPromptArray,
  },
  influencer: {
    emoji: "📹",
    name: msg`Influencer`,
    prompts: [
      ...commonPrompts,
      example(
        msg`Label sponsorship inquiries as @[Sponsorship] and draft a reply as follows:
> Hey NAME,
>
> I've attached my media kit and pricing`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`Label emails about affiliate programs as @[Affiliate] and archive them`,
        ActionType.ARCHIVE,
      ),
      example(
        msg`Label collaboration requests as @[Collab] and draft a reply asking about their audience size and engagement rates`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`Label brand partnership emails as @[Brand Deal] and forward to manager@example.com`,
        ActionType.FORWARD,
      ),
      example(
        msg`Label media inquiries to us as @[Press] and draft a polite reply`,
        ActionType.DRAFT_EMAIL,
      ),
    ],
  },
  realtor: {
    emoji: "🏠",
    name: msg`Realtor`,
    prompts: [
      ...commonPrompts,
      example(
        msg`Label emails from potential buyers as @[Buyer Lead] and draft a reply asking about their budget and preferred neighborhoods`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`Label emails from potential sellers as @[Seller Lead] and draft a reply with my calendar link to schedule a home evaluation: https://cal.com/example`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`If someone asks about home prices in a specific area, label as @[Market Inquiry] and draft a reply with recent comparable sales data`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`Label emails from mortgage brokers and lenders as @[Lender] and archive them`,
        ActionType.ARCHIVE,
      ),
      example(
        msg`If someone asks to schedule a showing, label as @[Showing Request] and draft a reply with available time slots`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`Label emails about closing documents as @[Closing] and forward to transactions@realty.com`,
        ActionType.FORWARD,
      ),
      example(
        msg`If someone asks about the home buying process, draft a reply with our buyer's guide link: https://realty.com/buyers-guide`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`Label emails from home inspectors as @[Inspector] and forward to scheduling@realty.com`,
        ActionType.FORWARD,
      ),
      example(
        msg`If someone refers a client to me, label as @[Referral] and draft a thank you reply with my calendar link to schedule a consultation`,
        ActionType.DRAFT_EMAIL,
      ),
    ],
  },
  investor: {
    emoji: "💰",
    name: msg`Investor`,
    prompts: [
      ...commonPrompts,
      example(
        msg`If a founder asks to set up a call, draft a reply with my calendar link: https://cal.com/example`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`If a founder sends me an investor update, label it @[Investor Update] and archive it`,
        ActionType.ARCHIVE,
      ),
      example(
        msg`Forward pitch decks to analyst@vc.com that asks them to review it and label them @[Pitch Deck]`,
        ActionType.FORWARD,
      ),
      example(msg`Label emails from LPs as @[LP]`, ActionType.LABEL),
      example(msg`Label legal documents as @[Legal]`, ActionType.LABEL),
      example(msg`Label emails about travel as @[Travel]`, ActionType.LABEL),
      example(
        msg`Label emails about portfolio company exits as @[Exit Opportunity]`,
        ActionType.LABEL,
      ),
      example(
        msg`Label emails containing term sheets as @[Term Sheet]`,
        ActionType.LABEL,
      ),
      example(
        msg`If a portfolio company reports bad news, label as @[Portfolio Alert] and draft a reply to schedule an emergency call`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`Label due diligence related emails as @[Due Diligence]`,
        ActionType.LABEL,
      ),
      example(
        msg`Forward emails about industry research reports to research@vc.com`,
        ActionType.FORWARD,
      ),
      example(
        msg`If someone asks for a warm intro to a portfolio company, draft a reply asking for more context about why they want to connect`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`Label emails about fund administration as @[Fund Admin]`,
        ActionType.LABEL,
      ),
      example(
        msg`Label emails about speaking at investment conferences as @[Speaking Opportunity]`,
        ActionType.LABEL,
      ),
    ],
  },
  assistant: {
    emoji: "📋",
    name: msg`Assistant`,
    prompts: founderPromptArray,
  },
  developer: {
    emoji: "👨‍💻",
    name: msg`Developer`,
    prompts: [
      ...commonPrompts,
      example(
        msg`Label server errors, deployment failures, and other server alerts as @[Alert] and forward to oncall@company.com`,
        ActionType.FORWARD,
      ),
      example(
        msg`Label emails from GitHub as @[GitHub] and archive them`,
        ActionType.ARCHIVE,
      ),
      example(
        msg`Label emails from Figma as @[Design] and archive them`,
        ActionType.ARCHIVE,
      ),
      example(
        msg`Label emails from Stripe as @[Stripe] and archive them`,
        ActionType.ARCHIVE,
      ),
      example(
        msg`Label emails from Slack as @[Slack] and archive them`,
        ActionType.ARCHIVE,
      ),
      example(msg`Label emails about bug reports as @[Bug]`, ActionType.LABEL),
      example(
        msg`If someone reports a security vulnerability, label as @[Security] and forward to security@company.com`,
        ActionType.FORWARD,
      ),
      example(
        msg`Label emails about job interviews as @[Job Search]`,
        ActionType.LABEL,
      ),
      example(
        msg`Label emails from recruiters as @[Recruiter] and archive them`,
        ActionType.ARCHIVE,
      ),
    ],
  },
  designer: {
    emoji: "🎨",
    name: msg`Designer`,
    prompts: [
      ...commonPrompts,
      example(
        msg`Label emails from Figma, Adobe, Sketch, and other design tools as @[Design] and archive them`,
        ActionType.ARCHIVE,
      ),
      example(msg`Label emails from clients as @[Client]`, ActionType.LABEL),
      example(
        msg`If someone sends design assets, label as @[Design Assets] and forward to assets@company.com`,
        ActionType.FORWARD,
      ),
      example(
        msg`Label emails from Dribbble, Behance, and other design inspiration sites as @[Inspiration] and archive them`,
        ActionType.ARCHIVE,
      ),
      example(
        msg`Label emails about design conferences as @[Conference]`,
        ActionType.LABEL,
      ),
      example(
        msg`If someone requests brand assets, draft a reply with a link to our brand portal: https://brand.company.com`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`Label emails about user research as @[Research]`,
        ActionType.LABEL,
      ),
      example(
        msg`Label emails about job interviews as @[Job Search]`,
        ActionType.LABEL,
      ),
      example(
        msg`Label emails from recruiters as @[Recruiter] and archive them`,
        ActionType.ARCHIVE,
      ),
    ],
  },
  sales: {
    emoji: "🤝",
    name: msg`Sales`,
    prompts: [
      ...commonPrompts,
      example(
        msg`Label emails from prospects as @[Prospect]`,
        ActionType.LABEL,
      ),
      example(
        msg`Label emails from customers as @[Customer]`,
        ActionType.LABEL,
      ),
      example(
        msg`Label emails about deal negotiations as @[Deal Discussion]`,
        ActionType.LABEL,
      ),
      example(
        msg`Label emails from sales tools as @[Sales Tool] and archive them`,
        ActionType.ARCHIVE,
      ),
      example(
        msg`Label emails about sales opportunities as @[Sales Opportunity]`,
        ActionType.LABEL,
      ),
      example(
        msg`If someone asks for pricing, draft a reply with our pricing page link: https://company.com/pricing`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`Label emails containing signed contracts as @[Signed Contract] and forward to legal@company.com`,
        ActionType.FORWARD,
      ),
      example(
        msg`If someone requests a demo, draft a reply with my calendar link: https://cal.com/example`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`If someone asks about product features, draft a reply with relevant feature documentation links`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`If someone reports implementation issues, label as @[Support Need] and forward to support@company.com`,
        ActionType.FORWARD,
      ),
      example(
        msg`If someone asks about enterprise pricing, draft a reply asking about their company size and requirements`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`If a customer mentions churn risk, label as @[Churn Risk] and draft an urgent notification to the customer success team`,
        ActionType.DRAFT_EMAIL,
      ),
    ],
  },
  marketer: {
    emoji: "📢",
    name: msg`Marketer`,
    prompts: [
      ...commonPrompts,
      example(
        msg`Label emails from influencers as @[Influencer]`,
        ActionType.LABEL,
      ),
      example(
        msg`Label emails from ad platforms (Google, Meta, LinkedIn) as @[Advertising]`,
        ActionType.LABEL,
      ),
      example(
        msg`Label press inquiries to us as @[Press] and forward to pr@company.com`,
        ActionType.FORWARD,
      ),
      example(
        msg`Label emails about content marketing as @[Content]`,
        ActionType.MARK_READ,
      ),
      example(
        msg`If someone asks about sponsorship, label as @[Sponsorship] and draft a reply asking about their audience size`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`If someone requests to guest post, label as @[Guest Post] and draft a reply with our guidelines`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`If someone asks about partnership opportunities, label as @[Partnership] and draft a reply asking for their media kit`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`If someone reports broken marketing links, label as @[Bug] and forward to tech@company.com`,
        ActionType.FORWARD,
      ),
    ],
  },
  support: {
    emoji: "🛠️",
    name: msg`Support`,
    prompts: [
      ...commonPrompts,
      example(
        msg`Label customer requests for help as @[Support Ticket]`,
        ActionType.LABEL,
      ),
      example(
        msg`If someone reports a critical issue, label as @[Urgent Support] and forward to urgent@company.com`,
        ActionType.FORWARD,
      ),
      example(
        msg`Label bug reports as @[Bug] and forward to engineering@company.com`,
        ActionType.FORWARD,
      ),
      example(
        msg`Label feature requests as @[Feature Request] and forward to product@company.com`,
        ActionType.FORWARD,
      ),
      example(
        msg`If someone asks for refund, draft a reply with our refund policy link: https://company.com/refund-policy`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`Label emails about account access issues as @[Access Issue] and draft a reply asking for their account details`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`If someone asks for product documentation, draft a reply with our help center link: https://help.company.com`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`Label emails about service outages as @[Service Issue] and forward to status@company.com`,
        ActionType.FORWARD,
      ),
      example(
        msg`If someone needs technical assistance, draft a reply asking for their account details and specific error messages`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`Label positive feedback as @[Testimonial] and forward to marketing@company.com`,
        ActionType.FORWARD,
      ),
      example(
        msg`Label emails about API integration issues as @[API Support]`,
        ActionType.LABEL,
      ),
      example(
        msg`If someone reports data privacy concerns, label as @[Privacy], and draft a reply with our privacy policy link: https://company.com/privacy-policy`,
        ActionType.DRAFT_EMAIL,
      ),
    ],
  },
  recruiter: {
    emoji: "👥",
    name: msg`Recruiter`,
    prompts: [
      ...commonPrompts,
      example(
        msg`Label emails from candidates as @[Candidate]`,
        ActionType.LABEL,
      ),
      example(
        msg`Label emails from hiring managers as @[Hiring Manager]`,
        ActionType.LABEL,
      ),
      example(
        msg`Label emails from recruiters as @[Recruiter] and draft a reply with our hiring process overview link: https://company.com/hiring-process`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`Label emails from job boards as @[Job Board] and archive them`,
        ActionType.ARCHIVE,
      ),
      example(
        msg`Label emails from LinkedIn as @[LinkedIn] and archive them`,
        ActionType.ARCHIVE,
      ),
      example(
        msg`If someone applies for a job, label as @[New Application] and draft a reply acknowledging their application`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`Label emails containing resumes or CVs as @[Resume]`,
        ActionType.LABEL,
      ),
      example(
        msg`If a candidate asks about application status, label as @[Status Update] and draft a reply asking for their position and date applied`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`Label emails about interview scheduling as @[Interview Scheduling]`,
        ActionType.LABEL,
      ),
      example(
        msg`If someone accepts an interview invite, label as @[Interview Confirmed] and forward to calendar@company.com`,
        ActionType.FORWARD,
      ),
      example(
        msg`If someone declines a job offer, label as @[Offer Declined] and forward to hiring-updates@company.com`,
        ActionType.FORWARD,
      ),
      example(
        msg`If someone accepts a job offer, label as @[Offer Accepted] and forward to onboarding@company.com`,
        ActionType.FORWARD,
      ),
      example(
        msg`Label emails about salary negotiations as @[Compensation]`,
        ActionType.LABEL,
      ),
      example(
        msg`Label emails about reference checks as @[References]`,
        ActionType.LABEL,
      ),
      example(
        msg`If someone asks about benefits, draft a reply with our benefits overview link: https://company.com/benefits`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`Label emails about background checks as @[Background Check]`,
        ActionType.LABEL,
      ),
      example(
        msg`If an internal employee refers someone, label as @[Employee Referral]`,
        ActionType.LABEL,
      ),
      example(
        msg`Label emails about recruitment events or job fairs as @[Recruiting Event]`,
        ActionType.LABEL,
      ),
      example(
        msg`If someone withdraws their application, label as @[Withdrawn]`,
        ActionType.LABEL,
      ),
    ],
  },
  student: {
    emoji: "👩‍🎓",
    name: msg`Student`,
    prompts: [
      example(
        msg`Label emails from professors and teaching assistants as @[School]`,
        ActionType.LABEL,
      ),
      example(
        msg`Label emails about assignments and homework as @[Assignment]`,
        ActionType.LABEL,
      ),
      example(
        msg`If someone sends class notes or study materials, label as @[Study Materials]`,
        ActionType.LABEL,
      ),
      example(
        msg`Label emails about internships as @[Internship] and forward to my personal email me@example.com`,
        ActionType.FORWARD,
      ),
      example(
        msg`Label emails about exam schedules as @[Exam]`,
        ActionType.LABEL,
      ),
      example(
        msg`Label emails about campus events as @[Event] and archive them`,
        ActionType.ARCHIVE,
      ),
      example(
        msg`If someone asks for class notes, draft a reply with our shared Google Drive folder link: https://drive.google.com/drive/u/0/folders/1234567890`,
        ActionType.DRAFT_EMAIL,
      ),
      example(
        msg`Label emails about tutoring opportunities as @[Tutoring] and draft a reply with that my rate is $70/hour or $40/hour for group tutoring`,
        ActionType.DRAFT_EMAIL,
      ),
    ],
  },
  reachout: {
    emoji: "💬",
    name: msg`Outreach`,
    prompts: [
      example(
        msg`If someone replies to me that they're interested, label it @[Interested] and draft a reply with my calendar link: https://cal.com/example`,
        ActionType.DRAFT_EMAIL,
      ),
    ],
  },
  other: {
    emoji: "🤖",
    name: msg`Other`,
    prompts: examplePromptsBase,
  },
};

function formatPromptArray(promptArray: string[]): string {
  return `${promptArray.map((item) => `* ${item}`).join(".\n")}.`;
}

// Only rewrites the English source wording; translations keep their own term.
function applyTerminology(prompt: string, provider: string): string {
  const terminology = getEmailTerminology(provider);
  // Replace "Label" at the beginning of sentences or after punctuation
  const processed = prompt.replace(/\bLabel\b/g, terminology.label.action);
  // Replace lowercase "label" in the middle of sentences
  return processed.replace(
    /\blabel\b/g,
    terminology.label.action.toLowerCase(),
  );
}

function example(
  message: MessageDescriptor,
  action: ActionType | null,
): { message: MessageDescriptor; action: ActionType | null } {
  return { message, action };
}
