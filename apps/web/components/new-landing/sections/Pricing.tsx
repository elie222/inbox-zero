"use client";

import { useState } from "react";
import Link from "next/link";
import { cx } from "class-variance-authority";
import { Label, Radio, RadioGroup } from "@headlessui/react";
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
import { type Tier, tiers } from "@/app/(app)/premium/config";
import { Briefcase } from "@/components/new-landing/icons/Briefcase";

type PricingTier = Tier & {
  badges?: {
    message: string;
    variant?: BadgeVariant;
    annualOnly?: boolean;
  }[];
  button: {
    content: string;
    variant?: ButtonVariant;
    icon?: React.ReactNode;
    href: string;
    target?: string;
  };
  icon: React.ReactNode;
};

const pricingTiers: PricingTier[] = [
  {
    ...tiers[0],
    badges: [
      { message: "Save 10%", annualOnly: true },
      { message: "Popular", variant: "green" },
    ],
    button: {
      content: "Try free for 7 days",
      href: "/login",
    },
    icon: <Briefcase />,
  },
  {
    ...tiers[1],
    badges: [{ message: "Save 16%", annualOnly: true }],
    button: {
      variant: "secondary-two",
      content: "Try free for 7 days",
      href: "/login",
    },
    icon: <Zap />,
  },
  {
    ...tiers[2],
    button: {
      variant: "secondary-two",
      content: "Speak to sales",
      icon: <Chat />,
      href: "/sales",
      target: "_blank",
    },
    icon: <Sparkle />,
  },
];

const frequencies = ["annually", "monthly"];

export function Pricing() {
  const [frequency, setFrequency] = useState(frequencies[0]);

  return (
    <Section id="pricing">
      <SectionHeading>Try for free, affordable paid plans</SectionHeading>
      <SectionSubtitle>No hidden fees. Cancel anytime.</SectionSubtitle>
      <SectionContent
        noMarginTop
        className="mt-6 flex flex-col items-center justify-center"
      >
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
          {pricingTiers.map((tier, index) => (
            <CardWrapper key={tier.name}>
              <PricingCard
                tier={tier}
                tierIndex={index}
                isAnnual={frequency === "annually"}
              />
            </CardWrapper>
          ))}
        </div>
      </SectionContent>
    </Section>
  );
}

interface PricingCardProps {
  tier: PricingTier;
  tierIndex: number;
  isAnnual: boolean;
}

export function PricingCard({ tier, tierIndex, isAnnual }: PricingCardProps) {
  const { name, description, features } = tier;
  const price = isAnnual ? tier.price.annually : tier.price.monthly;
  const isFirstTier = !tierIndex;

  return (
    <Card
      title={name}
      description={description}
      icon={tier.icon}
      variant="extra-rounding"
      addon={
        <div className="h-0 flex items-center gap-1.5">
          {tier.badges
            ?.filter(({ annualOnly }) => !annualOnly || isAnnual)
            .map((badge) => (
              <Badge key={badge.message} variant={badge.variant}>
                {badge.message}
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
          <Button auto variant={tier.button.variant} asChild>
            <Link href={tier.button.href} target={tier.button.target}>
              {tier.button.variant ? (
                <>
                  {tier.button.icon}
                  {tier.button.content}
                </>
              ) : (
                <span className="relative z-10">
                  {tier.button.icon}
                  {tier.button.content}
                </span>
              )}
            </Link>
          </Button>
        </div>
      </div>
      <CardContent className="border-t border-[#E7E7E780]">
        {isFirstTier ? null : (
          <Paragraph size="sm" className="font-medium mb-4">
            {tier.features[0].text}
          </Paragraph>
        )}
        <ul className="space-y-3">
          {features
            .filter((_, index) => !!isFirstTier || index > 0)
            .map((feature) => (
              <li
                className="text-gray-500 flex items-center gap-2 text-sm"
                key={feature.text}
              >
                <div className="text-blue-500">
                  <Check />
                </div>
                {feature.text}
              </li>
            ))}
        </ul>
      </CardContent>
    </Card>
  );
}
