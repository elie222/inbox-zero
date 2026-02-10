import { CheckIcon, MinusIcon } from "lucide-react";
import { CardWrapper } from "@/components/new-landing/common/CardWrapper";
import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import { SectionHeading } from "@/components/new-landing/common/Typography";
import { tiers } from "@/app/(app)/premium/config";

type FeatureValue = boolean | string;

const features: {
  name: string;
  starter: FeatureValue;
  plus: FeatureValue;
  professional: FeatureValue;
}[] = [
  {
    name: "Sorts & labels emails",
    starter: true,
    plus: true,
    professional: true,
  },
  {
    name: "Drafts replies in your voice",
    starter: true,
    plus: true,
    professional: true,
  },
  {
    name: "Blocks cold emails",
    starter: true,
    plus: true,
    professional: true,
  },
  {
    name: "Bulk unsubscribe",
    starter: true,
    plus: true,
    professional: true,
  },
  {
    name: "Bulk archive",
    starter: true,
    plus: true,
    professional: true,
  },
  {
    name: "Email analytics",
    starter: true,
    plus: true,
    professional: true,
  },
  {
    name: "Pre-meeting briefings",
    starter: true,
    plus: true,
    professional: true,
  },
  {
    name: "Slack integration",
    starter: false,
    plus: true,
    professional: true,
  },
  {
    name: "Auto-file attachments",
    starter: false,
    plus: true,
    professional: true,
  },
  {
    name: "Knowledge base",
    starter: "Limited",
    plus: "Unlimited",
    professional: "Unlimited",
  },
  {
    name: "Team-wide analytics",
    starter: false,
    plus: false,
    professional: true,
  },
  {
    name: "Priority support",
    starter: false,
    plus: false,
    professional: true,
  },
  {
    name: "Dedicated onboarding manager",
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
  if (typeof value === "string") {
    return <span className="text-sm text-gray-700">{value}</span>;
  }
  if (value) {
    return <CheckIcon className="h-5 w-5 text-blue-500 mx-auto" />;
  }
  return <MinusIcon className="h-5 w-5 text-gray-300 mx-auto" />;
}

export function PricingComparisonTable() {
  return (
    <Section>
      <SectionHeading>Compare plans</SectionHeading>
      <SectionContent>
        <CardWrapper>
          <div className="overflow-x-auto rounded-[20px] border border-[#E7E7E780] bg-white">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#E7E7E780]">
                  <th className="py-4 px-6 text-sm font-medium text-gray-500">
                    Feature
                  </th>
                  {tierHeaders.map((tier) => (
                    <th
                      key={tier.name}
                      className="py-4 px-6 text-center min-w-[140px]"
                    >
                      <div className="text-sm font-semibold text-gray-900">
                        {tier.name}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {tier.price}/mo
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {features.map((feature, index) => (
                  <tr
                    key={feature.name}
                    className={
                      index < features.length - 1
                        ? "border-b border-[#E7E7E780]"
                        : ""
                    }
                  >
                    <td className="py-3.5 px-6 text-sm text-gray-700">
                      {feature.name}
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
