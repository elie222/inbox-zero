import { Badge, type BadgeVariant } from "@/app/(landing)/new-landing/Badge";
import { Button } from "@/app/(landing)/new-landing/Button";
import { Card } from "@/app/(landing)/new-landing/Card";
import { CardWrapper } from "@/app/(landing)/new-landing/CardWrapper";
import { Section } from "@/app/(landing)/new-landing/Section";
import { Briefcase } from "@/app/(landing)/new-landing/Briefcase";
import { Sparkle } from "@/app/(landing)/new-landing/Sparkle";
import { Zap } from "@/app/(landing)/new-landing/Zap";
import { Check } from "@/app/(landing)/new-landing/Check";
import { cn } from "@/utils";
import type { ButtonVariant } from "./Button";
import { Paragraph } from "@/app/(landing)/new-landing/Typography";

type PricingPlan = {
  title: string;
  description: string;
  icon: React.ReactNode;
  badges?: { message: string; variant?: BadgeVariant }[];
  button: {
    content: string;
    variant?: ButtonVariant;
  };
  price: {
    amount: string;
    subtext?: string;
  };
  features: {
    title?: string;
    checkVariant?: "primary" | "secondary";
    items: string[];
  };
};

const plans: PricingPlan[] = [
  {
    title: "Starter",
    description:
      "For individuals and entrepreneurs looking to buy back their time.",
    icon: <Briefcase />,
    badges: [
      { message: "Save 10%" },
      { message: "Popular", variant: "success" },
    ],
    button: {
      content: "Try free for 7 days",
    },
    price: {
      amount: "$18",
      subtext: "/user /month (billed annually)",
    },
    features: {
      items: [
        "Sorts and labels every email",
        "Drafts replies in your voice",
        "Blocks cold emails",
        "Bulk unsubscribe",
        "Email analytics",
      ],
    },
  },
  {
    title: "Professional",
    description:
      "For teams and growing businesses handling high email volumes.",
    icon: <Zap />,
    badges: [{ message: "Save 16%" }],
    button: {
      variant: "secondary-two",
      content: "Try free for 7 days",
    },
    price: {
      amount: "$42",
      subtext: "/user /month (billed annually)",
    },
    features: {
      title: "Everything in Starter, plus:",
      checkVariant: "secondary",
      items: [
        "Unlimited knowledge base",
        "Team-wide analytics",
        "Priority support",
        "Dedicated onboarding manager",
      ],
    },
  },
  {
    title: "Enterprise",
    description:
      "For organizations with enterprise-grade security requirements.",
    icon: <Sparkle />,
    button: {
      variant: "secondary-two",
      content: "Speak to sales",
    },
    price: {
      amount: "Contact us",
    },
    features: {
      title: "Everything in Professional, plus:",
      checkVariant: "secondary",
      items: [
        "SSO Login",
        "On-premise deployment (optional)",
        "Advanced security & SLA",
        "Dedicated manager & training",
      ],
    },
  },
];

export function Pricing() {
  return (
    <Section
      title="Try for free, affordable paid plans"
      subtitle="No hidden fees. Cancel anytime."
    >
      <div className="flex gap-6">
        {plans.map(
          ({ title, description, icon, badges, button, features, price }) => (
            <CardWrapper key={title}>
              <Card noPadding className="h-full">
                <div className="p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    {icon}
                    <div className="h-0 flex items-center gap-1.5">
                      {badges?.map(({ message, variant }) => (
                        <Badge key={message} variant={variant}>
                          {message}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h2 className="text-xl font-bold">{title}</h2>
                    <Paragraph>{description}</Paragraph>
                  </div>
                  <div className="flex gap-2 items-end">
                    <h1 className="text-4xl font-bold">{price.amount}</h1>
                    {price.subtext ? (
                      <Paragraph
                        variant="light"
                        className="text-xs -translate-y-1"
                      >
                        {price.subtext}
                      </Paragraph>
                    ) : null}
                  </div>
                  <Button className="w-full" variant={button.variant}>
                    {button.content}
                  </Button>
                </div>
                <div className="p-6 border-t border-[#E7E7E780]">
                  {features.title ? (
                    <Paragraph className=" font-medium text-sm mb-4">
                      {features.title}
                    </Paragraph>
                  ) : null}
                  <ul className="space-y-3">
                    {features.items.map((item) => (
                      <li
                        className="text-gray-500 flex items-center gap-2 text-sm"
                        key={item}
                      >
                        <div
                          className={cn(
                            features.checkVariant === "secondary"
                              ? "text-gray-400"
                              : "text-blue-500",
                          )}
                        >
                          <Check />
                        </div>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            </CardWrapper>
          ),
        )}
      </div>
    </Section>
  );
}
