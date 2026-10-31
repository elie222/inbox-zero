"use client";

import { useEffect } from "react";
import { reloadAtNextSafeMoment } from "@/utils/safe-reload";
import type { DeploymentResponse } from "@/app/api/deployment/route";

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const MIN_CHECK_GAP_MS = 60 * 1000;

// Mail tabs stay open for days, past the host's skew protection window. Once a
// tab's deployment is gone, its server actions and lazy chunks can fail with
// errors that make no sense to the user, so reload at the next safe moment.
export function DeploymentUpdateNotice() {
  useEffect(() => {
    const tabDeploymentId = process.env.NEXT_DEPLOYMENT_ID;
    if (!tabDeploymentId) return;

    let lastCheckAt = 0;
    let notified = false;
    const check = async () => {
      if (notified || Date.now() - lastCheckAt < MIN_CHECK_GAP_MS) return;
      lastCheckAt = Date.now();
      try {
        const response = await fetch("/api/deployment", { cache: "no-store" });
        if (!response.ok) return;
        const { deploymentId }: DeploymentResponse = await response.json();
        if (!deploymentId || deploymentId === tabDeploymentId || notified)
          return;
        notified = true;
        reloadAtNextSafeMoment(() => window.location.reload());
      } catch {
        // Offline or mid-deploy; the next check will try again.
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") check();
    };

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
