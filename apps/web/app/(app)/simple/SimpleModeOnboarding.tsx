"use client";

import { useEffect, useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import { OnboardingModalDialog } from "@/components/OnboardingModal";

export function SimpleModeOnboarding() {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const [viewedSimpleModeOnboarding, setViewedSimpleModeOnboarding] =
    useLocalStorage("viewedSimpleModeOnboarding", false);

  useEffect(() => {
    if (!viewedSimpleModeOnboarding) {
      setIsOpen(true);
      setViewedSimpleModeOnboarding(true);
    }
  }, [setViewedSimpleModeOnboarding, viewedSimpleModeOnboarding]);

  return (
    <OnboardingModalDialog
      title="Welcome to Simple Email Mode"
      description={
        <>
          Simple email mode shows your emails for the past 24 hours, and helps
          you reach inbox zero for the day quickly.
        </>
      }
      videoId="YjcGsWWfFYI"
      isModalOpen={isOpen}
      setIsModalOpen={setIsOpen}
    />
  );
}
