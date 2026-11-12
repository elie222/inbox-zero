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

const pricingFaqs: {
  question: MessageDescriptor;
  answer?: React.ReactNode;
  answerText: MessageDescriptor;
}[] = [
  {
    question: msg`Can I try ${BRAND_NAME} for free?`,
    answerText: msg`Yes. The email app is free to use. The AI plans include a 7-day free trial.`,
  },
  {
    question: msg`Can I switch between plans?`,
    answerText: msg`Yes, you can upgrade or downgrade at any time. Changes take effect immediately and billing is prorated.`,
  },
  {
    question: msg`What payment methods do you accept?`,
    answerText: msg`We accept all major credit cards through Stripe.`,
  },
  {
    question: msg`Do you offer annual discounts?`,
    answerText: msg`Yes! Save up to 20% by choosing annual billing on any plan.`,
  },
  {
    question: msg`Do you offer discounts for students, nonprofits, or open-source projects?`,
    answer: (
      <span>
        <Trans>
          Yes! Send us an{" "}
          <Anchor href={`mailto:${env.NEXT_PUBLIC_SUPPORT_EMAIL}`}>
            email
          </Anchor>{" "}
          and we'll set up a discounted plan for you.
        </Trans>
      </span>
    ),
    answerText: msg`Yes! Send us an email and we'll set up a discounted plan for you.`,
  },
  {
    question: msg`What happens if I cancel?`,
    answerText: msg`You can cancel anytime. Your subscription will remain active until the end of the billing period.`,
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
    question: msg`Need a custom plan for your enterprise?`,
    answer: (
      <span>
        <Trans>
          <Anchor href="https://www.getinboxzero.com/sales">
            Contact our sales team
          </Anchor>{" "}
          for custom pricing, SSO, SCIM, on-premise deployment, and dedicated
          support.
        </Trans>
      </span>
    ),
    answerText: msg`Contact our sales team for custom pricing, SSO, SCIM, on-premise deployment, and dedicated support.`,
  },
];

export function PricingFAQs() {
  const { i18n } = useLingui();
  const pricingFaqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: pricingFaqs.map((faq) => ({
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingFaqJsonLd) }}
      />
      <SectionHeading>
        <Trans>Pricing FAQ</Trans>
      </SectionHeading>
      <SectionContent>
        <CardWrapper>
          <dl className="grid md:grid-cols-2 gap-6">
            {pricingFaqs.map((faq) => (
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
