"use client";

import {
  useLandingPageAIAssistantVariant,
  type LandingPageAIAssistantVariant,
} from "@/hooks/useFeatureFlags";
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
  BellIcon,
  ReplyIcon,
} from "lucide-react";
import Image from "next/image";

type Side = "left" | "right";

export function FeaturesHome() {
  return (
    <>
      <FeaturesAiAssistant />
      <FeaturesReplyZero imageSide="right" />
      <FeaturesUnsubscribe />
      <FeaturesColdEmailBlocker imageSide="right" />
      <FeaturesStats />
    </>
  );
}

export function FeaturesWithImage({
  imageSide = "left",
  title,
  subtitle,
  description,
  image,
  features,
}: {
  imageSide?: "left" | "right";
  title: string;
  subtitle: string;
  description: React.ReactNode;
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
              imageSide === "left"
                ? "lg:ml-auto lg:pl-4"
                : "lg:mr-auto lg:pr-4",
            )}
          >
            <div className="lg:max-w-lg">
              <h2 className="font-cal text-base leading-7 text-blue-600">
                {title}
              </h2>
              <p className="mt-2 font-cal text-3xl text-gray-900 sm:text-4xl">
                {subtitle}
              </p>
              <p className="mt-6 text-lg leading-8 text-gray-600">
                {description}
              </p>
              {!!features.length && (
                <dl className="mt-10 max-w-xl space-y-8 text-base leading-7 text-gray-600 lg:max-w-none">
                  {features.map((feature) => (
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
              )}
            </div>
          </div>
          <div
            className={clsx(
              "flex items-start",
              imageSide === "left"
                ? "justify-end lg:order-first"
                : "justify-start lg:order-last",
            )}
          >
            <div className="rounded-xl bg-gray-900/5 p-2 ring-1 ring-inset ring-gray-900/10 lg:rounded-2xl lg:p-4">
              <Image
                src={image}
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

export function FeaturesAiAssistant({ imageSide }: { imageSide?: Side }) {
  const variant = useLandingPageAIAssistantVariant();

  const variants: Record<
    LandingPageAIAssistantVariant,
    {
      title: string;
      subtitle: string;
      description: React.ReactNode;
      featuresAutomations: {
        name: string;
        description: string;
        icon: LucideIcon;
      }[];
    }
  > = {
    control: {
      title: "Automate your inbox",
      subtitle: "Your AI assistant for email",
      description:
        "Transform your inbox from chaos to clarity. Let AI handle the predictable, while you focus on what matters.",
      featuresAutomations: [
        {
          name: "Automate your replies",
          description:
            "Set custom rules and let AI draft perfect responses to common emails - from meeting requests to customer inquiries.",
          icon: Sparkles,
        },
        {
          name: "Intelligent organization",
          description:
            "Automatically sort, label, and prioritize emails based on your preferences and workflow.",
          icon: Orbit,
        },
        {
          name: "Natural instructions",
          description:
            "No coding needed - just tell your assistant what you want in plain English, like you would a team member.",
          icon: LineChart,
        },
      ],
    },
    magic: {
      title: "Your Personal Assistant",
      subtitle: "Your AI Email Assistant That Works Like Magic",
      description: (
        <>
          All the benefits of a personal assistant, at a fraction of the cost.
          <br />
          <br />
          Tell your AI assistant how to manage your email in plain English -
          just like you would ChatGPT. Want newsletters archived and labeled?
          Investor emails flagged as important? Automatic reply drafts for
          common requests? Just ask.
          <br />
          <br />
          Once configured, your assistant works 24/7 to keep your inbox
          organized exactly how you want it. No more drowning in email. No
          expensive human assistant required.
        </>
      ),
      featuresAutomations: [],
    },
  };

  const selectedVariant =
    typeof variant === "string" ? variants[variant] : variants.control;

  return (
    <FeaturesWithImage
      imageSide={imageSide}
      title={selectedVariant.title}
      subtitle={selectedVariant.subtitle}
      description={selectedVariant.description}
      features={selectedVariant.featuresAutomations}
      image="/images/home/ai-email-assistant.png"
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

export function FeaturesColdEmailBlocker({ imageSide }: { imageSide?: Side }) {
  const subtitle = "Never read a cold email again";
  const description =
    "Say goodbye to unsolicited outreach. Automatically filter sales pitches and cold emails so you only see messages that matter.";

  return (
    <FeaturesWithImage
      imageSide={imageSide}
      title="Cold Email Blocker"
      subtitle={subtitle}
      description={description}
      image="/images/home/cold-email-blocker.png"
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

export function FeaturesStats({ imageSide }: { imageSide?: Side }) {
  return (
    <FeaturesWithImage
      imageSide={imageSide}
      title="Email Analytics"
      subtitle="What gets measured, gets managed"
      description="Understanding your inbox is the first step to dealing with it. Understand what is filling up your inbox. Then figure out an action plan to deal with it."
      image="/images/home/email-analytics.png"
      features={featuresStats}
    />
  );
}

const featuresUnsubscribe = [
  {
    name: "One-click unsubscribe",
    description:
      "Don't search for the unsubscribe button. Unsubscribe in a click, or auto archive instead.",
    icon: MousePointer2Icon,
  },
  {
    name: "See who emails you most",
    description:
      "See who's sending you the most emails to prioritise which ones to unsubscribe from.",
    icon: EyeIcon,
  },
  {
    name: "How often you read them",
    description:
      "See what percentage of emails you read from each sender. Unsubscribe from the ones you don't read.",
    icon: BarChart2Icon,
  },
];

export function FeaturesUnsubscribe({ imageSide }: { imageSide?: Side }) {
  return (
    <FeaturesWithImage
      imageSide={imageSide}
      title="Bulk Unsubscriber"
      subtitle="Bulk unsubscribe from emails you never read"
      description="Unsubscribe from newsletters and marketing emails in one click. We show you which emails you never read to make it easy."
      image="/images/home/bulk-unsubscriber.png"
      features={featuresUnsubscribe}
    />
  );
}

const featuresReplyZero = [
  {
    name: "Focus on what needs a reply",
    description:
      "We label every email that needs a reply, so it's easy to focus on the ones that matter.",
    icon: ReplyIcon,
  },
  {
    name: "Follow up on people who haven't replied",
    description:
      "Never lose track of conversations - we label every conversation that is missing a reply. Filter by overdue conversations to follow up on threads that need attention.",
    icon: BellIcon,
  },
  {
    name: "Send gentle follow-ups in one click",
    description:
      "No more crafting awkward follow-up emails. Our smart nudge feature drafts perfect follow-up messages for you, making it easy to keep conversations moving.",
    icon: SparklesIcon,
  },
  {
    name: "Choose your workflow",
    description:
      "Use Reply Zero as a minimal view within Inbox Zero for ultimate focus, or leverage our Gmail labels to manage replies your way. Either way, you'll only see what truly needs your attention.",
    icon: ListStartIcon,
  },
];

export function FeaturesReplyZero({ imageSide }: { imageSide?: Side }) {
  return (
    <FeaturesWithImage
      imageSide={imageSide}
      title="Reply Zero"
      subtitle="Answer every email that matters"
      description="Most emails don't need a reply. Reply Zero only shows you the ones that do."
      image="/images/home/reply-zero.png"
      features={featuresReplyZero}
    />
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

export function FeaturesNewSenders({ imageSide }: { imageSide?: Side }) {
  return (
    <FeaturesWithImage
      imageSide={imageSide}
      title="New Sender List"
      subtitle="Manage new senders in your inbox"
      description="View a comprehensive list of recent new senders, making it easier to spot important contacts and opportunities, while also offering the ability to block unwanted communication effortlessly."
      image="/images/home/bulk-unsubscriber.png"
      features={featuresNewSenders}
    />
  );
}
