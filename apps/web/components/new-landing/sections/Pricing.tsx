"use client";

import { useState } from "react";
import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import type { PostHog } from "posthog-js";
import { Label, Radio, RadioGroup } from "@headlessui/react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
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
} from "@/components/new-landing/common/Typography";
import {
  Badge,
  type BadgeVariant,
} from "@/components/new-landing/common/Badge";
import { Chat } from "@/components/new-landing/icons/Chat";
import {
  formatPrice,
  getExtraAccountPrice,
  INCLUDED_EMAIL_ACCOUNTS_PER_PERSON,
  type Tier,
  tiers,
} from "@/app/(app)/premium/config";
import { TIER_MESSAGES } from "@/app/(app)/premium/config-messages";
import { Briefcase } from "@/components/new-landing/icons/Briefcase";
import { Mail } from "@/components/new-landing/icons/Mail";
import { landingPageAnalytics } from "@/hooks/useAnalytics";
import { cn } from "@/utils";
import { MAIL_CLIENT_SIGNUP_PATH } from "@/utils/config";

type PricingTier = Tier & {
  badges?: {
    message: MessageDescriptor;
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
    badges: [annualSavingsBadge(tiers[0])],
    button: {
      variant: "secondary-two",
      content: "Try free for 7 days",
      href: "/login",
    },
    icon: <Briefcase />,
  },
  {
    ...tiers[1],
    badges: [
      annualSavingsBadge(tiers[1]),
      { message: msg`Popular`, variant: "green" },
    ],
    button: {
      content: "Try free for 7 days",
      href: "/login",
    },
    icon: <Zap />,
  },
  {
    ...tiers[2],
    badges: [annualSavingsBadge(tiers[2])],
    button: {
      variant: "secondary-two",
      content: "Try free for 7 days",
      href: "/login",
    },
    icon: <Sparkle />,
  },
];

const frequencies = ["annually", "monthly"] as const;
type PricingFrequency = (typeof frequencies)[number];

const frequencyLabels: Record<PricingFrequency, MessageDescriptor> = {
  annually: msg`Annually`,
  monthly: msg`Monthly`,
};

export function Pricing() {
  const defaultFrequency: PricingFrequency = "annually";
  const [chosenFrequency, setFrequency] = useState<PricingFrequency | null>(
    null,
  );
  const frequency = chosenFrequency ?? defaultFrequency;
  const posthog = usePostHog();
  const { i18n } = useLingui();

  return (
    <Section id="pricing">
      <SectionHeading>
        <Trans>Try for free, affordable paid plans</Trans>
      </SectionHeading>
      <SectionSubtitle>
        <Trans>No hidden fees. Cancel anytime.</Trans>
      </SectionSubtitle>
      <SectionContent
        noMarginTop
        className="mt-6 flex flex-col items-center justify-center"
      >
        <RadioGroup
          value={frequency}
          onChange={(nextFrequency: PricingFrequency) => {
            posthog.capture("pricing_frequency_changed", {
              source: "landing_page",
              previousFrequency: frequency,
              frequency: nextFrequency,
              defaultFrequency,
            });
            setFrequency(nextFrequency);
          }}
          className="w-fit rounded-full p-1.5 text-xs font-semibold leading-5 ring-1 ring-inset ring-gray-200 mb-6 shadow-[0_0_7px_0_rgba(0,0,0,0.0.07)]"
        >
          <Label className="sr-only">
            <Trans>Payment frequency</Trans>
          </Label>
          {frequencies.map((value) => (
            <Radio
              key={value}
              value={value}
              className={({ checked }) =>
                cn(
                  checked ? "bg-black text-white" : "text-gray-500",
                  "cursor-pointer rounded-full px-6 py-1",
                )
              }
            >
              <span>{i18n._(frequencyLabels[value])}</span>
            </Radio>
          ))}
        </RadioGroup>
        <div className="grid w-full grid-cols-1 lg:grid-cols-3 gap-6">
          {pricingTiers.map((tier, index) => (
            <CardWrapper key={tier.name}>
              <PricingCard
                tier={tier}
                tierIndex={index}
                frequency={frequency}
                defaultFrequency={defaultFrequency}
                frequencySource={chosenFrequency ? "user_selected" : "default"}
                posthog={posthog}
              />
            </CardWrapper>
          ))}
        </div>
        <CardWrapper className="mt-6 w-full">
          <Card variant="extra-rounding">
            <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="text-gray-400">
                  <Mail />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-title text-lg">
                      <Trans>Email app</Trans>
                    </h3>
                    <Badge variant="blue">
                      <Trans>New</Trans>
                    </Badge>
                  </div>
                  <Paragraph size="sm" className="mt-1">
                    <Trans>
                      A fast email app for Gmail and Outlook. Free on web,
                      desktop, and iPhone.
                    </Trans>
                  </Paragraph>
                </div>
              </div>
              <Button size="lg" asChild>
                <Link
                  href={MAIL_CLIENT_SIGNUP_PATH}
                  className="shrink-0 whitespace-nowrap"
                  onClick={() =>
                    landingPageAnalytics.pricingCtaClicked(posthog, {
                      tier: "Email app",
                      cta: "Get started free",
                      frequency,
                      defaultFrequency,
                      frequencySource: chosenFrequency
                        ? "user_selected"
                        : "default",
                    })
                  }
                >
                  <span className="relative z-10">
                    <Trans>Get started free</Trans>
                  </span>
                </Link>
              </Button>
            </CardContent>
          </Card>
        </CardWrapper>
        <CardWrapper className="mt-6 w-full">
          <Card variant="extra-rounding">
            <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="text-gray-400">
                  <Sparkle />
                </div>
                <div>
                  <h3 className="font-title text-lg">Enterprise</h3>
                  <Paragraph size="sm" className="mt-1">
                    <Trans>
                      Need SSO, SCIM, on-premise deployment, or a dedicated
                      account manager?
                    </Trans>
                  </Paragraph>
                </div>
              </div>
              <Button variant="secondary-two" size="lg" asChild>
                <Link
                  href="https://www.getinboxzero.com/sales"
                  onClick={() =>
                    landingPageAnalytics.pricingCtaClicked(posthog, {
                      tier: "Enterprise",
                      cta: "Speak to sales",
                      frequency,
                      defaultFrequency,
                      frequencySource: chosenFrequency
                        ? "user_selected"
                        : "default",
                    })
                  }
                >
                  <Chat />
                  <span className="relative z-10">
                    <Trans>Speak to sales</Trans>
                  </span>
                </Link>
              </Button>
            </CardContent>
          </Card>
        </CardWrapper>
      </SectionContent>
    </Section>
  );
}

interface PricingCardProps {
  defaultFrequency: PricingFrequency;
  frequency: PricingFrequency;
  frequencySource: "default" | "user_selected";
  posthog: PostHog;
  tier: PricingTier;
  tierIndex: number;
}

function PricingCard({
  tier,
  tierIndex,
  frequency,
  defaultFrequency,
  frequencySource,
  posthog,
}: PricingCardProps) {
  const { i18n } = useLingui();
  const { name, features } = tier;
  const tierMessages = TIER_MESSAGES[name];
  const isAnnual = frequency === "annually";
  const price = isAnnual ? tier.price.annually : tier.price.monthly;
  const extraAccountPrice = formatPrice(getExtraAccountPrice(price));
  const isFirstTier = !tierIndex;
  const featureText = (text: string) => {
    const message = tierMessages?.features[text]?.text;
    return message ? i18n._(message) : text;
  };

  return (
    <Card
      title={name}
      description={
        tierMessages ? i18n._(tierMessages.description) : tier.description
      }
      icon={tier.icon}
      variant="extra-rounding"
      addon={
        <div className="h-0 flex items-center gap-1.5">
          {tier.badges
            ?.filter(({ annualOnly }) => !annualOnly || isAnnual)
            .map((badge) => (
              <Badge key={badge.message.id} variant={badge.variant}>
                {i18n._(badge.message)}
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
                <div className="font-title text-[#242424] text-[1.7rem] md:text-[2.5rem] leading-tight">
                  {formatPrice(price)}
                </div>
                <Paragraph size="xs" color="light" className="-translate-y-1">
                  <Trans>/user /month</Trans>
                </Paragraph>
              </>
            ) : (
              <div className="font-title text-[#242424] text-[1.7rem] md:text-[2.5rem] leading-tight">
                <Trans>Contact us</Trans>
              </div>
            )}
          </div>
          {!!price && (
            <Paragraph size="xs" color="light" className="-mt-4">
              {isAnnual ? (
                <Plural
                  value={INCLUDED_EMAIL_ACCOUNTS_PER_PERSON}
                  one={`# email account included, then ${extraAccountPrice}/mo each, billed annually`}
                  other={`# email accounts included, then ${extraAccountPrice}/mo each, billed annually`}
                />
              ) : (
                <Plural
                  value={INCLUDED_EMAIL_ACCOUNTS_PER_PERSON}
                  one={`# email account included, then ${extraAccountPrice}/mo each`}
                  other={`# email accounts included, then ${extraAccountPrice}/mo each`}
                />
              )}
            </Paragraph>
          )}
          <Button auto size="lg" variant={tier.button.variant} asChild>
            <Link
              href={tier.button.href}
              target={tier.button.target}
              onClick={() =>
                landingPageAnalytics.pricingCtaClicked(posthog, {
                  tier: tier.name,
                  cta: tier.button.content,
                  frequency,
                  defaultFrequency,
                  frequencySource,
                })
              }
            >
              {tier.button.icon}
              {/* z-10 keeps text above gradient background on hover to prevent color shift */}
              <span className="relative z-10">
                {tierMessages ? i18n._(tierMessages.cta) : tier.button.content}
              </span>
            </Link>
          </Button>
        </div>
      </div>
      <CardContent className="border-t border-[#E7E7E780]">
        {isFirstTier ? null : (
          <Paragraph size="sm" className="font-medium mb-4">
            {featureText(tier.features[0].text)}
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
                {featureText(feature.text)}
              </li>
            ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function annualSavingsBadge(tier: Tier) {
  const percent = Math.round(tier.discount.annually);
  return {
    message: msg`Save ${percent}%`,
    annualOnly: true,
  };
}
