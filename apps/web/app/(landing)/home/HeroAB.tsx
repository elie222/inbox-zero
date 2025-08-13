"use client";

import { useEffect, useState } from "react";
import { Hero } from "@/app/(landing)/home/Hero";
import {
  useHeroVariant,
  useHeroVariantEnabled,
  type HeroVariant,
} from "@/hooks/useFeatureFlags";

const copy: {
  [key in HeroVariant]: {
    title: string;
    subtitle: string;
  };
} = {
  control: {
    title: "Meet Your AI Email Assistant That Actually Works",
    subtitle:
      "Cut your email time in half. Inbox Zero intelligently automates responses, organizes your inbox, and helps you reach inbox zero in record time. For Gmail and Outlook.",
  },
  "clean-up-in-minutes": {
    title: "Clean Up Your Inbox In Minutes",
    subtitle:
      "Bulk unsubscribe from newsletters, automate your emails with AI, block cold emails, and view your analytics. Open-source.",
  },
};

// allow this to work for search engines while avoiding flickering text for users
// ssr method relied on cookies in the root layout which broke static page generation of blog posts
export function HeroAB() {
  const [title, setTitle] = useState(copy.control.title);
  const [subtitle, setSubtitle] = useState(copy.control.subtitle);
  const [isHydrated, setIsHydrated] = useState(false);

  const variant = useHeroVariant();
  // to prevent flickering text
  const isFlagEnabled = useHeroVariantEnabled();

  useEffect(() => {
    if (variant && copy[variant]) {
      setTitle(copy[variant].title);
      setSubtitle(copy[variant].subtitle);
    }
    setIsHydrated(true);
  }, [variant]);

  if (isFlagEnabled === false) return <Hero />;

  return (
    <Hero
      title={
        <span
          className={`transition-opacity duration-300 ease-in-out ${
            isHydrated && isFlagEnabled ? "opacity-100" : "opacity-0"
          }`}
        >
          {title}
        </span>
      }
      subtitle={
        <span
          className={`transition-opacity duration-300 ease-in-out ${
            isHydrated && isFlagEnabled ? "opacity-100" : "opacity-0"
          }`}
        >
          {subtitle}
        </span>
      }
    />
  );
}
