"use client";

import { useState } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Chat } from "@/components/assistant-chat/chat";
import { useAccount } from "@/providers/EmailAccountProvider";
import { SectionHeader } from "@/components/Typography";
import { Rules } from "@/app/(app)/[emailAccountId]/automation/Rules";

export default function AssistantPage() {
  const { emailAccountId } = useAccount();

  const [isArtifactOpen, setIsArtifactOpen] = useState(false);

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      <ResizablePanel>
        <Chat
          id={emailAccountId} // TODO:
          initialMessages={[
            {
              id: "1",
              role: "assistant",
              content: "",
              parts: [
                {
                  type: "text",
                  text: "Hey, I'm your AI email assistant!",
                },
                {
                  type: "text",
                  text: "I organize your email and draft replies for you that are ready to send.",
                },
                {
                  type: "text",
                  text: "I've got your initial rules set up, but we can add more to help you manage your inbox better.",
                },
                {
                  type: "text",
                  text: "I'd love to learn more about you so I can better manage your needs.",
                },
              ],
            },
          ]}
          emailAccountId={emailAccountId}
        />
        {/* <Button
          variant="outline"
          onClick={() => setIsArtifactOpen(true)}
          className="absolute bottom-4 right-4"
        >
          View rules
        </Button> */}
      </ResizablePanel>
      {isArtifactOpen && (
        <>
          <ResizableHandle />
          <ResizablePanel>
            <div className="p-4">
              <SectionHeader className="mb-4">Your rules</SectionHeader>
              <Rules size="sm" />
            </div>
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}
