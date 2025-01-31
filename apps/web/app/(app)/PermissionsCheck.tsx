"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { checkPermissionsAction } from "@/utils/actions/permissions";

let permissionsChecked = false;

export function PermissionsCheck() {
  const router = useRouter();

  useEffect(() => {
    if (permissionsChecked) return;
    permissionsChecked = true;

    checkPermissionsAction().then((result) => {
      if (result?.hasAllPermissions === false)
        router.replace("/permissions/error");
      if (result?.hasRefreshToken === false)
        router.replace("/permissions/consent");
    });
  }, [router]);

  return null;
}
