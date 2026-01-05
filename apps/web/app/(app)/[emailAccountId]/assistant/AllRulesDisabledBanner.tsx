"use client";

import Link from "next/link";
import { SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionCard } from "@/components/ui/card";
import { useRules } from "@/hooks/useRules";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import {
  STEP_KEYS,
  getStepNumber,
} from "@/app/(app)/[emailAccountId]/onboarding/steps";

export function AllRulesDisabledBanner() {
  const { data: rules, isLoading } = useRules();
  const { emailAccountId } = useAccount();

  if (isLoading || !rules) return null;

  const allRulesDisabled =
    rules.length > 0 && rules.every((rule) => !rule.enabled);

  if (!allRulesDisabled) return null;

  return (
    <ActionCard
      className="max-w-full mt-4"
      variant="blue"
      icon={<SettingsIcon className="h-5 w-5" />}
      title="All rules are disabled"
      description="Your AI Assistant isn't processing emails because all rules are disabled. Enable them to get started."
      action={
        <Button asChild variant="primaryBlack">
          <Link
            href={prefixPath(
              emailAccountId,
              `/onboarding?step=${getStepNumber(STEP_KEYS.LABELS)}&force=true`,
            )}
          >
            Set up rules
          </Link>
        </Button>
      }
    />
  );
}
