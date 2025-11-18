"use client";

import { CheckCircleIcon } from "lucide-react";
import { userCount } from "@/utils/config";

export function WelcomeUpgradeHeader() {
  return (
    <div className="mb-8 flex flex-col items-start">
      <div className="mx-auto text-center">
        <h2 className="font-title text-base leading-7 text-blue-600">
          Spend 50% less time on email
        </h2>
        <div>
          <h1 className="mt-2 font-title text-2xl text-gray-900 sm:text-3xl">
            Start your 7-day FREE trial
          </h1>
          <p className="mt-2 text-lg text-gray-900 sm:text-xl">
            Join {userCount} users that use Inbox Zero to be more productive!
          </p>
        </div>
      </div>

      <div className="mx-auto mt-4 flex flex-col items-start gap-2">
        <TrialFeature>100% no-risk trial</TrialFeature>
        <TrialFeature>Free for the first 7 days</TrialFeature>
        <TrialFeature>Cancel anytime, hassle-free</TrialFeature>
      </div>
    </div>
  );
}

const TrialFeature = ({ children }: { children: React.ReactNode }) => (
  <p className="flex items-center text-gray-900">
    <CheckCircleIcon className="mr-2 h-4 w-4 text-green-500" />
    {children}
  </p>
);
