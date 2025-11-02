import { Card } from "@/app/(landing)/new-landing/Card";
import { CardWrapper } from "@/app/(landing)/new-landing/CardWrapper";
import { Section } from "@/app/(landing)/new-landing/Section";
import { Paragraph } from "@/app/(landing)/new-landing/Typography";

// TODO: add links
const faqs = [
  {
    question: "Which email providers does Inbox Zero support?",
    answer:
      "We support Gmail, Google Workspace, and Microsoft Outlook email accounts.",
  },
  {
    question: "How can I request a feature?",
    answer:
      "Email us or post an issue on GitHub. We're happy to hear how we can improve your email experience.",
  },
  {
    question: "Will Inbox Zero replace my current email client?",
    answer:
      "No! Inbox Zero isn't an email client. It's used alongside your existing email client. You use Google or Outlook as normal.",
  },
  {
    question: "Is the code open-source?",
    answer:
      "Yes! You can see the entire source code for the inbox zero app in our GitHub repo.",
  },
  {
    question: "Do you offer refunds?",
    answer:
      "Yes, if you don't think we provided you with value send us an email within 14 days of upgrading and we'll refund you.",
  },
  {
    question: "Can I try Inbox Zero for free?",
    answer:
      "Absolutely, we have a 7 day free trial on all of our plans so you can try it out right away, no credit card needed!",
  },
];

export function FAQs() {
  return (
    <Section title="Frequently asked questions">
      <CardWrapper>
        <div className="grid grid-cols-2 gap-6">
          {faqs.map((faq) => (
            <Card variant="extra-rounding" className="gap-4" key={faq.question}>
              <p className="font-semibold leading-none tracking-tight">
                {faq.question}
              </p>
              <Paragraph>{faq.answer}</Paragraph>
            </Card>
          ))}
        </div>
      </CardWrapper>
    </Section>
  );
}
