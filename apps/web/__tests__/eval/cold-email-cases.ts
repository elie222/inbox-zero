import { getEmail } from "@/__tests__/helpers";

type ColdEmailCase = {
  name: string;
  category: string;
  // "either" marks a case where both answers are defensible; it is recorded but not asserted.
  expected: boolean | "either";
  email: ReturnType<typeof getEmail>;
};

const date = new Date("2026-04-21T10:00:00Z");

// Fictional cases covering the common shapes of unsolicited mail a SaaS founder
// receives. Every person, company, product, and domain here is made up.
export const coldEmailCases: ColdEmailCase[] = [
  // Cold: selling something
  {
    name: "agency pitching engineering capacity",
    category: "vendor pitch",
    expected: true,
    email: getEmail({
      from: "Theo Marlow <theo@crestlinedev.example>",
      subject: "Extra hands for your roadmap",
      content: `Hi,

Is your team stuck maintaining integrations instead of shipping the features customers keep asking for? Crestline drops in a senior pod for a fixed weekly rate to clear the backlog while your core team stays on product.

Open to a 15 minute call this week?`,
      date,
    }),
  },
  {
    name: "sales tool pitch with a hook question",
    category: "vendor pitch",
    expected: true,
    email: getEmail({
      from: "Imogen Vale <imogen@swiftreply.example>",
      subject: "response time at Acme",
      content: `Hi,

When a lead replies to Acme, how long until someone gets back to them? Most founders tell me it depends who is free that day, and that gap quietly costs meetings.

Imogen
SwiftReply partnerships
PS. If this isn't relevant, reply "opt-out".`,
      date,
    }),
  },
  {
    name: "outbound automation pitch citing our buyers",
    category: "vendor pitch",
    expected: true,
    email: getEmail({
      from: "Callum Reyes <callum@meetingforge.example>",
      subject: "Acme - pipeline",
      content:
        "Figured this is worth a look if you sell to support leads. We launched an AI SDR that runs your outbound end to end: paste your site, it finds matching accounts, writes every email, handles follow-ups, and books the meetings. Thousands of agents live already. Happy to set one up for you at no cost.",
      date,
    }),
  },
  {
    name: "hiring software selling screening",
    category: "vendor pitch",
    expected: true,
    email: getEmail({
      from: "Nadia Okoro <nadia@shortlistly.example>",
      subject: "Screening candidates at Acme",
      content: `Hi,

I'm the founder of Shortlistly. With AI-written resumes everywhere, teams waste hours interviewing people who only look good on paper. We review every application, run a short voice screen, and hand you a shortlist of five.

Next time you open a role, want us to take the first pass?`,
      date,
    }),
  },
  {
    name: "churn tool pitch referencing our product",
    category: "vendor pitch",
    expected: true,
    email: getEmail({
      from: "Rory Castellan <rory@lastword.example>",
      subject: "After someone cancels Acme",
      content: `Hi,

I noticed Acme lets people cancel themselves. I'm building LastWord: it sends a single link after a cancellation and runs a short interview, with follow-ups when the reason is price. Works with Stripe out of the box.

Would you take a look? https://lastword.example`,
      date,
    }),
  },
  {
    name: "compliance vendor pitch",
    category: "vendor pitch",
    expected: true,
    email: getEmail({
      from: "Selin Aydin <selin@auditready.example>",
      subject: "SOC 2 for Acme",
      content: `Hi,

As Acme moves upmarket, procurement teams will ask for SOC 2. AuditReady automates the evidence collection and gets early-stage SaaS companies audit-ready in weeks.

Can I show you what it would look like for Acme?`,
      date,
    }),
  },
  {
    name: "ad agency pitch with a generic hook",
    category: "vendor pitch",
    expected: true,
    email: getEmail({
      from: "Bastien Roux <bastien@signalads.example>",
      subject: "Acme,",
      content: `Hello,

Founders tell us that standing out in a crowded category is brutal, even with a great product. Sound familiar? We grow SaaS trials with tightly targeted ads and audience analytics. One productivity tool doubled signups in a month with us.

Open to a quick chat about where Acme could grow?`,
      date,
    }),
  },
  {
    name: "novelty offline advertising pitch",
    category: "vendor pitch",
    expected: true,
    email: getEmail({
      from: "Kit Foley <kit@streetcrew.example>",
      subject: "Need a mascot?",
      content: `Hey,

Saw Acme is spending on ads. We put people in costumes outside your target customers' offices at lunchtime with your logo and a QR code. Cheaper than you'd think.

Interested?`,
      date,
    }),
  },
  {
    name: "explainer video production offer",
    category: "vendor pitch",
    expected: true,
    email: getEmail({
      from: "Priyanka Sethi <priyanka@framecraft.example>",
      subject: "A 60 second video for Acme",
      content: `Hi team,

I watched your product tour and think an animated explainer would convert more visitors. We've made videos for hundreds of software products. I'll write a free script and storyboard so you can judge for yourself.

Shall I send it over?`,
      date,
    }),
  },
  {
    name: "offshore engineering staffing",
    category: "vendor pitch",
    expected: true,
    email: getEmail({
      from: "Devan Pillai <devan@codebench.example>",
      subject: "Senior engineers for Acme",
      content: `Hi,

We place dedicated senior React and Node engineers with SaaS teams at $25 an hour, two week trial, no long-term contract. Can I send a few profiles?`,
      date,
    }),
  },
  // Cold: marketing, links, listings
  {
    name: "link exchange dressed as collaboration",
    category: "link building",
    expected: true,
    email: getEmail({
      from: "Harriet Voss <harriet@penfold.example>",
      subject: "Let's collaborate!",
      content: `Hi Acme team,

I'm on the marketing team at Penfold. We'd love to feature you in an upcoming roundup on a high-authority site with tens of thousands of monthly visits, including a permanent do-follow link. In return we'd appreciate a link back to Penfold from one of your blog posts.

Let me know if you're interested!`,
      date,
    }),
  },
  {
    name: "link building agency using a fake reply subject",
    category: "link building",
    expected: true,
    email: getEmail({
      from: "Oskar Lindqvist <oskar@rankbridge.example>",
      subject: "Re: Interested in a collaboration?",
      content: `Hi,

I'm reaching out on behalf of a client as their link building agency. Your article on shared inboxes covers how teams cut duplicate replies, and our client's platform is a natural fit for those readers.

Would you add a mention with a link? We can pay a fee or offer a reciprocal placement.`,
      date,
    }),
  },
  {
    name: "sponsored publication partnership",
    category: "link building",
    expected: true,
    email: getEmail({
      from: "Giulia Ferrante <giulia@brightpr.example>",
      subject: "Partnership opportunity for acme.example",
      content: `Hi! I'm Giulia, digital marketing manager at BrightPR. I'm reaching out because acme.example stood out to me. We want to spread the word about one of our partners, a well-known telecoms brand, and wondered if you'd collaborate on a publication on your website.

Would this be of interest?`,
      date,
    }),
  },
  {
    name: "directory listing upsell",
    category: "link building",
    expected: true,
    email: getEmail({
      from: "Listings <hello@stackpicker.example>",
      subject: "Put Acme on StackPicker - free to start",
      content: `Hi,

StackPicker is where buyers compare software. Claim Acme's listing for free, then upgrade to a featured spot seen by tens of thousands of visitors a month. Most tools see a traffic bump in the first week.

Claim your listing: https://stackpicker.example/claim`,
      date,
    }),
  },
  {
    // A pitch for their marketplace, but also a possible distribution channel.
    name: "resell marketplace vendor selection",
    category: "partnership ask",
    expected: "either",
    email: getEmail({
      from: "Dorian Petrov <dorian@bundlebox.example>",
      subject: "Resell Acme",
      content: `Hi,

I'm reaching out from BundleBox. We're building a marketplace where small businesses buy their software as bundled subscriptions. We're picking vendors for our sales bundle and Acme looks like a strong fit.

Could we set up 20 minutes to walk through the model?`,
      date,
    }),
  },
  {
    name: "vague venture studio networking",
    category: "partnership ask",
    expected: true,
    email: getEmail({
      from: "L. Ashworth <l@northgatestudio.example>",
      subject: "Curious about something",
      content: `Hello,

We're building out our network across the SaaS space and looking to connect with businesses where distribution and strategic partnerships could support growth. I came across Acme and wanted to reach out again. If you're interested, I can send a quick outline of what we have in mind.`,
      date,
    }),
  },
  {
    name: "affiliate program invitation",
    category: "partnership ask",
    expected: true,
    email: getEmail({
      from: "Mika <mika@mail.wordsmithai.example>",
      subject: "Affiliate collaboration for Acme",
      content: `Hi,

We noticed your audience and think our AI writing tool would be a great fit. Join our affiliate program and earn 30% recurring on every referral. We'll provide creatives and a dedicated landing page.

Sign up here to get your link.`,
      date,
    }),
  },
  {
    name: "closing the loop follow-up bump",
    category: "follow-up",
    expected: true,
    email: getEmail({
      from: "admin@paymentrescue.example",
      subject: "closing the loop - Acme",
      content: `Hi,

I've reached out a couple of times about recovering failed card payments at Acme and haven't heard back, so I'll assume the timing isn't right. If it becomes a priority, I'm around.

Best`,
      date,
    }),
  },
  {
    name: "one line quick question pitch",
    category: "vendor pitch",
    expected: true,
    email: getEmail({
      from: "Jonah Weiss <jonah@leadloop.example>",
      subject: "quick question",
      content:
        "Who handles lead gen at Acme? We book 20 qualified meetings a month for SaaS teams on a pay-per-meeting basis.",
      date,
    }),
  },
  {
    name: "spanish language agency pitch",
    category: "vendor pitch",
    expected: true,
    email: getEmail({
      from: "Marta Ibáñez <marta@agenciaimpulso.example>",
      subject: "Más clientes para Acme",
      content: `Hola,

Soy Marta, de Agencia Impulso. Ayudamos a empresas SaaS a conseguir más clientes con campañas de anuncios y contenido. Vi Acme y creo que podríamos duplicar sus registros en 60 días.

¿Tienes 15 minutos esta semana para una llamada?`,
      date,
    }),
  },
  // Cold: recruiting directed at the user
  {
    name: "unsolicited recruiter with a specific role",
    category: "recruiting",
    expected: true,
    email: getEmail({
      from: "Jordan Blake <talent@company.example>",
      subject: "Interview for Head of Sales at Company",
      content: `Hi,

I'm a Talent Partner at Company. I came across your profile and think you'd be a strong fit for our Head of Sales role. Would you be open to a 30 minute intro call this week? Happy to share the job description and compensation range ahead of time.`,
      date,
    }),
  },
  {
    name: "templated recruiter fishing",
    category: "recruiting",
    expected: true,
    email: getEmail({
      from: "Riley <riley@talentbridge.example>",
      subject: "Open to new opportunities?",
      content: `Hi,

I work with a number of fast-growing companies hiring across sales, marketing, and engineering. Are you open to hearing about new opportunities? If so, reply with your CV and I'll be in touch.

Riley`,
      date,
    }),
  },
  {
    name: "open source contributor offering to take an issue",
    category: "recruiting",
    expected: "either",
    email: getEmail({
      from: "Wren Adeyemi <wren.adeyemi@mail.example>",
      subject: "Acme - can I take an open issue off your plate?",
      content: `Hi,

I've been following the Acme repo and would love to contribute. A few open issues around calendar sync look like something I could handle this week. Would you be open to me picking one up? I'm trying to build a track record on real products.`,
      date,
    }),
  },
  {
    name: "vendor executive roundtable invitation",
    category: "event invite",
    expected: "either",
    email: getEmail({
      from: "Elliot Brandt <elliot@tidewater.example>",
      subject: "Founder roundtable on AI in sales, next Thursday",
      content: `Hi,

We're hosting a private roundtable for founders on applying AI to go-to-market, with a small group of operators. No cost to attend and seats are limited. Want me to hold one for you?`,
      date,
    }),
  },
  // Not cold: outreach that matters
  {
    name: "inbound prospect with a concrete need",
    category: "prospect",
    expected: false,
    email: getEmail({
      from: "Dana Whitfield <dana@northwind.example>",
      subject: "Pricing for 40 seats and SSO",
      content: `Hi,

I run operations at Northwind and we're evaluating tools to replace our current setup for a team of 40. Do you support SSO and what would pricing look like for that size? Happy to jump on a call this week if easier.

Thanks,
Dana`,
      date,
    }),
  },
  {
    name: "institution product inquiry",
    category: "prospect",
    expected: false,
    email: getEmail({
      from: "Ines Delacroix <ines@ridgeacademy.example>",
      subject: "Questions before a trial",
      content: `Hello,

Our school is looking for an email assistant for about 15 staff. Before we trial it, can you confirm whether data stays in our Google Workspace tenant and whether you offer invoicing rather than card payment?

Thank you,
Ines`,
      date,
    }),
  },
  {
    name: "investor asking to learn more",
    category: "investor",
    expected: false,
    email: getEmail({
      from: "Hannah Liu <hannah@fundco.example>",
      subject: "Intro to our platform team",
      content: `Hi,

I'm a partner at FundCo. We've been tracking the email productivity space and Acme keeps coming up. Would you be open to a call to walk us through what you're building and where you are on fundraising? No agenda beyond learning more.`,
      date,
    }),
  },
  {
    name: "warm introduction",
    category: "intro",
    expected: false,
    email: getEmail({
      from: "claire@example.com",
      to: "alice@example.com, bob@example.com",
      subject: "Intro: Alice <> Bob",
      content: `Hi Alice and Bob,

Good speaking with both of you earlier. Alice is building workflow software for operations teams. Bob leads a firm that works with companies in that space. Thought it would be useful to connect you two directly.

Best,
Claire`,
      date,
    }),
  },
  {
    name: "conference follow-up",
    category: "intro",
    expected: false,
    email: getEmail({
      from: "Priya Nair <priya@meshworks.example>",
      subject: "Great meeting you at the conference",
      content: `Hi,

Really enjoyed our chat by the coffee stand yesterday about onboarding flows. You mentioned you were looking at ways to reduce setup drop-off; I'd be glad to share what worked for us. Free for a call next week?`,
      date,
    }),
  },
  {
    name: "inbound sponsorship offer",
    category: "inbound money",
    expected: false,
    email: getEmail({
      from: "Marcus Abel <marcus@orbitfund.example>",
      subject: "Sponsoring your newsletter",
      content: `Hi,

We'd like to sponsor your newsletter for the next quarter. What placements do you offer and what are the rates? Budget is approved and we can start this month.`,
      date,
    }),
  },
  {
    name: "job applicant for an open role",
    category: "applicant",
    expected: false,
    email: getEmail({
      from: "Maya Chen <maya.chen@mail.example>",
      subject: "Application: Founding Engineer",
      content: `Hi,

I'm applying for the Founding Engineer role posted on your careers page. I've spent four years on email infrastructure at a B2B startup and have shipped Gmail and Outlook integrations. Resume attached. Happy to do a take-home or pair on a real issue.`,
      date,
    }),
  },
  {
    name: "partner with concrete integration proposal",
    category: "partnership",
    expected: false,
    email: getEmail({
      from: "Tomas Lindgren <tomas@slotly.example>",
      subject: "Acme integration - shared customers asking",
      content: `Hi,

We have around 40 customers who use both our scheduling tool and Acme, and several have asked for booking links to show up in your reply drafts. We already have a public API and can build the integration on our side; we'd just need an OAuth client. Would you be open to a 20 minute call to scope it?`,
      date,
    }),
  },
  {
    name: "journalist request for comment",
    category: "press",
    expected: false,
    email: getEmail({
      from: "Rosa Almeida <rosa@techdaily.example>",
      subject: "Comment request: AI email assistants and privacy",
      content: `Hi,

I'm a reporter at TechDaily working on a piece about how AI email assistants handle user data, running Thursday. Could you answer two questions on how Acme stores email content? A short written reply by Wednesday is fine.`,
      date,
    }),
  },
  {
    name: "user bug report from unknown sender",
    category: "customer",
    expected: false,
    email: getEmail({
      from: "Leon Fischer <leon.fischer@mail.example>",
      subject: "Acme support request",
      content: `Hi,

Since yesterday my rules stopped running on new mail. I reconnected my Google account twice. Account email is this one. Can you take a look?`,
      date,
    }),
  },
  {
    name: "customer refund request",
    category: "customer",
    expected: false,
    email: getEmail({
      from: "Erin Kowalski <erin.kowalski@mail.example>",
      subject: "Refund",
      content:
        "I was charged for the annual plan today but I meant to cancel last week. Please refund and cancel my subscription.",
      date,
    }),
  },
  {
    name: "portuguese inbound prospect",
    category: "prospect",
    expected: false,
    email: getEmail({
      from: "Rafael Moreira <rafael@fabricasul.example>",
      subject: "Dúvida sobre planos para equipe",
      content: `Olá,

Testei o Acme na minha conta pessoal e gostei. Quero colocar minha equipe de 12 pessoas. Vocês têm plano por equipe e suporte em português? Podemos conversar esta semana?

Obrigado,
Rafael`,
      date,
    }),
  },
  {
    name: "existing vendor account manager check-in",
    category: "vendor",
    expected: "either",
    email: getEmail({
      from: "Grace Holloway <grace@cloudvendor.example>",
      subject: "Re: Your new account manager",
      content: `Hi,

I've taken over as your account manager for the platform you host on. Wanted to introduce myself and see if you have any questions about your current plan or the credits program before renewal.`,
      date,
    }),
  },
  {
    name: "reply to our own outbound campaign",
    category: "customer",
    expected: false,
    email: getEmail({
      from: "Felix Andersson <felix@brightlane.example>",
      subject: "Re: One trick that changed how I handle email",
      content: `Thanks for this. I tried the setup you described but the labels don't show up in my mobile app. Is that expected or did I miss a step?`,
      date,
    }),
  },
  {
    name: "existing user asking to change plan",
    category: "customer",
    expected: false,
    email: getEmail({
      from: "Casey Tran <casey@tranconsulting.example>",
      subject: "Lower plan",
      content: `Hi, I'm on the top tier but only use one inbox now. Can you move me down to the basic plan from next month? Happy to keep paying annually.`,
      date,
    }),
  },
  {
    name: "german language support question",
    category: "customer",
    expected: false,
    email: getEmail({
      from: "Jonas Keller <jonas.keller@mail.example>",
      subject: "Frage zur Kalenderverbindung",
      content: `Hallo,

seit dem Update wird mein Kalender nicht mehr synchronisiert. Ich habe die Verbindung zweimal neu hergestellt. Können Sie das bitte prüfen?

Viele Grüße
Jonas`,
      date,
    }),
  },
  {
    name: "security researcher reporting a vulnerability",
    category: "inbound report",
    expected: false,
    email: getEmail({
      from: "Amara Osei <amara@mail.example>",
      subject: "Possible open redirect on acme.example",
      content: `Hi,

I found what looks like an open redirect on your login callback that could be used for phishing. I haven't shared it anywhere. Where should I send the details, and do you have a disclosure policy?`,
      date,
    }),
  },
  {
    name: "podcast host inviting the founder as a guest",
    category: "media",
    expected: false,
    email: getEmail({
      from: "Ravi Nair <ravi@founderhours.example>",
      subject: "Guest spot on Founder Hours",
      content: `Hi,

I host Founder Hours, a weekly interview show for early-stage B2B founders. Your approach to email automation came up in a listener survey, and I'd love to have you on for 40 minutes. We record remotely and publish within two weeks. Any interest?`,
      date,
    }),
  },
  {
    name: "conference organizer offering a speaking slot",
    category: "media",
    expected: false,
    email: getEmail({
      from: "Helena Marsh <helena@productsummit.example>",
      subject: "Speaking at Product Summit in October",
      content: `Hi,

I'm programming the productivity track at Product Summit this October. We'd like to offer you a 25 minute slot on building AI features that users trust. Travel and hotel are covered. Could you let me know by the end of the month?`,
      date,
    }),
  },
  {
    // A reseller or referral ask with a demand signal; models split on it.
    name: "enterprise business development wanting to connect",
    category: "partnership",
    expected: "either",
    email: getEmail({
      from: "Amit Rao <amit.rao@meridiantech.example>",
      subject: "Acme <> Meridian",
      content: `Hi,

I lead partnerships for Meridian's workplace software group. Several of our enterprise customers have asked about email automation for their support teams and your name came up twice. Would you be open to a call to explore whether a reseller or referral arrangement makes sense?`,
      date,
    }),
  },
  {
    name: "acquisition interest",
    category: "inbound money",
    expected: false,
    email: getEmail({
      from: "Victoria Lam <victoria@harborgroup.example>",
      subject: "Confidential: interest in Acme",
      content: `Hi,

I'm on the corporate development team at Harbor Group. We're looking at the email productivity space and Acme is on our shortlist. If you're open to it, I'd like to set up an introductory conversation with our head of product. Everything stays confidential.`,
      date,
    }),
  },
  {
    name: "teammate of a customer asking to be added",
    category: "customer",
    expected: false,
    email: getEmail({
      from: "Owen Hart <owen@lumenagency.example>",
      subject: "Adding me to our Acme workspace",
      content:
        "Hi, my colleague Sofia set up Acme for our agency last week and said I should ask you to add me to the same account rather than start a new trial. My email is this one. Thanks!",
      date,
    }),
  },
  {
    name: "candidate following up after an interview",
    category: "applicant",
    expected: false,
    email: getEmail({
      from: "Lena Novak <lena.novak@mail.example>",
      subject: "Thank you for yesterday",
      content: `Hi,

Thank you for taking the time to interview me for the support engineer role yesterday. I enjoyed the conversation about the Outlook sync issues. If it's useful I can send over the debugging write-up I mentioned.

Best,
Lena`,
      date,
    }),
  },
  {
    name: "user asking permission to reuse content",
    category: "inbound request",
    expected: false,
    email: getEmail({
      from: "Ben Okafor <ben@teachingemail.example>",
      subject: "Using your inbox zero guide in a course",
      content: `Hi,

I teach a small online course on email habits and would like to include two diagrams from your blog post on inbox triage, with credit and a link. Is that okay with you?`,
      date,
    }),
  },
  // Not cold: automated and bulk mail belongs to other rules
  {
    name: "marketing newsletter with unsubscribe",
    category: "automated",
    expected: false,
    email: getEmail({
      from: "Updates <updates@analytics.example>",
      subject: "April digest: new dashboards and templates",
      listUnsubscribe: "<https://analytics.example/unsubscribe>",
      content: `This month's digest covers the new executive dashboard, three reporting templates, and workflow tips from the product team. Start a 14-day Pro trial from your workspace.`,
      date,
    }),
  },
  {
    name: "community platform notification",
    category: "automated",
    expected: false,
    email: getEmail({
      from: "Community <no-reply@community.example>",
      subject: "New event: Office hours for new members",
      content: `A new event was posted in the community: Office hours, live on Thursday. Add it to your calendar. You're receiving this because you're a member of the community.`,
      date,
    }),
  },
  {
    name: "calendar invitation",
    category: "automated",
    expected: false,
    email: getEmail({
      from: "Noah Park <noah@mail.example>",
      subject: "Invitation: Noah / Acme @ Tue Apr 28, 2026 4pm - 4:25pm",
      content:
        "You have been invited to the following event. Noah / Acme. When: Tue Apr 28, 2026 4pm - 4:25pm. Joining info: video call link. Yes / No / Maybe.",
      date,
    }),
  },
  {
    name: "customer forwarding a failed payment notice",
    category: "customer",
    expected: false,
    email: getEmail({
      from: "Sofia Brennan <sofia@lumenagency.example>",
      subject: "Fwd: Payment to Acme was unsuccessful again",
      content:
        "Forwarding this. My card is fine and this keeps failing on your side. Can you sort it out or tell me how to pay another way?",
      date,
    }),
  },
];
