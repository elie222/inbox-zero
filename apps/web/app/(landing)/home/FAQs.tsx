import { Anchor } from "@/components/new-landing/common/Anchor";
import { Card, CardContent } from "@/components/new-landing/common/Card";
import { CardWrapper } from "@/components/new-landing/common/CardWrapper";
import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import {
  Paragraph,
  SectionHeading,
} from "@/components/new-landing/common/Typography";
import { env } from "@/env";
import { BRAND_NAME } from "@/utils/branding";

const faqs: {
  question: string;
  answer: React.ReactNode;
  answerText?: string;
}[] = [
  {
    question: `Which email providers does ${BRAND_NAME} support?`,
    answer:
      "We support Gmail, Google Workspace, and Microsoft Outlook email accounts.",
  },
  {
    question: "How can I request a feature?",
    answer: (
      <span>
        Email us or post an issue on{" "}
        <Anchor href="/github" newTab>
          GitHub
        </Anchor>
        . We're happy to hear how we can improve your email experience.
      </span>
    ),
    answerText:
      "Email us or post an issue on GitHub. We're happy to hear how we can improve your email experience.",
  },
  {
    question: `Will ${BRAND_NAME} replace my current email client?`,
    answer: `No! ${BRAND_NAME} isn't an email client. It's used alongside your existing email client. You use Google or Outlook as normal.`,
  },
  {
    question: "Is there a mobile app?",
    answer: (
      <span>
        Yes, we have iOS and Android apps so you can triage your inbox and
        manage your assistant on the go. Learn more on the{" "}
        <Anchor href="/mobile-app">mobile app</Anchor> page.
      </span>
    ),
    answerText:
      "Yes, we have iOS and Android apps so you can triage your inbox and manage your assistant on the go. Learn more on the mobile app page.",
  },
  {
    question: "Is the code open-source?",
    answer: (
      <span>
        Yes! You can see the entire source code for the inbox zero app in our{" "}
        <Anchor href="/github" newTab>
          GitHub repo
        </Anchor>
        .
      </span>
    ),
    answerText:
      "Yes! You can see the entire source code for the inbox zero app in our GitHub repo.",
  },
  {
    question: "Do you offer refunds?",
    answer: (
      <span>
        Yes, if you don't think we provided you with value send us an{" "}
        <Anchor href={`mailto:${env.NEXT_PUBLIC_SUPPORT_EMAIL}`}>email</Anchor>{" "}
        within 14 days of upgrading and we'll refund you.
      </span>
    ),
    answerText:
      "Yes, if you don't think we provided you with value send us an email within 14 days of upgrading and we'll refund you.",
  },
  {
    question: `Can I try ${BRAND_NAME} for free?`,
    answer:
      "Absolutely! All plans include a 7-day free trial. A credit card is required to start your trial, but you won't be charged until the trial ends. Cancel anytime during the trial to avoid being charged.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs
    .map((faq) => {
      const text = typeof faq.answer === "string" ? faq.answer : faq.answerText;
      if (!text) return null;
      return {
        "@type": "Question" as const,
        name: faq.question,
        acceptedAnswer: { "@type": "Answer" as const, text },
      };
    })
    .filter(Boolean),
};

export function FAQs() {
  return (
    <Section>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON.stringify on controlled object is safe
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <SectionHeading>Frequently asked questions</SectionHeading>
      <SectionContent>
        <CardWrapper>
          <dl className="grid md:grid-cols-2 gap-6">
            {faqs.map((faq) => (
              <Card
                variant="extra-rounding"
                className="gap-4"
                key={faq.question}
              >
                <CardContent>
                  <Paragraph
                    as="dt"
                    color="gray-900"
                    className="font-semibold tracking-tight mb-4"
                  >
                    {faq.question}
                  </Paragraph>
                  <dd>
                    <Paragraph>{faq.answer}</Paragraph>
                  </dd>
                </CardContent>
              </Card>
            ))}
          </dl>
        </CardWrapper>
      </SectionContent>
    </Section>
  );
}
