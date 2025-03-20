"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { ThreadList } from "@/components/assistant-ui/thread-list";

export const Assistant = () => {
  const runtime = useChatRuntime({
    api: "/api/chat",
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {/* <div className="grid h-[calc(100vh-4rem)] grid-cols-[200px_1fr] gap-x-2">
        <ThreadList />
        <Thread />
      </div> */}
      <div className="grid h-[calc(100vh-4rem)] grid-cols-3">
        <Thread />
        <div className="col-span-2 h-full w-full bg-red-500">Artifact</div>
      </div>
    </AssistantRuntimeProvider>
  );
};
