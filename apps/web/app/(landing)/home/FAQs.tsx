import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
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
  question: MessageDescriptor;
  answer?: React.ReactNode;
  answerText: MessageDescriptor;
}[] = [
  {
    question: msg`Which email providers does ${BRAND_NAME} support?`,
    answerText: msg`We support Gmail, Google Workspace, and Microsoft Outlook email accounts.`,
  },
  {
    question: msg`How can I request a feature?`,
    answer: (
      <span>
        <Trans>
          Email us or post an issue on{" "}
          <Anchor href="/github" newTab>
            GitHub
          </Anchor>
          . We're happy to hear how we can improve your email experience.
        </Trans>
      </span>
    ),
    answerText: msg`Email us or post an issue on GitHub. We're happy to hear how we can improve your email experience.`,
  },
  {
    question: msg`Will ${BRAND_NAME} replace my current email app?`,
    answer: (
      <span>
        <Trans>
          It doesn't have to. {BRAND_NAME} works inside Gmail and Outlook, so
          you can keep using them as normal while the assistant works in the
          background. {BRAND_NAME} also has its own{" "}
          <Anchor href="/email-client">email app</Anchor> for the web, desktop,
          and iPhone if you'd like to use it.
        </Trans>
      </span>
    ),
    answerText: msg`It doesn't have to. ${BRAND_NAME} works inside Gmail and Outlook, so you can keep using them as normal while the assistant works in the background. ${BRAND_NAME} also has its own email app for the web, desktop, and iPhone if you'd like to use it.`,
  },
  {
    question: msg`Is there a mobile app?`,
    answer: (
      <span>
        <Trans>
          Yes. Our native iPhone app lets you triage your inbox and manage your
          assistant on the go. We also have an Android app, which is due for an
          update. Learn more on the{" "}
          <Anchor href="/mobile-app">mobile app</Anchor> page.
        </Trans>
      </span>
    ),
    answerText: msg`Yes. Our native iPhone app lets you triage your inbox and manage your assistant on the go. We also have an Android app, which is due for an update. Learn more on the mobile app page.`,
  },
  {
    question: msg`Is the code open-source?`,
    answer: (
      <span>
        <Trans>
          Yes! The AI assistant, the web app, and the desktop email app are open
          source in our{" "}
          <Anchor href="/github" newTab>
            GitHub repo
          </Anchor>
          . The iPhone app isn't open source yet, but we plan to open it.
        </Trans>
      </span>
    ),
    answerText: msg`Yes! The AI assistant, the web app, and the desktop email app are open source in our GitHub repo. The iPhone app isn't open source yet, but we plan to open it.`,
  },
  {
    question: msg`Do you offer refunds?`,
    answer: (
      <span>
        <Trans>
          Yes, if you don't think we provided you with value send us an{" "}
          <Anchor href={`mailto:${env.NEXT_PUBLIC_SUPPORT_EMAIL}`}>
            email
          </Anchor>{" "}
          within 14 days of upgrading and we'll refund you.
        </Trans>
      </span>
    ),
    answerText: msg`Yes, if you don't think we provided you with value send us an email within 14 days of upgrading and we'll refund you.`,
  },
  {
    question: msg`Can I try ${BRAND_NAME} for free?`,
    answerText: msg`Yes. The email app is free to use. The AI assistant plans include a 7-day free trial. A credit card is required to start your trial, but you won't be charged until the trial ends. Cancel anytime during the trial to avoid being charged.`,
  },
];

export function FAQs() {
  const { i18n } = useLingui();
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: i18n._(faq.question),
      acceptedAnswer: { "@type": "Answer", text: i18n._(faq.answerText) },
    })),
  };

  return (
    <Section>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON.stringify on controlled object is safe
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <SectionHeading>
        <Trans>Frequently asked questions</Trans>
      </SectionHeading>
      <SectionContent>
        <CardWrapper>
          <dl className="grid md:grid-cols-2 gap-6">
            {faqs.map((faq) => (
              <Card
                variant="extra-rounding"
                className="gap-4"
                key={faq.question.id}
              >
                <CardContent>
                  <Paragraph
                    as="dt"
                    color="gray-900"
                    className="font-semibold tracking-tight mb-4"
                  >
                    {i18n._(faq.question)}
                  </Paragraph>
                  <dd>
                    <Paragraph>
                      {faq.answer ?? i18n._(faq.answerText)}
                    </Paragraph>
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
