import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { CheckIcon, MinusIcon } from "lucide-react";
import { CardWrapper } from "@/components/new-landing/common/CardWrapper";
import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import { SectionHeading } from "@/components/new-landing/common/Typography";
import { tiers } from "@/app/(app)/premium/config";

type FeatureValue = boolean | MessageDescriptor;

const features: {
  name: MessageDescriptor;
  starter: FeatureValue;
  plus: FeatureValue;
  professional: FeatureValue;
}[] = [
  {
    name: msg`Sorts & labels emails`,
    starter: true,
    plus: true,
    professional: true,
  },
  {
    name: msg`Drafts replies in your voice`,
    starter: true,
    plus: true,
    professional: true,
  },
  {
    name: msg`Blocks cold emails`,
    starter: true,
    plus: true,
    professional: true,
  },
  {
    name: msg`Bulk unsubscribe`,
    starter: true,
    plus: true,
    professional: true,
  },
  {
    name: msg`Bulk archive`,
    starter: true,
    plus: true,
    professional: true,
  },
  {
    name: msg`Email analytics`,
    starter: true,
    plus: true,
    professional: true,
  },
  {
    name: msg`Pre-meeting briefings`,
    starter: true,
    plus: true,
    professional: true,
  },
  {
    name: msg`AI meeting notetaker`,
    starter: false,
    plus: true,
    professional: true,
  },
  {
    name: msg`Email digests`,
    starter: false,
    plus: true,
    professional: true,
  },
  {
    name: msg`Slack integration`,
    starter: false,
    plus: true,
    professional: true,
  },
  {
    name: msg`App integrations (Notion, Stripe, and more)`,
    starter: false,
    plus: true,
    professional: true,
  },
  {
    name: msg`Auto-file attachments`,
    starter: false,
    plus: true,
    professional: true,
  },
  {
    name: msg`Knowledge base`,
    starter: msg`Limited`,
    plus: msg`Unlimited`,
    professional: msg`Unlimited`,
  },
  {
    name: msg`Team-wide analytics`,
    starter: false,
    plus: false,
    professional: true,
  },
  {
    name: msg`Priority support`,
    starter: false,
    plus: false,
    professional: true,
  },
  {
    name: msg`Dedicated onboarding manager`,
    starter: false,
    plus: false,
    professional: true,
  },
];

const tierHeaders = tiers.map((tier) => ({
  name: tier.name,
  price: `$${tier.price.monthly}`,
}));

function FeatureCell({ value }: { value: FeatureValue }) {
  const { i18n } = useLingui();
  if (typeof value === "object") {
    return <span className="text-sm text-gray-700">{i18n._(value)}</span>;
  }
  if (value) {
    return <CheckIcon className="h-5 w-5 text-blue-500 mx-auto" />;
  }
  return <MinusIcon className="h-5 w-5 text-gray-300 mx-auto" />;
}

export function PricingComparisonTable() {
  const { i18n } = useLingui();

  return (
    <Section>
      <SectionHeading>
        <Trans>Compare plans</Trans>
      </SectionHeading>
      <SectionContent>
        <CardWrapper>
          <div className="overflow-x-auto rounded-[20px] border border-[#E7E7E780] bg-white">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#E7E7E780]">
                  <th className="py-4 px-6 text-sm font-medium text-gray-500">
                    <Trans>Feature</Trans>
                  </th>
                  {tierHeaders.map(({ name, price }) => (
                    <th
                      key={name}
                      className="py-4 px-6 text-center min-w-[140px]"
                    >
                      <div className="text-sm font-semibold text-gray-900">
                        {name}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        <Trans>{price}/mo</Trans>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {features.map((feature, index) => (
                  <tr
                    key={feature.name.id}
                    className={
                      index < features.length - 1
                        ? "border-b border-[#E7E7E780]"
                        : ""
                    }
                  >
                    <td className="py-3.5 px-6 text-sm text-gray-700">
                      {i18n._(feature.name)}
                    </td>
                    <td className="py-3.5 px-6 text-center">
                      <FeatureCell value={feature.starter} />
                    </td>
                    <td className="py-3.5 px-6 text-center">
                      <FeatureCell value={feature.plus} />
                    </td>
                    <td className="py-3.5 px-6 text-center">
                      <FeatureCell value={feature.professional} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardWrapper>
      </SectionContent>
    </Section>
  );
}
