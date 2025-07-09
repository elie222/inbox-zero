"use client";

import { useDigestEnabled } from "@/hooks/useFeatureFlags";
import { Button } from "@/components/ui/button";
import { SettingCard } from "@/components/SettingCard";

export function DigestSetting() {
  const enabled = useDigestEnabled();

  if (!enabled) return null;

  return (
    <SettingCard
      title="Digest"
      description="Configure how often you receive digest emails."
      right={
        <Button variant="outline" size="sm">
          Configure
        </Button>
      }
    />
  );
}
