import { cn } from "@/utils";
import { Briefcase } from "@/components/new-landing/icons/Briefcase";
import { Sparkle } from "@/components/new-landing/icons/Sparkle";
import { Zap } from "@/components/new-landing/icons/Zap";
import { Check } from "@/components/new-landing/icons/Check";
import { CardWrapper } from "@/components/new-landing/common/CardWrapper";
import { Section } from "@/components/new-landing/common/Section";
import type { ButtonVariant } from "@/components/new-landing/common/Button";
import { Button } from "@/components/new-landing/common/Button";
import { Card } from "@/components/new-landing/common/Card";
import { Heading, Paragraph } from "@/components/new-landing/common/Typography";
import {
  Badge,
  type BadgeVariant,
} from "@/components/new-landing/common/Badge";
import { Chat } from "@/components/new-landing/icons/Chat";

type PricingPlan = {
  title: string;
  description: string;
  icon: React.ReactNode;
  badges?: { message: string; variant?: BadgeVariant }[];
  button: {
    content: string;
    variant?: ButtonVariant;
    icon?: React.ReactNode;
  };
  price: {
    amount?: string;
    message?: string;
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
      icon: <Chat />,
    },
    price: {
      message: "Contact us",
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                    <Paragraph className="text-sm">{description}</Paragraph>
                  </div>
                  <div className="flex gap-2 items-end">
                    <Heading
                      className={cn(
                        "text-4xl",
                        price.amount ? "font-medium" : "",
                      )}
                    >
                      {price.amount || price.message}
                    </Heading>
                    {price.subtext ? (
                      <Paragraph
                        variant="light"
                        className="text-xs -translate-y-1"
                      >
                        {price.subtext}
                      </Paragraph>
                    ) : null}
                  </div>
                  <Button auto variant={button.variant} icon={button.icon}>
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
