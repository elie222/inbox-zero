"use client";

import { Briefcase } from "@/components/new-landing/icons/Briefcase";
import { Sparkle } from "@/components/new-landing/icons/Sparkle";
import { Zap } from "@/components/new-landing/icons/Zap";
import { Check } from "@/components/new-landing/icons/Check";
import { CardWrapper } from "@/components/new-landing/common/CardWrapper";
import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import {
  Button,
  type ButtonVariant,
} from "@/components/new-landing/common/Button";
import { Card, CardContent } from "@/components/new-landing/common/Card";
import {
  Paragraph,
  SectionHeading,
  SectionSubtitle,
  Subheading,
} from "@/components/new-landing/common/Typography";
import {
  Badge,
  type BadgeVariant,
} from "@/components/new-landing/common/Badge";
import { Chat } from "@/components/new-landing/icons/Chat";
import { useState } from "react";
import { Label, Radio, RadioGroup } from "@headlessui/react";
import { cx } from "class-variance-authority";

type PricingPlan = {
  title: string;
  description: string;
  icon: React.ReactNode;
  badges?: { message: string; variant?: BadgeVariant; annualOnly?: boolean }[];
  button: {
    content: string;
    variant?: ButtonVariant;
    icon?: React.ReactNode;
  };
  prices?: {
    month: number;
    annual: number;
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
      { message: "Save 10%", annualOnly: true },
      { message: "Popular", variant: "green" },
    ],
    button: {
      content: "Try free for 7 days",
    },
    prices: { month: 20, annual: 18 },
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
    badges: [{ message: "Save 16%", annualOnly: true }],
    button: {
      variant: "secondary-two",
      content: "Try free for 7 days",
    },
    prices: { month: 50, annual: 42 },
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

const frequencies = ["annually", "monthly"];

export function Pricing() {
  const [frequency, setFrequency] = useState(frequencies[0]);

  return (
    <Section>
      <SectionHeading>Try for free, affordable paid plans</SectionHeading>
      <SectionSubtitle>No hidden fees. Cancel anytime.</SectionSubtitle>
      <SectionContent className="mt-6 flex flex-col items-center justify-center">
        <RadioGroup
          value={frequency}
          onChange={setFrequency}
          className="w-fit rounded-full p-1.5 text-xs font-semibold leading-5 ring-1 ring-inset ring-gray-200 mb-6 shadow-[0_0_7px_0_rgba(0,0,0,0.0.07)]"
        >
          <Label className="sr-only">Payment frequency</Label>
          {frequencies.map((value) => (
            <Radio
              key={value}
              value={value}
              className={({ checked }) =>
                cx(
                  checked ? "bg-black text-white" : "text-gray-500",
                  "cursor-pointer rounded-full px-6 py-1",
                )
              }
            >
              <span>{value.charAt(0).toUpperCase() + value.slice(1)}</span>
            </Radio>
          ))}
        </RadioGroup>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <CardWrapper key={plan.title}>
              <PricingCard plan={plan} isAnnual={frequency === "annually"} />
            </CardWrapper>
          ))}
        </div>
      </SectionContent>
    </Section>
  );
}

interface PricingCardProps {
  plan: PricingPlan;
  isAnnual: boolean;
}

export function PricingCard({ plan, isAnnual }: PricingCardProps) {
  const { title, description, icon, badges, prices, features, button } = plan;
  const price = isAnnual ? prices?.annual : prices?.month;

  return (
    <Card
      title={title}
      description={description}
      icon={icon}
      addon={
        <div className="h-0 flex items-center gap-1.5">
          {badges
            ?.filter(({ annualOnly }) => !annualOnly || isAnnual)
            .map(({ message, variant }) => (
              <Badge key={message} variant={variant}>
                {message}
              </Badge>
            ))}
        </div>
      }
      className="h-full"
    >
      <div className="pt-0 px-6 pb-6">
        <div className="space-y-6">
          <div className="flex gap-2 items-end">
            {price ? (
              <>
                <Subheading>${price}</Subheading>
                <Paragraph size="xs" color="light" className="-translate-y-1">
                  /user /month (billed {isAnnual ? "annually" : "monthly"})
                </Paragraph>
              </>
            ) : (
              <Subheading className="font-light">Contact us</Subheading>
            )}
          </div>
          <Button auto variant={button.variant} icon={button.icon}>
            {button.content}
          </Button>
        </div>
      </div>
      <CardContent className="border-t border-[#E7E7E780]">
        {features.title ? (
          <Paragraph size="sm" className="font-medium mb-4">
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
                className={cx(
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
      </CardContent>
    </Card>
  );
}
