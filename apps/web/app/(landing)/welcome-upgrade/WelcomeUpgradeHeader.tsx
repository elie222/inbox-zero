"use client";

import { CheckCircleIcon } from "lucide-react";
import { userCount } from "@/utils/config";
import { BRAND_NAME } from "@/utils/branding";

export function WelcomeUpgradeHeader() {
  return (
    <div className="mb-6 flex flex-col items-start sm:mb-8">
      <div className="mx-auto text-center">
        <h2 className="font-title text-sm leading-6 text-blue-600 sm:text-base sm:leading-7">
          Spend 50% less time on email
        </h2>
        <div>
          <h1 className="mt-1 font-title text-2xl text-gray-900 sm:mt-2 sm:text-3xl">
            Start your 7-day FREE trial
          </h1>
          <p className="mt-2 text-base text-gray-900 sm:text-xl">
            {`Join ${userCount} users that use ${BRAND_NAME} to be more productive!`}
          </p>
        </div>
      </div>

      <div className="mx-auto mt-3 flex flex-col items-start gap-1.5 sm:mt-4 sm:gap-2">
        <TrialFeature>100% no-risk trial</TrialFeature>
        <TrialFeature>Free for the first 7 days</TrialFeature>
        <TrialFeature>Cancel anytime, hassle-free</TrialFeature>
      </div>
    </div>
  );
}

const TrialFeature = ({ children }: { children: React.ReactNode }) => (
  <p className="flex items-center text-sm text-gray-900 sm:text-base">
    <CheckCircleIcon className="mr-2 h-4 w-4 text-green-500" />
    {children}
  </p>
);
