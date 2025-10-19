"use client";

import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import {
  SparklesIcon,
  ZapIcon,
  BellIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
} from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";

interface ValuePropContentProps {
  userName: string;
}

const valueProps = [
  {
    icon: <SparklesIcon className="size-5" />,
    title: "Morning Brief",
    description: "Your curated digest of what matters, delivered at 8am",
  },
  {
    icon: <ZapIcon className="size-5" />,
    title: "One-Click Actions",
    description: "Quick unsubscribe, archive, and organize with a single click",
  },
  {
    icon: <BellIcon className="size-5" />,
    title: "Track Important Conversations",
    description: "Never miss a reply or forget to follow up",
  },
  {
    icon: <ShieldCheckIcon className="size-5" />,
    title: "No Clutter, No Noise",
    description: "Block cold emails and focus on what actually matters",
  },
];

export function ValuePropContent({ userName }: ValuePropContentProps) {
  const router = useRouter();
  const posthog = usePostHog();

  const handleContinue = async () => {
    posthog?.capture("value_prop_continue_clicked", {
      user_name: userName,
    });

    // Redirect to Gmail connection page
    router.push("/connect-gmail");
  };

  return (
    <div className="flex flex-col text-center space-y-6">
      <div className="space-y-4">
        <PageHeading>
          Let's help you reclaim your focus, {userName}.
        </PageHeading>
        <TypographyP className="text-lg">
          Inbox Zero turns your inbox into two simple daily briefs — one in the
          morning, one in the evening. No clutter. No noise. Just what matters.
        </TypographyP>
      </div>

      <div className="grid gap-4 mt-8">
        {valueProps.map((prop, index) => (
          <div
            key={index}
            className="flex items-start gap-3 p-4 rounded-lg bg-gray-50 border border-gray-100"
          >
            <div className="flex-shrink-0 text-blue-600 mt-0.5">
              {prop.icon}
            </div>
            <div className="text-left">
              <h3 className="font-semibold text-gray-900">{prop.title}</h3>
              <p className="text-sm text-gray-600 mt-1">{prop.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-6">
        <TypographyP className="text-sm text-gray-500 mb-4">
          You'll connect your inbox next — we only read what's new since you
          joined.
        </TypographyP>

        <Button
          onClick={handleContinue}
          size="lg"
          className="w-full sm:w-auto px-8"
        >
          Continue
          <ArrowRightIcon className="ml-2 size-4" />
        </Button>
      </div>
    </div>
  );
}
