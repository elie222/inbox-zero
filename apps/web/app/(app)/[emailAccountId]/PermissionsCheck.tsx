"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { checkPermissionsAction } from "@/utils/actions/permissions";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";

const permissionsChecked: Record<string, boolean> = {};

export function PermissionsCheck() {
  const router = useRouter();
  const { emailAccountId } = useAccount();

  useEffect(() => {
    if (permissionsChecked[emailAccountId]) return;
    permissionsChecked[emailAccountId] = true;

    checkPermissionsAction(emailAccountId).then((result) => {
      if (result?.data?.hasAllPermissions === false)
        router.replace(prefixPath(emailAccountId, "/permissions/error"));
      if (result?.data?.hasRefreshToken === false)
        router.replace(prefixPath(emailAccountId, "/permissions/consent"));
    });
  }, [router, emailAccountId]);

  return null;
}
