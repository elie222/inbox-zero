"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";

export const Assistant = () => {
  const runtime = useChatRuntime({ api: "/api/chat" });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-full justify-center py-8">
        <Thread />
      </div>

      {/* <div className="grid h-[calc(100vh-4rem)] grid-cols-3">
        <Thread />
        <div className="col-span-2 h-full w-full overflow-y-auto p-4">
          <Rules />
        </div>
      </div> */}
    </AssistantRuntimeProvider>
  );
};
