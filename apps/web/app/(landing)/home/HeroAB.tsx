"use client";

import { useEffect, useState } from "react";
import { useFeatureFlagVariantKey } from "posthog-js/react";
import { Hero } from "@/app/(landing)/home/Hero";

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
};

// allow this to work for search engines while avoiding flickering text for users
// ssr method relied on cookies in the root layout which broke static page generation of blog posts
export function HeroAB({ variantKey }: { variantKey: string }) {
  const [title, setTitle] = useState(copy.control.title);
  const [subtitle, setSubtitle] = useState(copy.control.subtitle);
  const [isHydrated, setIsHydrated] = useState(false);

  const variant = useFeatureFlagVariantKey(variantKey);

  useEffect(() => {
    if (variant && copy[variant as string]) {
      setTitle(copy[variant as string].title);
      setSubtitle(copy[variant as string].subtitle);
    }
    setIsHydrated(true);
  }, [variant]);

  return (
    <Hero
      title={
        <span
          className={`transition-opacity duration-500 ease-in-out ${
            isHydrated ? "opacity-100" : "opacity-0"
          }`}
        >
          {title}
        </span>
      }
      subtitle={
        <span
          className={`transition-opacity duration-500 ease-in-out ${
            isHydrated ? "opacity-100" : "opacity-0"
          }`}
        >
          {subtitle}
        </span>
      }
    />
  );
}
