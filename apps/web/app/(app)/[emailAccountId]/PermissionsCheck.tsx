"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { checkPermissionsAction } from "@/utils/actions/permissions";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { useOrgAccess } from "@/hooks/useOrgAccess";

const permissionsChecked: Record<string, boolean> = {};

export function PermissionsCheck() {
  const router = useRouter();
  const { emailAccountId } = useAccount();
  const { isAccountOwner } = useOrgAccess();

  useEffect(() => {
    // Skip permissions check when viewing another user's account (non-owner)
    if (!isAccountOwner) return;

    if (permissionsChecked[emailAccountId]) return;
    permissionsChecked[emailAccountId] = true;

    checkPermissionsAction(emailAccountId).then((result) => {
      if (result?.data?.hasAllPermissions === false)
        router.replace(prefixPath(emailAccountId, "/permissions/error"));
      if (result?.data?.hasRefreshToken === false)
        router.replace(prefixPath(emailAccountId, "/permissions/consent"));
    });
  }, [router, emailAccountId, isAccountOwner]);

  return null;
}
