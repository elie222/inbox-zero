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

    // Results are not discarded when the step changes, so a user who clicks
    // ahead is still stopped by an earlier step's check. Failed requests fail open.
    checkPermissionsAction(emailAccountId)
      .then((result) => {
        if (needsPermissionsReconnect(result?.data)) {
          setMissingPermissions(true);
        }
      })
      .catch(() => {});
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
