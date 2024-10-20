"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { completedAppOnboardingAction } from "@/utils/actions/user";
import { env } from "@/env";
import { appHomePath } from "@/utils/config";

export const OnboardingFinish = () => {
  return (
    <Button asChild>
      <Link
        onClick={() => completedAppOnboardingAction()}
        href={
          env.NEXT_PUBLIC_WELCOME_UPGRADE_ENABLED
            ? "/welcome-upgrade"
            : appHomePath
        }
      >
        Continue
      </Link>
    </Button>
  );
};
