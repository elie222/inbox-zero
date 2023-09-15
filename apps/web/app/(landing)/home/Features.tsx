import clsx from "clsx";
import { LineChart, LucideIcon, Orbit, Sparkles } from "lucide-react";
import Image from "next/image";

const features = [
  {
    name: "AI Automation",
    description:
      "Automatically reply and archive emails based on your instructions. Let AI handle what it can while you handle the rest. Run in test mode until you fully trust it.",
    icon: Sparkles,
  },
  {
    name: "Auto Categorization",
    description:
      "Inbox Zero automatically categorizes your emails so you can handle similar emails at once without having to context switch.",
    icon: Orbit,
  },
  {
    name: "Analytics",
    description:
      "Get a detailed overview of your inbox. See who is sending you the most emails and who you send the most emails. The first step to improving your workflow is understanding it.",
    icon: LineChart,
  },
];

export function Features() {
  return (
    <div className="bg-white py-24 sm:py-32" id="features">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl lg:text-center">
          <h2 className="font-cal text-base font-semibold leading-7 text-blue-600">
            Handle emails faster
          </h2>
          <p className="mt-2 font-cal text-3xl font-bold text-gray-900 sm:text-4xl">
            Respond faster. Get your time back.
          </p>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            Answering emails takes time. If you run a small-business you{"'"}re
            constantly bombarded with the same questions, many of which can be
            answered automatically. Snippets are great, but even better is not
            having to answer.
          </p>
        </div>
        <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
          <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.name} className="flex flex-col">
                <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-gray-900">
                  <feature.icon
                    className="h-5 w-5 flex-none text-blue-600"
                    aria-hidden="true"
                  />
                  {feature.name}
                </dt>
                <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-600">
                  <p className="flex-auto">{feature.description}</p>
                  {/* <p className="mt-6">
                    <a
                      href="#"
                      className="text-sm font-semibold leading-6 text-blue-600"
                    >
                      Learn more <span aria-hidden="true">→</span>
                    </a>
                  </p> */}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

function FeaturesWithImage(props: {
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
                : "lg:mr-auto lg:pr-4"
            )}
          >
            <div className="lg:max-w-lg">
              <h2 className="font-cal text-base font-semibold leading-7 text-blue-600">
                {props.title}
              </h2>
              <p className="mt-2 font-cal text-3xl font-bold text-gray-900 sm:text-4xl">
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
                : "justify-start lg:order-last"
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
    name: "Auto reply",
    description:
      "Automate what makes sense. Handle the rest yourself. You + AI is a match made in heaven.",
    icon: Sparkles,
  },
  {
    name: "Auto forward",
    description:
      "Need certain emails forwarded to someone else? No problem. Inbox Zero can do that too.",
    icon: Orbit,
  },
  {
    name: "Auto archive",
    description:
      "Certain emails just don't need to hit your inbox. Label and archive them to clean up the noise. Gmail filters are great but limited. Let our AI filter the noise based on your instructions.",
    icon: LineChart,
  },
];

export function FeaturesAutomation() {
  return (
    <FeaturesWithImage
      imageSide="left"
      title="Automate your inbox"
      subtitle="Your AI assistant for email"
      description="Keep getting the same emails over and over? Someone asking about your refund policy? Someone asking about sponsorship? Someone cold emailing you?Let Inbox Zero handle it."
      image="/images/rules.png"
      features={featuresAutomations}
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
      image="/images/stats.png"
      features={featuresStats}
    />
  );
}
