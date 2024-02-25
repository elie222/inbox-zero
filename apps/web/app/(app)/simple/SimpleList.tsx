"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookmarkMinusIcon,
  BookmarkPlusIcon,
  ExternalLinkIcon,
  MoreVerticalIcon,
} from "lucide-react";
import { Celebration } from "@/components/Celebration";
import { Button } from "@/components/ui/button";
import { Button as HoverButton } from "@/components/Button";
import { extractNameFromEmail } from "@/utils/email";
import { Tooltip } from "@/components/Tooltip";
import { ParsedMessage } from "@/utils/types";
import { archiveEmails } from "@/providers/QueueProvider";
import { cn } from "@/utils";
import { Summary } from "@/app/(app)/simple/Summary";
import { getGmailUrl } from "@/utils/url";
import {
  getNextCategory,
  simpleEmailCategoriesArray,
} from "@/app/(app)/simple/categories";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  markImportantMessageAction,
  markSpamThreadAction,
} from "@/utils/actions";

export function SimpleList(props: {
  messages: ParsedMessage[];
  nextPageToken?: string | null;
  userEmail: string;
  type: string;
}) {
  const [handleLaterMessages, setHandleLaterMessages] = useState<
    Record<string, boolean>
  >({});

  const router = useRouter();

  return (
    <>
      <div className="mt-8 grid gap-4">
        {props.messages.map((message) => {
          return (
            <div
              key={message.id}
              className={cn(
                "p-4 shadow sm:rounded-lg",
                handleLaterMessages[message.id] ? "bg-gray-100" : "bg-white",
              )}
            >
              <div className="flex items-center gap-4">
                <div>
                  <div className="flex whitespace-nowrap">
                    <span className="font-bold">
                      {extractNameFromEmail(message.headers.from)}
                    </span>
                    <span className="ml-2 mr-4">{message.headers.subject}</span>
                  </div>
                  {/* <div className="mt-2 text-sm text-gray-700">
                    {decodeSnippet(message.snippet).replace(/\u200C/g, "")}
                  </div> */}

                  {(message.textPlain || message.textHtml) &&
                  !handleLaterMessages[message.id] ? (
                    <div className="mt-2 text-sm text-gray-700">
                      {/* <strong>Summary:</strong> */}
                      <Summary
                        textHtml={message.textHtml}
                        textPlain={message.textPlain}
                      />
                    </div>
                  ) : null}

                  {/* <div className="mt-2 text-sm text-gray-500">
                    {new Date(message.headers.date).toLocaleString()}
                  </div> */}
                </div>

                <div className="ml-auto flex gap-2">
                  <Tooltip content="Handle Later">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setHandleLaterMessages({
                          ...handleLaterMessages,
                          [message.id]: !handleLaterMessages[message.id],
                        });
                      }}
                    >
                      {handleLaterMessages[message.id] ? (
                        <BookmarkMinusIcon className="h-4 w-4" />
                      ) : (
                        <BookmarkPlusIcon className="h-4 w-4" />
                      )}
                      <span className="sr-only">Handle Later</span>
                    </Button>
                  </Tooltip>

                  <Tooltip content="Open in Gmail">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        window.open(
                          getGmailUrl(message.id, props.userEmail),
                          "_blank",
                        );
                      }}
                    >
                      <ExternalLinkIcon className="h-4 w-4" />
                      <span className="sr-only">Open in Gmail</span>
                    </Button>
                  </Tooltip>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon">
                        <MoreVerticalIcon className="h-4 w-4" />
                        <span className="sr-only">More Options</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {/* TODO only show one of these two buttons */}
                      <DropdownMenuItem
                        onClick={() => {
                          markImportantMessageAction(message.id, true);
                        }}
                      >
                        Mark Important
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          markImportantMessageAction(message.id, false);
                        }}
                      >
                        Mark Unimportant
                      </DropdownMenuItem>
                      {/* TODO only show if it has unsubscribe link */}
                      {/* <DropdownMenuItem>Unsubscribe</DropdownMenuItem> */}
                      <DropdownMenuItem
                        onClick={() => {
                          markSpamThreadAction(message.threadId);
                        }}
                      >
                        Mark Spam
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
                .filter((m) => !handleLaterMessages[m.id])
                .map((m) => m.threadId),
              () => {},
            );

            if (props.nextPageToken) {
              router.push(
                `/simple?type=${props.type}&pageToken=${props.nextPageToken}`,
              );
            } else {
              const lastCategory =
                simpleEmailCategoriesArray[
                  simpleEmailCategoriesArray.length - 1
                ][0];

              if (props.type === lastCategory) {
                router.push(`/simple/completed`);
              } else {
                const next = getNextCategory(props.type);
                router.push(`/simple?type=${next}`);
              }
            }
          }}
        >
          Archive All
        </HoverButton>
      </div>
    </>
  );
}
