"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { checkPermissionsAction } from "@/utils/actions/permissions";
import { useAccount } from "@/providers/EmailAccountProvider";

const permissionsChecked: Record<string, boolean> = {};

export function PermissionsCheck() {
  const router = useRouter();
  const { email } = useAccount();

  useEffect(() => {
    if (permissionsChecked[email]) return;
    permissionsChecked[email] = true;

    checkPermissionsAction(email).then((result) => {
      if (result?.data?.hasAllPermissions === false)
        router.replace("/permissions/error");
      if (result?.data?.hasRefreshToken === false)
        router.replace("/permissions/consent");
    });
  }, [router, email]);

  return null;
}
