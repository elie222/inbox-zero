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

const pricingFaqs = [
  {
    question: "Can I try Inbox Zero for free?",
    answer:
      "Yes! All plans include a 7-day free trial.",
  },
  {
    question: "Can I switch between plans?",
    answer:
      "Yes, you can upgrade or downgrade at any time. Changes take effect immediately and billing is prorated.",
  },
  {
    question: "What payment methods do you accept?",
    answer: "We accept all major credit cards through Stripe.",
  },
  {
    question: "Do you offer annual discounts?",
    answer: "Yes! Save up to 20% by choosing annual billing on any plan.",
  },
  {
    question:
      "Do you offer discounts for students, nonprofits, or open-source projects?",
    answer: (
      <span>
        Yes! Send us an{" "}
        <Anchor href={`mailto:${env.NEXT_PUBLIC_SUPPORT_EMAIL}`}>email</Anchor>{" "}
        and we&apos;ll set up a discounted plan for you.
      </span>
    ),
  },
  {
    question: "What happens if I cancel?",
    answer:
      "You can cancel anytime. Your subscription will remain active until the end of the billing period.",
  },
  {
    question: "Do you offer refunds?",
    answer: (
      <span>
        Yes, if you don&apos;t think we provided you with value send us an{" "}
        <Anchor href={`mailto:${env.NEXT_PUBLIC_SUPPORT_EMAIL}`}>email</Anchor>{" "}
        within 14 days of upgrading and we&apos;ll refund you.
      </span>
    ),
  },
  {
    question: "Need a custom plan for your enterprise?",
    answer: (
      <span>
        <Anchor href="https://go.getinboxzero.com/sales" newTab>
          Contact our sales team
        </Anchor>{" "}
        for custom pricing, SSO, on-premise deployment, and dedicated support.
      </span>
    ),
  },
];

export function PricingFAQs() {
  return (
    <Section>
      <SectionHeading>Pricing FAQ</SectionHeading>
      <SectionContent>
        <CardWrapper>
          <dl className="grid md:grid-cols-2 gap-6">
            {pricingFaqs.map((faq) => (
              <Card
                variant="extra-rounding"
                className="gap-4"
                key={typeof faq.question === "string" ? faq.question : ""}
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
