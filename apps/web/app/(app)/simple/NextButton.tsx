"use client";

import { Button } from "@/components/Button";
import { archiveEmails } from "@/providers/QueueProvider";

export function NextButton(props: { messages: { threadId: string }[] }) {
  const { messages } = props;
  return (
    <Button
      size="2xl"
      onClick={() => {
        archiveEmails(
          messages.map((m) => m.threadId),
          () => {},
        );
      }}
    >
      Next
    </Button>
  );
}
