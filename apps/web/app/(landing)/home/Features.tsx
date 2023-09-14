import { LineChart, MailCheck, Orbit, Sparkles } from "lucide-react";

const features = [
  {
    name: "Analytics",
    description:
      "Get a detailed overview of your inbox. See who is sending you the most emails, who you send the most emails to, and more.",
    icon: LineChart,
  },
  {
    name: "AI Automation",
    description:
      "Put your inbox on autopilot with AI based rules. Automatically archive, delete, or reply to emails based on your preferences. Run it in test mode until you trust the AI fully.",
    icon: Sparkles,
  },
  {
    name: "Auto Categorization",
    description:
      "Inbox Zero automatically categorizes your emails into different categories so you can handle similar emails at once without having to context switch.",
    icon: Orbit,
  },
  {
    name: "Easy unsubscribe",
    description:
      "See all your subscriptions in one place. Unsubscribe from unwanted subscriptions with a single click.",
    icon: MailCheck,
  },
];

export function Features() {
  return (
    <div
      id="features"
      className="mx-auto mt-16 max-w-7xl px-6 lg:px-8"
      // when logo cloud is present
      // className="mx-auto mt-32 max-w-7xl px-6 sm:mt-56 lg:px-8"
    >
      <div className="mx-auto max-w-2xl lg:text-center">
        <h2 className="text-base font-semibold leading-7 text-gray-600">
          Get to inbox zero faster
        </h2>
        <p className="mt-2 font-cal text-3xl font-bold text-gray-900 sm:text-4xl">
          Your AI assistant for emails
        </p>
        <p className="mt-6 text-lg leading-8 text-slate-600">
          Inbox Zero uses AI to help you empty your inbox daily. What previously
          took hours, now takes minutes. Inbox Zero is your virtual assistant
          for emails.
        </p>
      </div>
      <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-4xl">
        <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-10 lg:max-w-none lg:grid-cols-2 lg:gap-y-16">
          {features.map((feature) => (
            <div key={feature.name} className="relative pl-16">
              <dt className="text-base font-semibold leading-7 text-gray-900">
                <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-lg bg-black">
                  <feature.icon
                    className="h-6 w-6 text-white"
                    aria-hidden="true"
                  />
                </div>
                {feature.name}
              </dt>
              <dd className="mt-2 text-base leading-7 text-gray-600">
                {feature.description}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
