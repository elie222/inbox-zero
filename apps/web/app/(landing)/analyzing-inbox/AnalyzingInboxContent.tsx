"use client";

import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { StreamingTerminalLog } from "@/components/StreamingTerminalLog";

interface AnalyzingInboxContentProps {
  userName: string;
}

const ANALYZING_MESSAGES = [
  "Dossier:",
  "",
  "Analyzing your inbox...",
  "",
  "Grouping conversations by priority...",
  "",
  "Filtering noise from your feed...",
];

export function AnalyzingInboxContent({
  userName,
}: AnalyzingInboxContentProps) {
  const router = useRouter();
  const posthog = usePostHog();

  const handleComplete = () => {
    posthog?.capture("analyzing_inbox_completed", {
      user_name: userName,
    });

    // Redirect to preview brief page
    router.push("/preview-brief");
  };

  return (
    <div className="flex flex-col space-y-6">
      <StreamingTerminalLog
        messages={ANALYZING_MESSAGES}
        characterDelay={0.03}
        lineDelay={1.0}
        onComplete={handleComplete}
      />
    </div>
  );
}
