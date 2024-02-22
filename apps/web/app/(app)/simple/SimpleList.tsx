"use client";

import { useState } from "react";
import { BookmarkPlusIcon } from "lucide-react";
import { Celebration } from "@/components/Celebration";
import { Button } from "@/components/ui/button";
import { Button as HoverButton } from "@/components/Button";
import { extractNameFromEmail } from "@/utils/email";
import { decodeSnippet } from "@/utils/gmail/decode";
import { Tooltip } from "@/components/Tooltip";
import { ParsedMessage } from "@/utils/types";
import { archiveEmails } from "@/providers/QueueProvider";
import { cn } from "@/utils";

export function SimpleList(props: { messages: ParsedMessage[] }) {
  const [readLaterMessages, setReadLaterMessages] = useState<
    Record<string, boolean>
  >({});

  return (
    <>
      <div className="mt-8 grid gap-4">
        {props.messages.map((message) => {
          return (
            <div
              key={message.id}
              className={cn(
                "p-4 shadow sm:rounded-lg",
                readLaterMessages[message.id] ? "bg-gray-100" : "bg-white",
              )}
            >
              <div className="flex gap-4">
                <div>
                  <div className="flex">
                    <div className="whitespace-nowrap font-bold">
                      {extractNameFromEmail(message.headers.from)}
                    </div>
                    <div className="ml-4 mr-4">{message.headers.subject}</div>
                  </div>
                  <div className="mt-2 text-sm text-gray-700">
                    {decodeSnippet(message.snippet).replace(/\u200C/g, "")}
                  </div>
                </div>

                <div className="">
                  <Tooltip content="Read Later">
                    <Button
                      className=""
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setReadLaterMessages({
                          ...readLaterMessages,
                          [message.id]: !readLaterMessages[message.id],
                        });
                      }}
                    >
                      <BookmarkPlusIcon className="h-4 w-4" />
                      <span className="sr-only">Read Later</span>
                    </Button>
                  </Tooltip>
                </div>
              </div>
            </div>
          );
        })}
        {props.messages.length === 0 && (
          <Celebration message="All emails handled!" />
        )}
      </div>

      <div className="mt-8 flex justify-center">
        <HoverButton
          size="2xl"
          onClick={() => {
            archiveEmails(
              props.messages
                .filter((m) => !readLaterMessages[m.id])
                .map((m) => m.threadId),
              () => {},
            );
          }}
        >
          Next
        </HoverButton>
      </div>
    </>
  );
}
