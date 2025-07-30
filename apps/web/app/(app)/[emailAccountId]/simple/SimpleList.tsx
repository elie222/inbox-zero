"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import {
  BookmarkMinusIcon,
  BookmarkPlusIcon,
  ExternalLinkIcon,
  MailMinusIcon,
  MoreVerticalIcon,
} from "lucide-react";
import { Celebration } from "@/components/Celebration";
import { Button } from "@/components/ui/button";
import { Button as HoverButton } from "@/components/Button";
import { extractNameFromEmail } from "@/utils/email";
import { Tooltip } from "@/components/Tooltip";
import type { ParsedMessage } from "@/utils/types";
import { archiveEmails } from "@/store/archive-queue";
import { Summary } from "@/app/(app)/[emailAccountId]/simple/Summary";
import { getGmailUrl } from "@/utils/url";
import {
  getNextCategory,
  simpleEmailCategoriesArray,
} from "@/app/(app)/[emailAccountId]/simple/categories";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  markImportantMessageAction,
  markSpamThreadAction,
} from "@/utils/actions/mail";
import { SimpleProgress } from "@/app/(app)/[emailAccountId]/simple/SimpleProgress";
import { useSimpleProgress } from "@/app/(app)/[emailAccountId]/simple/SimpleProgressProvider";
import {
  findCtaLink,
  findUnsubscribeLink,
  htmlToText,
  isMarketingEmail,
  removeReplyFromTextPlain,
} from "@/utils/parse/parseHtml.client";
import { ViewMoreButton } from "@/app/(app)/[emailAccountId]/simple/ViewMoreButton";
import { HtmlEmail } from "@/components/email-list/EmailContents";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";

export function SimpleList(props: {
  messages: ParsedMessage[];
  nextPageToken?: string | null;
  type: string;
}) {
  const { emailAccountId, userEmail } = useAccount();
  const { toHandleLater, onSetHandled, onSetToHandleLater } =
    useSimpleProgress();

  const [unsubscribed, setUnsubscribed] = useState(new Set());
  const router = useRouter();

  const [parent] = useAutoAnimate();

  const [isPending, startTransition] = useTransition();

  const toArchive = props.messages
    .filter((m) => !toHandleLater[m.id])
    .map((m) => m.threadId);

  const handleUnsubscribe = (id: string) => {
    setUnsubscribed((currentUnsubscribed) =>
      new Set(currentUnsubscribed).add(id),
    );
  };

  const filteredMessages = props.messages.filter(
    (m) => !toHandleLater[m.id] && !unsubscribed.has(m.id),
  );

  return (
    <>
      <div className="mt-8 grid gap-4" ref={parent}>
        {filteredMessages.map((message) => {
          return (
            <SimpleListRow
              key={message.id}
              message={message}
              userEmail={userEmail}
              emailAccountId={emailAccountId}
              toHandleLater={toHandleLater}
              onSetToHandleLater={onSetToHandleLater}
              handleUnsubscribe={() => handleUnsubscribe(message.id)}
            />
          );
        })}
        {filteredMessages.length === 0 && (
          <Celebration message="All emails handled!" />
        )}
      </div>

      <div className="mt-8 flex justify-center">
        <HoverButton
          size="2xl"
          loading={isPending}
          onClick={() => {
            startTransition(() => {
              onSetHandled(toArchive);

              archiveEmails({
                threadIds: toArchive,
                emailAccountId,
                onSuccess: () => {},
              });

              if (props.nextPageToken) {
                router.push(
                  prefixPath(
                    emailAccountId,
                    `/simple?type=${props.type}&pageToken=${props.nextPageToken}`,
                  ),
                );
              } else {
                const lastCategory =
                  simpleEmailCategoriesArray[
                    simpleEmailCategoriesArray.length - 1
                  ][0];

                if (props.type === lastCategory) {
                  router.push(prefixPath(emailAccountId, "/simple/completed"));
                } else {
                  const next = getNextCategory(props.type);
                  router.push(
                    prefixPath(emailAccountId, `/simple?type=${next}`),
                  );
                }
              }
            });
          }}
        >
          {toArchive.length ? "Archive and Continue" : "Continue"}
        </HoverButton>
      </div>

      <SimpleProgress />
    </>
  );
}

function SimpleListRow({
  message,
  userEmail,
  emailAccountId,
  toHandleLater,
  onSetToHandleLater,
  handleUnsubscribe,
}: {
  message: ParsedMessage;
  userEmail: string;
  emailAccountId: string;
  toHandleLater: Record<string, boolean>;
  onSetToHandleLater: (ids: string[]) => void;
  handleUnsubscribe: (id: string) => void;
}) {
  const unsubscribeLink = findUnsubscribeLink(message.textHtml);
  const cta = findCtaLink(message.textHtml);

  const marketingEmail =
    !!message.textHtml && isMarketingEmail(message.textHtml);

  const [expanded, setExpanded] = useState(false);

  const actionButtons = (
    <div className="flex gap-2">
      {!!unsubscribeLink && (
        <Tooltip content="Unsubscribe">
          <Button
            variant="outline"
            size="icon"
            asChild
            onClick={() => handleUnsubscribe(message.id)}
          >
            <Link
              href={unsubscribeLink}
              target={unsubscribeLink !== "#" ? "_blank" : undefined}
            >
              <MailMinusIcon className="h-4 w-4" />
              <span className="sr-only">Unsubscribe</span>
            </Link>
          </Button>
        </Tooltip>
      )}

      <Tooltip content="Handle Later">
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            onSetToHandleLater([message.id]);
          }}
        >
          {toHandleLater[message.id] ? (
            <BookmarkMinusIcon className="h-4 w-4" />
          ) : (
            <BookmarkPlusIcon className="h-4 w-4" />
          )}
          <span className="sr-only">Handle Later</span>
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
          <DropdownMenuItem
            onClick={() => {
              window.open(getGmailUrl(message.id, userEmail), "_blank");
            }}
          >
            Open in Gmail
          </DropdownMenuItem>
          {/* TODO only show one of these two buttons */}
          <DropdownMenuItem
            onClick={() => {
              markImportantMessageAction(emailAccountId, {
                messageId: message.id,
                important: true,
              });
            }}
          >
            Mark Important
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              markImportantMessageAction(emailAccountId, {
                messageId: message.id,
                important: false,
              });
            }}
          >
            Mark Unimportant
          </DropdownMenuItem>
          {/* TODO only show if it has unsubscribe link */}
          {/* <DropdownMenuItem>Unsubscribe</DropdownMenuItem> */}
          <DropdownMenuItem
            onClick={() => {
              markSpamThreadAction(emailAccountId, {
                threadId: message.threadId,
              });
            }}
          >
            Mark Spam
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <div className="bg-background p-4 shadow sm:rounded-lg">
      <div className="sm:flex sm:items-center sm:gap-4">
        <div className="w-full">
          <div className="flex">
            <span className="font-bold">
              {extractNameFromEmail(message.headers.from)}
            </span>
            <span className="ml-2 mr-4">{message.headers.subject}</span>
            {expanded && <span className="ml-auto">{actionButtons}</span>}
          </div>

          <div className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
            {expanded && !!message.textHtml ? (
              <HtmlEmail html={message.textHtml} />
            ) : marketingEmail ? (
              <Summary
                textPlain={message.textPlain}
                textHtml={message.textHtml}
                onViewMore={() => setExpanded(true)}
              />
            ) : (
              <EmailContent
                textPlain={message.textPlain}
                textHtml={message.textHtml}
                expanded={expanded}
                setExpanded={setExpanded}
              />
            )}
          </div>

          {cta && (
            <Button asChild variant="secondary" size="sm" className="mt-2">
              <Link href={cta.ctaLink} target="_blank">
                {cta.ctaText}
                <ExternalLinkIcon className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>

        {!expanded && <div className="mt-2 sm:mt-0">{actionButtons}</div>}
      </div>
    </div>
  );
}

function EmailContent({
  textPlain,
  textHtml,
  expanded,
  setExpanded,
}: {
  textPlain?: string;
  textHtml?: string;
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
}) {
  const text = textPlain
    ? removeReplyFromTextPlain(textPlain).trim()
    : htmlToText(textHtml || "No content").trim();

  const cleanedText = text.replace(/[\u00A0\u200C]/g, ""); // remove invisible characters
  // .replace(/\n+/g, '\n') // Collapse multiple new lines into one
  // .replace(/\s+/g, " ") // Collapse multiple spaces into one
  // .replace(/\n\s*\n/g, "\n") // Remove empty lines

  const finalText = expanded ? cleanedText : cleanedText.substring(0, 200);

  return (
    <>
      {finalText}
      {finalText.length === 200 && !expanded && (
        <>
          ...
          <ViewMoreButton onClick={() => setExpanded(true)} />
        </>
      )}
    </>
  );
}
