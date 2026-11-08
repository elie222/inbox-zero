"use client";

import { useEffect, useState } from "react";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { PermissionsConsent } from "@/components/PermissionsConsent";
import { useOrgAccess } from "@/hooks/useOrgAccess";
import { useAccount } from "@/providers/EmailAccountProvider";
import { checkPermissionsAction } from "@/utils/actions/permissions";
import { needsPermissionsReconnect } from "@/utils/permissions-check";

// Checks once per step the user lands on, not on a timer, so a user who drops
// access mid-setup is caught at the next step with one provider call per step.
export function OnboardingPermissionsGate({
  step,
  children,
}: {
  step?: string;
  children: React.ReactNode;
}) {
  const { emailAccountId } = useAccount();
  const { isAccountOwner } = useOrgAccess();
  const [missingPermissions, setMissingPermissions] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `step` is the trigger, so each onboarding step re-checks
  useEffect(() => {
    if (!isAccountOwner) return;

    let cancelled = false;
    checkPermissionsAction(emailAccountId).then((result) => {
      if (!cancelled && needsPermissionsReconnect(result?.data)) {
        setMissingPermissions(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [emailAccountId, isAccountOwner, step]);

  // Rendered in place of the step rather than redirecting to the consent
  // route, so the app sidebar never appears to lead the user away mid-setup.
  if (missingPermissions) {
    return (
      <OnboardingWrapper>
        <PermissionsConsent />
      </OnboardingWrapper>
    );
  }

  return children;
}
