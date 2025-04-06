"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoadingContent } from "@/components/LoadingContent";

export default function MailRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = searchParams.get("type") || "inbox";
  const threadId = searchParams.get("thread-id");

  useEffect(() => {
    if (threadId) {
      // Redirect to the new URL structure for thread view
      router.replace(`/mail/${type}/${threadId}`);
    } else {
      // Redirect to the new URL structure for mail list
      router.replace(`/mail/${type}`);
    }
  }, [router, type, threadId]);

  return (
    <div className="flex h-full items-center justify-center">
      <LoadingContent loading={true}>{null}</LoadingContent>
    </div>
  );
}
