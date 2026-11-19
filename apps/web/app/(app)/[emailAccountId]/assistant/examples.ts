import mapValues from "lodash/mapValues";
import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { ActionType } from "@/generated/prisma/enums";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { BRAND_NAME } from "@/utils/branding";

export type Personas = ReturnType<typeof getPersonas>;

export function getPersonas(provider: string, i18n: I18n) {
  const isOutlook = isMicrosoftProvider(provider);
  return mapValues(PERSONAS, (persona) => {
    const examples = persona.prompts.map((prompt) => ({
      // Outlook calls labels categories, so its examples have their own wording.
      text: i18n._((isOutlook && prompt.outlookMessage) || prompt.message),
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

const commonPrompts: ExamplePrompt[] = [
  {
    message: msg`Label emails from @mycompany.com addresses as @[Team]`,
    outlookMessage: msg`Categorize emails from @mycompany.com addresses as @[Team]`,
    action: ActionType.LABEL,
  },
  {
    message: msg`Label urgent emails as @[Urgent]`,
    outlookMessage: msg`Categorize urgent emails as @[Urgent]`,
    action: ActionType.LABEL,
  },
];

const examplePromptsBase: ExamplePrompt[] = [
  ...commonPrompts,
  {
    message: msg`Forward receipts to jane@accounting.com and label them @[Receipt]`,
    outlookMessage: msg`Forward receipts to jane@accounting.com and categorize them @[Receipt]`,
    action: ActionType.FORWARD,
  },
  {
    message: msg`Forward pitch decks to john@investing.com and label them @[Pitch Deck]`,
    outlookMessage: msg`Forward pitch decks to john@investing.com and categorize them @[Pitch Deck]`,
    action: ActionType.FORWARD,
  },
  {
    message: msg`Reply to cold emails by telling them to check out ${BRAND_NAME}. Then mark them as spam`,
    action: ActionType.REPLY,
  },
  {
    message: msg`Label high priority emails as @[High Priority]`,
    outlookMessage: msg`Categorize high priority emails as @[High Priority]`,
    action: ActionType.LABEL,
  },
  {
    message: msg`If a founder asks to set up a call, draft a reply with my calendar link: https://cal.com/example`,
    action: ActionType.DRAFT_EMAIL,
  },
  {
    message: msg`If someone asks to cancel a plan, draft a reply with the cancellation link: https://company.com/cancel`,
    action: ActionType.DRAFT_EMAIL,
  },
  {
    message: msg`If a founder sends me an investor update, label it @[Investor Update] and archive it`,
    outlookMessage: msg`If a founder sends me an investor update, categorize it @[Investor Update] and archive it`,
    action: ActionType.ARCHIVE,
  },
  {
    message: msg`If someone pitches me their startup, label it as @[Investing], archive it, and draft a friendly reply that I no longer have time to look at the email but if they get a warm intro, that's their best bet to get funding from me`,
    outlookMessage: msg`If someone pitches me their startup, categorize it as @[Investing], archive it, and draft a friendly reply that I no longer have time to look at the email but if they get a warm intro, that's their best bet to get funding from me`,
    action: ActionType.DRAFT_EMAIL,
  },
  {
    message: msg`If someone asks for a discount, reply with the discount code INBOX20`,
    action: ActionType.REPLY,
  },
  {
    message: msg`If someone asks for help with Product or Company, draft a reply telling them I no longer work there, but they should reach out to Company for support`,
    action: ActionType.DRAFT_EMAIL,
  },
  {
    message: msg`Review any emails from questions@pr.com and see if any are about finance. If so, draft a friendly reply that answers the question`,
    action: ActionType.DRAFT_EMAIL,
  },
  {
    message: msg`If people ask me to speak at an event, label the email @[Speaker Opportunity] and archive it`,
    outlookMessage: msg`If people ask me to speak at an event, categorize the email @[Speaker Opportunity] and archive it`,
    action: ActionType.ARCHIVE,
  },
  {
    message: msg`Label emails from customers as @[Customer]`,
    outlookMessage: msg`Categorize emails from customers as @[Customer]`,
    action: ActionType.LABEL,
  },
  {
    message: msg`Label legal documents as @[Legal]`,
    outlookMessage: msg`Categorize legal documents as @[Legal]`,
    action: ActionType.LABEL,
  },
  {
    message: msg`Label server errors as @[Error]`,
    outlookMessage: msg`Categorize server errors as @[Error]`,
    action: ActionType.LABEL,
  },
  {
    message: msg`Label Stripe emails as @[Stripe]`,
    outlookMessage: msg`Categorize Stripe emails as @[Stripe]`,
    action: ActionType.LABEL,
  },
];

const founderPromptArray: ExamplePrompt[] = [
  ...commonPrompts,
  {
    message: msg`If someone asks to set up a call, draft a reply with my calendar link: https://cal.com/example`,
    action: ActionType.DRAFT_EMAIL,
  },
  {
    message: msg`Label emails with feedback from customers about our product as @[Customer Feedback]`,
    outlookMessage: msg`Categorize emails with feedback from customers about our product as @[Customer Feedback]`,
    action: ActionType.LABEL,
  },
  {
    message: msg`Label emails from customers who need our help and support as @[Customer Support]`,
    outlookMessage: msg`Categorize emails from customers who need our help and support as @[Customer Support]`,
    action: ActionType.LABEL,
  },
  {
    message: msg`Label emails from investors as @[Investor]`,
    outlookMessage: msg`Categorize emails from investors as @[Investor]`,
    action: ActionType.LABEL,
  },
  {
    message: msg`Label legal documents as @[Legal]`,
    outlookMessage: msg`Categorize legal documents as @[Legal]`,
    action: ActionType.LABEL,
  },
  {
    message: msg`Label emails about travel as @[Travel]`,
    outlookMessage: msg`Categorize emails about travel as @[Travel]`,
    action: ActionType.LABEL,
  },
  {
    message: msg`Label recruitment related emails as @[Hiring]`,
    outlookMessage: msg`Categorize recruitment related emails as @[Hiring]`,
    action: ActionType.LABEL,
  },
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
      {
        message: msg`Label sponsorship inquiries as @[Sponsorship] and draft a reply as follows:
> Hey NAME,
>
> I've attached my media kit and pricing`,
        outlookMessage: msg`Categorize sponsorship inquiries as @[Sponsorship] and draft a reply as follows:
> Hey NAME,
>
> I've attached my media kit and pricing`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`Label emails about affiliate programs as @[Affiliate] and archive them`,
        outlookMessage: msg`Categorize emails about affiliate programs as @[Affiliate] and archive them`,
        action: ActionType.ARCHIVE,
      },
      {
        message: msg`Label collaboration requests as @[Collab] and draft a reply asking about their audience size and engagement rates`,
        outlookMessage: msg`Categorize collaboration requests as @[Collab] and draft a reply asking about their audience size and engagement rates`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`Label brand partnership emails as @[Brand Deal] and forward to manager@example.com`,
        outlookMessage: msg`Categorize brand partnership emails as @[Brand Deal] and forward to manager@example.com`,
        action: ActionType.FORWARD,
      },
      {
        message: msg`Label media inquiries to us as @[Press] and draft a polite reply`,
        outlookMessage: msg`Categorize media inquiries to us as @[Press] and draft a polite reply`,
        action: ActionType.DRAFT_EMAIL,
      },
    ],
  },
  realtor: {
    emoji: "🏠",
    name: msg`Realtor`,
    prompts: [
      ...commonPrompts,
      {
        message: msg`Label emails from potential buyers as @[Buyer Lead] and draft a reply asking about their budget and preferred neighborhoods`,
        outlookMessage: msg`Categorize emails from potential buyers as @[Buyer Lead] and draft a reply asking about their budget and preferred neighborhoods`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`Label emails from potential sellers as @[Seller Lead] and draft a reply with my calendar link to schedule a home evaluation: https://cal.com/example`,
        outlookMessage: msg`Categorize emails from potential sellers as @[Seller Lead] and draft a reply with my calendar link to schedule a home evaluation: https://cal.com/example`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`If someone asks about home prices in a specific area, label as @[Market Inquiry] and draft a reply with recent comparable sales data`,
        outlookMessage: msg`If someone asks about home prices in a specific area, categorize as @[Market Inquiry] and draft a reply with recent comparable sales data`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`Label emails from mortgage brokers and lenders as @[Lender] and archive them`,
        outlookMessage: msg`Categorize emails from mortgage brokers and lenders as @[Lender] and archive them`,
        action: ActionType.ARCHIVE,
      },
      {
        message: msg`If someone asks to schedule a showing, label as @[Showing Request] and draft a reply with available time slots`,
        outlookMessage: msg`If someone asks to schedule a showing, categorize as @[Showing Request] and draft a reply with available time slots`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`Label emails about closing documents as @[Closing] and forward to transactions@realty.com`,
        outlookMessage: msg`Categorize emails about closing documents as @[Closing] and forward to transactions@realty.com`,
        action: ActionType.FORWARD,
      },
      {
        message: msg`If someone asks about the home buying process, draft a reply with our buyer's guide link: https://realty.com/buyers-guide`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`Label emails from home inspectors as @[Inspector] and forward to scheduling@realty.com`,
        outlookMessage: msg`Categorize emails from home inspectors as @[Inspector] and forward to scheduling@realty.com`,
        action: ActionType.FORWARD,
      },
      {
        message: msg`If someone refers a client to me, label as @[Referral] and draft a thank you reply with my calendar link to schedule a consultation`,
        outlookMessage: msg`If someone refers a client to me, categorize as @[Referral] and draft a thank you reply with my calendar link to schedule a consultation`,
        action: ActionType.DRAFT_EMAIL,
      },
    ],
  },
  investor: {
    emoji: "💰",
    name: msg`Investor`,
    prompts: [
      ...commonPrompts,
      {
        message: msg`If a founder asks to set up a call, draft a reply with my calendar link: https://cal.com/example`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`If a founder sends me an investor update, label it @[Investor Update] and archive it`,
        outlookMessage: msg`If a founder sends me an investor update, categorize it @[Investor Update] and archive it`,
        action: ActionType.ARCHIVE,
      },
      {
        message: msg`Forward pitch decks to analyst@vc.com that asks them to review it and label them @[Pitch Deck]`,
        outlookMessage: msg`Forward pitch decks to analyst@vc.com that asks them to review it and categorize them @[Pitch Deck]`,
        action: ActionType.FORWARD,
      },
      {
        message: msg`Label emails from LPs as @[LP]`,
        outlookMessage: msg`Categorize emails from LPs as @[LP]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`Label legal documents as @[Legal]`,
        outlookMessage: msg`Categorize legal documents as @[Legal]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`Label emails about travel as @[Travel]`,
        outlookMessage: msg`Categorize emails about travel as @[Travel]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`Label emails about portfolio company exits as @[Exit Opportunity]`,
        outlookMessage: msg`Categorize emails about portfolio company exits as @[Exit Opportunity]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`Label emails containing term sheets as @[Term Sheet]`,
        outlookMessage: msg`Categorize emails containing term sheets as @[Term Sheet]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`If a portfolio company reports bad news, label as @[Portfolio Alert] and draft a reply to schedule an emergency call`,
        outlookMessage: msg`If a portfolio company reports bad news, categorize as @[Portfolio Alert] and draft a reply to schedule an emergency call`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`Label due diligence related emails as @[Due Diligence]`,
        outlookMessage: msg`Categorize due diligence related emails as @[Due Diligence]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`Forward emails about industry research reports to research@vc.com`,
        action: ActionType.FORWARD,
      },
      {
        message: msg`If someone asks for a warm intro to a portfolio company, draft a reply asking for more context about why they want to connect`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`Label emails about fund administration as @[Fund Admin]`,
        outlookMessage: msg`Categorize emails about fund administration as @[Fund Admin]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`Label emails about speaking at investment conferences as @[Speaking Opportunity]`,
        outlookMessage: msg`Categorize emails about speaking at investment conferences as @[Speaking Opportunity]`,
        action: ActionType.LABEL,
      },
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
      {
        message: msg`Label server errors, deployment failures, and other server alerts as @[Alert] and forward to oncall@company.com`,
        outlookMessage: msg`Categorize server errors, deployment failures, and other server alerts as @[Alert] and forward to oncall@company.com`,
        action: ActionType.FORWARD,
      },
      {
        message: msg`Label emails from GitHub as @[GitHub] and archive them`,
        outlookMessage: msg`Categorize emails from GitHub as @[GitHub] and archive them`,
        action: ActionType.ARCHIVE,
      },
      {
        message: msg`Label emails from Figma as @[Design] and archive them`,
        outlookMessage: msg`Categorize emails from Figma as @[Design] and archive them`,
        action: ActionType.ARCHIVE,
      },
      {
        message: msg`Label emails from Stripe as @[Stripe] and archive them`,
        outlookMessage: msg`Categorize emails from Stripe as @[Stripe] and archive them`,
        action: ActionType.ARCHIVE,
      },
      {
        message: msg`Label emails from Slack as @[Slack] and archive them`,
        outlookMessage: msg`Categorize emails from Slack as @[Slack] and archive them`,
        action: ActionType.ARCHIVE,
      },
      {
        message: msg`Label emails about bug reports as @[Bug]`,
        outlookMessage: msg`Categorize emails about bug reports as @[Bug]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`If someone reports a security vulnerability, label as @[Security] and forward to security@company.com`,
        outlookMessage: msg`If someone reports a security vulnerability, categorize as @[Security] and forward to security@company.com`,
        action: ActionType.FORWARD,
      },
      {
        message: msg`Label emails about job interviews as @[Job Search]`,
        outlookMessage: msg`Categorize emails about job interviews as @[Job Search]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`Label emails from recruiters as @[Recruiter] and archive them`,
        outlookMessage: msg`Categorize emails from recruiters as @[Recruiter] and archive them`,
        action: ActionType.ARCHIVE,
      },
    ],
  },
  designer: {
    emoji: "🎨",
    name: msg`Designer`,
    prompts: [
      ...commonPrompts,
      {
        message: msg`Label emails from Figma, Adobe, Sketch, and other design tools as @[Design] and archive them`,
        outlookMessage: msg`Categorize emails from Figma, Adobe, Sketch, and other design tools as @[Design] and archive them`,
        action: ActionType.ARCHIVE,
      },
      {
        message: msg`Label emails from clients as @[Client]`,
        outlookMessage: msg`Categorize emails from clients as @[Client]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`If someone sends design assets, label as @[Design Assets] and forward to assets@company.com`,
        outlookMessage: msg`If someone sends design assets, categorize as @[Design Assets] and forward to assets@company.com`,
        action: ActionType.FORWARD,
      },
      {
        message: msg`Label emails from Dribbble, Behance, and other design inspiration sites as @[Inspiration] and archive them`,
        outlookMessage: msg`Categorize emails from Dribbble, Behance, and other design inspiration sites as @[Inspiration] and archive them`,
        action: ActionType.ARCHIVE,
      },
      {
        message: msg`Label emails about design conferences as @[Conference]`,
        outlookMessage: msg`Categorize emails about design conferences as @[Conference]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`If someone requests brand assets, draft a reply with a link to our brand portal: https://brand.company.com`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`Label emails about user research as @[Research]`,
        outlookMessage: msg`Categorize emails about user research as @[Research]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`Label emails about job interviews as @[Job Search]`,
        outlookMessage: msg`Categorize emails about job interviews as @[Job Search]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`Label emails from recruiters as @[Recruiter] and archive them`,
        outlookMessage: msg`Categorize emails from recruiters as @[Recruiter] and archive them`,
        action: ActionType.ARCHIVE,
      },
    ],
  },
  sales: {
    emoji: "🤝",
    name: msg`Sales`,
    prompts: [
      ...commonPrompts,
      {
        message: msg`Label emails from prospects as @[Prospect]`,
        outlookMessage: msg`Categorize emails from prospects as @[Prospect]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`Label emails from customers as @[Customer]`,
        outlookMessage: msg`Categorize emails from customers as @[Customer]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`Label emails about deal negotiations as @[Deal Discussion]`,
        outlookMessage: msg`Categorize emails about deal negotiations as @[Deal Discussion]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`Label emails from sales tools as @[Sales Tool] and archive them`,
        outlookMessage: msg`Categorize emails from sales tools as @[Sales Tool] and archive them`,
        action: ActionType.ARCHIVE,
      },
      {
        message: msg`Label emails about sales opportunities as @[Sales Opportunity]`,
        outlookMessage: msg`Categorize emails about sales opportunities as @[Sales Opportunity]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`If someone asks for pricing, draft a reply with our pricing page link: https://company.com/pricing`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`Label emails containing signed contracts as @[Signed Contract] and forward to legal@company.com`,
        outlookMessage: msg`Categorize emails containing signed contracts as @[Signed Contract] and forward to legal@company.com`,
        action: ActionType.FORWARD,
      },
      {
        message: msg`If someone requests a demo, draft a reply with my calendar link: https://cal.com/example`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`If someone asks about product features, draft a reply with relevant feature documentation links`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`If someone reports implementation issues, label as @[Support Need] and forward to support@company.com`,
        outlookMessage: msg`If someone reports implementation issues, categorize as @[Support Need] and forward to support@company.com`,
        action: ActionType.FORWARD,
      },
      {
        message: msg`If someone asks about enterprise pricing, draft a reply asking about their company size and requirements`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`If a customer mentions churn risk, label as @[Churn Risk] and draft an urgent notification to the customer success team`,
        outlookMessage: msg`If a customer mentions churn risk, categorize as @[Churn Risk] and draft an urgent notification to the customer success team`,
        action: ActionType.DRAFT_EMAIL,
      },
    ],
  },
  marketer: {
    emoji: "📢",
    name: msg`Marketer`,
    prompts: [
      ...commonPrompts,
      {
        message: msg`Label emails from influencers as @[Influencer]`,
        outlookMessage: msg`Categorize emails from influencers as @[Influencer]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`Label emails from ad platforms (Google, Meta, LinkedIn) as @[Advertising]`,
        outlookMessage: msg`Categorize emails from ad platforms (Google, Meta, LinkedIn) as @[Advertising]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`Label press inquiries to us as @[Press] and forward to pr@company.com`,
        outlookMessage: msg`Categorize press inquiries to us as @[Press] and forward to pr@company.com`,
        action: ActionType.FORWARD,
      },
      {
        message: msg`Label emails about content marketing as @[Content]`,
        outlookMessage: msg`Categorize emails about content marketing as @[Content]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`If someone asks about sponsorship, label as @[Sponsorship] and draft a reply asking about their audience size`,
        outlookMessage: msg`If someone asks about sponsorship, categorize as @[Sponsorship] and draft a reply asking about their audience size`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`If someone requests to guest post, label as @[Guest Post] and draft a reply with our guidelines`,
        outlookMessage: msg`If someone requests to guest post, categorize as @[Guest Post] and draft a reply with our guidelines`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`If someone asks about partnership opportunities, label as @[Partnership] and draft a reply asking for their media kit`,
        outlookMessage: msg`If someone asks about partnership opportunities, categorize as @[Partnership] and draft a reply asking for their media kit`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`If someone reports broken marketing links, label as @[Bug] and forward to tech@company.com`,
        outlookMessage: msg`If someone reports broken marketing links, categorize as @[Bug] and forward to tech@company.com`,
        action: ActionType.FORWARD,
      },
    ],
  },
  support: {
    emoji: "🛠️",
    name: msg`Support`,
    prompts: [
      ...commonPrompts,
      {
        message: msg`Label customer requests for help as @[Support Ticket]`,
        outlookMessage: msg`Categorize customer requests for help as @[Support Ticket]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`If someone reports a critical issue, label as @[Urgent Support] and forward to urgent@company.com`,
        outlookMessage: msg`If someone reports a critical issue, categorize as @[Urgent Support] and forward to urgent@company.com`,
        action: ActionType.FORWARD,
      },
      {
        message: msg`Label bug reports as @[Bug] and forward to engineering@company.com`,
        outlookMessage: msg`Categorize bug reports as @[Bug] and forward to engineering@company.com`,
        action: ActionType.FORWARD,
      },
      {
        message: msg`Label feature requests as @[Feature Request] and forward to product@company.com`,
        outlookMessage: msg`Categorize feature requests as @[Feature Request] and forward to product@company.com`,
        action: ActionType.FORWARD,
      },
      {
        message: msg`If someone asks for refund, draft a reply with our refund policy link: https://company.com/refund-policy`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`Label emails about account access issues as @[Access Issue] and draft a reply asking for their account details`,
        outlookMessage: msg`Categorize emails about account access issues as @[Access Issue] and draft a reply asking for their account details`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`If someone asks for product documentation, draft a reply with our help center link: https://help.company.com`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`Label emails about service outages as @[Service Issue] and forward to status@company.com`,
        outlookMessage: msg`Categorize emails about service outages as @[Service Issue] and forward to status@company.com`,
        action: ActionType.FORWARD,
      },
      {
        message: msg`If someone needs technical assistance, draft a reply asking for their account details and specific error messages`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`Label positive feedback as @[Testimonial] and forward to marketing@company.com`,
        outlookMessage: msg`Categorize positive feedback as @[Testimonial] and forward to marketing@company.com`,
        action: ActionType.FORWARD,
      },
      {
        message: msg`Label emails about API integration issues as @[API Support]`,
        outlookMessage: msg`Categorize emails about API integration issues as @[API Support]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`If someone reports data privacy concerns, label as @[Privacy], and draft a reply with our privacy policy link: https://company.com/privacy-policy`,
        outlookMessage: msg`If someone reports data privacy concerns, categorize as @[Privacy], and draft a reply with our privacy policy link: https://company.com/privacy-policy`,
        action: ActionType.DRAFT_EMAIL,
      },
    ],
  },
  recruiter: {
    emoji: "👥",
    name: msg`Recruiter`,
    prompts: [
      ...commonPrompts,
      {
        message: msg`Label emails from candidates as @[Candidate]`,
        outlookMessage: msg`Categorize emails from candidates as @[Candidate]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`Label emails from hiring managers as @[Hiring Manager]`,
        outlookMessage: msg`Categorize emails from hiring managers as @[Hiring Manager]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`Label emails from recruiters as @[Recruiter] and draft a reply with our hiring process overview link: https://company.com/hiring-process`,
        outlookMessage: msg`Categorize emails from recruiters as @[Recruiter] and draft a reply with our hiring process overview link: https://company.com/hiring-process`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`Label emails from job boards as @[Job Board] and archive them`,
        outlookMessage: msg`Categorize emails from job boards as @[Job Board] and archive them`,
        action: ActionType.ARCHIVE,
      },
      {
        message: msg`Label emails from LinkedIn as @[LinkedIn] and archive them`,
        outlookMessage: msg`Categorize emails from LinkedIn as @[LinkedIn] and archive them`,
        action: ActionType.ARCHIVE,
      },
      {
        message: msg`If someone applies for a job, label as @[New Application] and draft a reply acknowledging their application`,
        outlookMessage: msg`If someone applies for a job, categorize as @[New Application] and draft a reply acknowledging their application`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`Label emails containing resumes or CVs as @[Resume]`,
        outlookMessage: msg`Categorize emails containing resumes or CVs as @[Resume]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`If a candidate asks about application status, label as @[Status Update] and draft a reply asking for their position and date applied`,
        outlookMessage: msg`If a candidate asks about application status, categorize as @[Status Update] and draft a reply asking for their position and date applied`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`Label emails about interview scheduling as @[Interview Scheduling]`,
        outlookMessage: msg`Categorize emails about interview scheduling as @[Interview Scheduling]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`If someone accepts an interview invite, label as @[Interview Confirmed] and forward to calendar@company.com`,
        outlookMessage: msg`If someone accepts an interview invite, categorize as @[Interview Confirmed] and forward to calendar@company.com`,
        action: ActionType.FORWARD,
      },
      {
        message: msg`If someone declines a job offer, label as @[Offer Declined] and forward to hiring-updates@company.com`,
        outlookMessage: msg`If someone declines a job offer, categorize as @[Offer Declined] and forward to hiring-updates@company.com`,
        action: ActionType.FORWARD,
      },
      {
        message: msg`If someone accepts a job offer, label as @[Offer Accepted] and forward to onboarding@company.com`,
        outlookMessage: msg`If someone accepts a job offer, categorize as @[Offer Accepted] and forward to onboarding@company.com`,
        action: ActionType.FORWARD,
      },
      {
        message: msg`Label emails about salary negotiations as @[Compensation]`,
        outlookMessage: msg`Categorize emails about salary negotiations as @[Compensation]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`Label emails about reference checks as @[References]`,
        outlookMessage: msg`Categorize emails about reference checks as @[References]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`If someone asks about benefits, draft a reply with our benefits overview link: https://company.com/benefits`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`Label emails about background checks as @[Background Check]`,
        outlookMessage: msg`Categorize emails about background checks as @[Background Check]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`If an internal employee refers someone, label as @[Employee Referral]`,
        outlookMessage: msg`If an internal employee refers someone, categorize as @[Employee Referral]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`Label emails about recruitment events or job fairs as @[Recruiting Event]`,
        outlookMessage: msg`Categorize emails about recruitment events or job fairs as @[Recruiting Event]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`If someone withdraws their application, label as @[Withdrawn]`,
        outlookMessage: msg`If someone withdraws their application, categorize as @[Withdrawn]`,
        action: ActionType.LABEL,
      },
    ],
  },
  student: {
    emoji: "👩‍🎓",
    name: msg`Student`,
    prompts: [
      {
        message: msg`Label emails from professors and teaching assistants as @[School]`,
        outlookMessage: msg`Categorize emails from professors and teaching assistants as @[School]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`Label emails about assignments and homework as @[Assignment]`,
        outlookMessage: msg`Categorize emails about assignments and homework as @[Assignment]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`If someone sends class notes or study materials, label as @[Study Materials]`,
        outlookMessage: msg`If someone sends class notes or study materials, categorize as @[Study Materials]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`Label emails about internships as @[Internship] and forward to my personal email me@example.com`,
        outlookMessage: msg`Categorize emails about internships as @[Internship] and forward to my personal email me@example.com`,
        action: ActionType.FORWARD,
      },
      {
        message: msg`Label emails about exam schedules as @[Exam]`,
        outlookMessage: msg`Categorize emails about exam schedules as @[Exam]`,
        action: ActionType.LABEL,
      },
      {
        message: msg`Label emails about campus events as @[Event] and archive them`,
        outlookMessage: msg`Categorize emails about campus events as @[Event] and archive them`,
        action: ActionType.ARCHIVE,
      },
      {
        message: msg`If someone asks for class notes, draft a reply with our shared Google Drive folder link: https://drive.google.com/drive/u/0/folders/1234567890`,
        action: ActionType.DRAFT_EMAIL,
      },
      {
        message: msg`Label emails about tutoring opportunities as @[Tutoring] and draft a reply with that my rate is $70/hour or $40/hour for group tutoring`,
        outlookMessage: msg`Categorize emails about tutoring opportunities as @[Tutoring] and draft a reply with that my rate is $70/hour or $40/hour for group tutoring`,
        action: ActionType.DRAFT_EMAIL,
      },
    ],
  },
  reachout: {
    emoji: "💬",
    name: msg`Outreach`,
    prompts: [
      {
        message: msg`If someone replies to me that they're interested, label it @[Interested] and draft a reply with my calendar link: https://cal.com/example`,
        outlookMessage: msg`If someone replies to me that they're interested, categorize it @[Interested] and draft a reply with my calendar link: https://cal.com/example`,
        action: ActionType.DRAFT_EMAIL,
      },
    ],
  },
  other: {
    emoji: "🤖",
    name: msg`Other`,
    prompts: examplePromptsBase,
  },
} satisfies Record<
  string,
  { emoji: string; name: MessageDescriptor; prompts: ExamplePrompt[] }
>;

function formatPromptArray(promptArray: string[]): string {
  return `${promptArray.map((item) => `* ${item}`).join(".\n")}.`;
}

type ExamplePrompt = {
  message: MessageDescriptor;
  outlookMessage?: MessageDescriptor;
  action: ActionType | null;
};
