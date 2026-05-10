"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { toastError } from "@/components/Toast";
import { endStripeTrialAction } from "@/utils/actions/premium";

export function useEndStripeTrial() {
  const [loading, setLoading] = useState(false);
  const { mutate } = useSWRConfig();

  const endTrial = async () => {
    setLoading(true);
    const result = await endStripeTrialAction().finally(() => {
      setLoading(false);
    });

    if (result?.serverError) {
      toastError({ description: result.serverError });
      return;
    }

    if (result?.data?.status === "active") {
      toast.success("Your paid plan is active.");
    } else {
      toast.message("Your trial has ended.");
    }

    await Promise.all([
      mutate("/api/user/me"),
      mutate("/api/user/ai-automation-status"),
    ]);
  };

  return { loading, endTrial };
}
