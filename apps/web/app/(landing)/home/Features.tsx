"use client";

import { useLandingPageVariant } from "@/hooks/useFeatureFlags";
import clsx from "clsx";
import {
  BarChart2Icon,
  EyeIcon,
  LineChart,
  type LucideIcon,
  MousePointer2Icon,
  Orbit,
  ShieldHalfIcon,
  Sparkles,
  SparklesIcon,
  TagIcon,
  BlocksIcon,
  ListStartIcon,
} from "lucide-react";
import Image from "next/image";

export function FeaturesPrivacy() {
  return (
    <div className="bg-white py-24 sm:py-32" id="features">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl lg:text-center">
          <h2 className="font-cal text-base leading-7 text-blue-600">
            Privacy first
          </h2>
          <p className="mt-2 font-cal text-3xl text-gray-900 sm:text-4xl">
            Approved by Google. Open Source. See exactly what our code does. Or
            host it yourself.
          </p>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            Inbox Zero has undergone a thorough security process with Google to
            ensure the protection of your emails. You can even self-host Inbox
            Zero on your own infrastructure.
          </p>
        </div>
      </div>
    </div>
  );
}

export function FeaturesWithImage(props: {
  imageSide: "left" | "right";
  title: string;
  subtitle: string;
  description: string;
  image: string;
  features: {
    name: string;
    description: string;
    icon: LucideIcon;
  }[];
}) {
  return (
    <div className="overflow-hidden bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto grid max-w-2xl grid-cols-1 gap-x-8 gap-y-16 sm:gap-y-20 lg:mx-0 lg:max-w-none lg:grid-cols-2">
          <div
            className={clsx(
              "lg:pt-4",
              props.imageSide === "left"
                ? "lg:ml-auto lg:pl-4"
                : "lg:mr-auto lg:pr-4",
            )}
          >
            <div className="lg:max-w-lg">
              <h2 className="font-cal text-base leading-7 text-blue-600">
                {props.title}
              </h2>
              <p className="mt-2 font-cal text-3xl text-gray-900 sm:text-4xl">
                {props.subtitle}
              </p>
              <p className="mt-6 text-lg leading-8 text-gray-600">
                {props.description}
              </p>
              <dl className="mt-10 max-w-xl space-y-8 text-base leading-7 text-gray-600 lg:max-w-none">
                {props.features.map((feature) => (
                  <div key={feature.name} className="relative pl-9">
                    <dt className="inline font-semibold text-gray-900">
                      <feature.icon
                        className="absolute left-1 top-1 h-5 w-5 text-blue-600"
                        aria-hidden="true"
                      />
                      {feature.name}
                    </dt>{" "}
                    <dd className="inline">{feature.description}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          <div
            className={clsx(
              "flex items-start",
              props.imageSide === "left"
                ? "justify-end lg:order-first"
                : "justify-start lg:order-last",
            )}
          >
            <div className="rounded-xl bg-gray-900/5 p-2 ring-1 ring-inset ring-gray-900/10 lg:rounded-2xl lg:p-4">
              <Image
                src={props.image}
                alt="Product screenshot"
                className="w-[48rem] max-w-none rounded-xl shadow-2xl ring-1 ring-gray-400/10 sm:w-[57rem]"
                width={2400}
                height={1800}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const featuresAutomations = [
  {
    name: "Automate your replies",
    description:
      "Our AI agent will reply, forward, or archive emails based on the rules you provide it.",
    icon: Sparkles,
  },
  {
    name: "Planning mode",
    description:
      "Let our AI plan what to do for you. Accept or reject in a click. Turn on full automation once you're confident the AI can work on its own.",
    icon: Orbit,
  },
  {
    name: "Instruct in plain English",
    description:
      "It's as easy as talking to an assistant or sending a prompt to ChatGPT.",
    icon: LineChart,
  },
];

export function FeaturesAutomation() {
  const variant = useLandingPageVariant();

  const variants: Record<
    string,
    {
      title: string;
      subtitle: string;
    }
  > = {
    control: {
      title: "Automate your inbox",
      subtitle: "Your AI assistant for email",
    },
    benefit: {
      title: "AI Email Assistant",
      subtitle: "Sorting, replying, archiving. Automate on your own terms.",
    },
  };

  const selectedVariant =
    typeof variant === "string" ? variants[variant] : variants.control;

  return (
    <FeaturesWithImage
      imageSide="left"
      title={selectedVariant.title}
      subtitle={selectedVariant.subtitle}
      description="Keep getting emails that require the same response? Let Inbox Zero handle it."
      image="/images/ai-automation.png"
      features={featuresAutomations}
    />
  );
}

const featuresColdEmailBlocker = [
  {
    name: "Block out the noise",
    description:
      "Automatically archive or label cold emails. Keep your inbox clean and focused on what matters.",
    icon: ShieldHalfIcon,
  },
  {
    name: "Adjust cold email prompt",
    description:
      "Tell Inbox Zero what constitutes a cold email for you. It will block them based on your instructions.",
    icon: SparklesIcon,
  },
  {
    name: "Label cold emails",
    description:
      "Automatically label cold emails so you can review them later. Keep your inbox clean and focused on what matters.",
    icon: TagIcon,
  },
];

export function FeaturesColdEmailBlocker() {
  const variant = useLandingPageVariant();

  const variants: Record<
    string,
    {
      subtitle: string;
      description: string;
    }
  > = {
    control: {
      subtitle: "Automatically block cold emails",
      description: "Stop the spam. Automatically archive or label cold emails.",
    },
    benefit: {
      subtitle: "Keep salespeople at the gate",
      description:
        "Block outreach emails you never signed up for and regain control of your inbox.",
    },
  };

  const selectedVariant =
    typeof variant === "string" ? variants[variant] : variants.control;

  return (
    <FeaturesWithImage
      imageSide="left"
      title="Cold Email Blocker"
      subtitle={selectedVariant.subtitle}
      description={selectedVariant.description}
      image="/images/cold-email-blocker.png"
      features={featuresColdEmailBlocker}
    />
  );
}

const featuresStats = [
  {
    name: "Who emails you most",
    description:
      "Someone emailing you too much? Figure out a plan to handle this better.",
    icon: Sparkles,
  },
  {
    name: "Who you email most",
    description:
      "If there's one person you're constantly speaking to is there a better way for you to speak?",
    icon: Orbit,
  },
  {
    name: "What type of emails you get",
    description:
      "Getting a lot of newsletters or cold emails? Try automatically archiving and labelling them with our AI.",
    icon: LineChart,
  },
];

export function FeaturesStats() {
  return (
    <FeaturesWithImage
      imageSide="right"
      title="Inbox Analytics"
      subtitle="Understand your inbox"
      description="Understanding your inbox is the first step to dealing with it. Understand what is filling up your inbox. Then figure out an action plan to deal with it."
      image="/images/analytics.png"
      features={featuresStats}
    />
  );
}

const featuresUnsubscribe = [
  {
    name: "One-click unsubscribe",
    description:
      "Don't search for the unsubscribe button. Unsubscribe with a single click or auto archive emails instead.",
    icon: MousePointer2Icon,
  },
  {
    name: "See who emails you most",
    description:
      "See who's sending you the most marketing and newsletter emails to prioritise who to unsubscribe from.",
    icon: EyeIcon,
  },
  {
    name: "How often you read them",
    description:
      "See how often you read emails from each sender to quickly take action.",
    icon: BarChart2Icon,
  },
];

export function FeaturesUnsubscribe() {
  const variant = useLandingPageVariant();

  const variants: Record<
    string,
    {
      subtitle: string;
      description: string;
    }
  > = {
    control: {
      subtitle: "Clean up your subscriptions",
      description:
        "See all newsletter and marketing subscriptions in one place. Unsubscribe in a click.",
    },
    benefit: {
      subtitle: "No more newsletters you never read",
      description:
        "Bulk unsubscribe from emails in one click. View all your subscriptions and how often you read each one.",
    },
  };

  const selectedVariant =
    typeof variant === "string" ? variants[variant] : variants.control;

  return (
    <FeaturesWithImage
      imageSide="right"
      title="Bulk Email Unsubscriber"
      subtitle={selectedVariant.subtitle}
      description={selectedVariant.description}
      image="/images/newsletters.png"
      features={featuresUnsubscribe}
    />
  );
}

export function FeaturesHome() {
  return (
    <>
      <FeaturesPrivacy />
      <FeaturesAutomation />
      <FeaturesUnsubscribe />
      <FeaturesColdEmailBlocker />
      <FeaturesStats />
    </>
  );
}

const featuresNewSenders = [
  {
    name: "Quickly Identify New Senders",
    description:
      "Conveniently lists all new individuals or entities that recently emailed you, helping you spot important contacts.",
    icon: EyeIcon,
  },
  {
    name: "Effortless Blocking",
    description:
      "Easily block any unwanted sender with a single click, keeping your inbox clean and relevant.",
    icon: ShieldHalfIcon,
  },
  {
    name: "Stay Organized and Secure",
    description:
      "Enhance your email security by managing unfamiliar senders, reducing the risk of spam and phishing attacks.",
    icon: BlocksIcon,
  },
  {
    name: "Personalize Your Email Experience",
    description:
      "Discover and prioritize important emails, ensuring you never miss out on significant introductions or opportunities.",
    icon: ListStartIcon,
  },
];

export function FeaturesNewSenders() {
  return (
    <FeaturesWithImage
      imageSide="left"
      title="New Sender List"
      subtitle="Manage new senders in your inbox"
      description="View a comprehensive list of recent new senders, making it easier to spot important contacts and opportunities, while also offering the ability to block unwanted communication effortlessly."
      image="/images/newsletters.png"
      features={featuresNewSenders}
    />
  );
}
