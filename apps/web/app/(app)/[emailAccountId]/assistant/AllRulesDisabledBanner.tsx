"use client";

import Link from "next/link";
import { SettingsIcon } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/components/ui/button";
import { ActionCard } from "@/components/ui/card";
import { useRules } from "@/hooks/useRules";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  STEP_KEYS,
  getOnboardingStepHref,
} from "@/app/(app)/[emailAccountId]/onboarding/onboardingFlow";

export function AllRulesDisabledBanner() {
  const { t } = useLingui();
  const { data: rules, isLoading } = useRules();
  const { emailAccountId } = useAccount();

  if (isLoading || !rules) return null;

  const allRulesDisabled = rules.every((rule) => !rule.enabled);

  if (!allRulesDisabled) return null;

  return (
    <ActionCard
      className="max-w-full mt-4"
      variant="blue"
      icon={<SettingsIcon className="h-5 w-5" />}
      title={t`All rules are disabled`}
      description={t`Your AI Assistant isn't processing emails because all rules are disabled. Enable them to get started.`}
      action={
        <Button asChild variant="primaryBlack">
          <Link
            href={getOnboardingStepHref(emailAccountId, STEP_KEYS.LABELS, {
              force: true,
            })}
          >
            <Trans>Set up rules</Trans>
          </Link>
        </Button>
      }
    />
  );
}
