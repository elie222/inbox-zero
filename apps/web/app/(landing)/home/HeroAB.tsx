import { Hero } from "@/app/(landing)/home/Hero";
import { Skeleton } from "@/components/ui/skeleton";
import { getPosthogBootstrapData } from "@/utils/posthog/bootstrap";

const copy: {
  [key: string]: {
    title: string;
    subtitle: string;
  };
} = {
  control: {
    title: "Stop wasting half your day in Gmail",
    subtitle:
      "Automate your email with AI, bulk unsubscribe from newsletters, and block cold emails. Open-source.",
  },
  "clean-up-in-minutes": {
    title: "Clean Up Your Inbox In Minutes",
    subtitle:
      "Bulk unsubscribe from newsletters, automate your emails with AI, block cold emails, and view your analytics. Open-source.",
  },
  "half-the-time": {
    title: "Spend 50% less time on email",
    subtitle:
      "Automate your email with AI, bulk unsubscribe from newsletters, and block cold emails. Open-source.",
  },
  "gmail-autopilot": {
    title: "Gmail on Autopilot: Work Smarter, Not Harder",
    subtitle:
      "Let AI handle your emails, unsubscribe from newsletters, and block unwanted messages. Tools for a clutter-free inbox.",
  },
};

export async function HeroAB({ variantKey }: { variantKey: string }) {
  const bootstrapData = await getPosthogBootstrapData();
  const variant = bootstrapData?.featureFlags[variantKey];

  if (!variant) return <Skeleton className="h-28 w-full rounded" />;

  const title = copy[variant as keyof typeof copy]?.title || copy.control.title;
  const subtitle =
    copy[variant as keyof typeof copy]?.subtitle || copy.control.subtitle;

  return <Hero title={title} subtitle={subtitle} />;
}
