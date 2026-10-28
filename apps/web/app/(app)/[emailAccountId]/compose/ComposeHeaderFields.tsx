"use client";

import { ChevronDownIcon } from "lucide-react";
import { type ReactNode, type RefObject, useRef, useState } from "react";
import type { FieldError, UseFormRegisterReturn } from "react-hook-form";
import type { GetEmailAccountsResponse } from "@/app/api/user/email-accounts/route";
import { Input } from "@/components/Input";
import { toastError } from "@/components/Toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccount } from "@/providers/EmailAccountProvider";
import { cn } from "@/utils";
import { getAccountLinkingUrl } from "@/utils/account-linking";
import { formatRecipientNames, splitRecipientList } from "@/utils/email";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import type { SendAsAddress } from "@/utils/email/send-as";
import { redirectToSafeUrl } from "@/utils/redirect";
import { ComposeContactRecipientField } from "./ComposeContactRecipientField";
import type { ComposeRecipientField } from "./compose-recipients";

export function ComposeHeaderFields({
  isComposeWindow,
  isInlineReply,
  replyingToEmail,
  fromAccounts,
  accountProvider,
  selectedEmailAccountId,
  onSelectEmailAccount,
  sendingAddress,
  sendAsAddresses,
  selectedSendAs,
  onChangeSendAs,
  recipients,
  onRecipientsChange,
  pendingRecipientsRef,
  onPendingRecipientChange,
  focusRecipientField,
  subjectRegisterProps,
  subjectError,
  popOutButton,
}: {
  isComposeWindow: boolean;
  isInlineReply: boolean;
  replyingToEmail?: { to: string; cc?: string };
  fromAccounts?: GetEmailAccountsResponse["emailAccounts"];
  accountProvider: string;
  selectedEmailAccountId: string;
  onSelectEmailAccount: (emailAccountId: string) => void;
  sendingAddress: string;
  sendAsAddresses: SendAsAddress[];
  selectedSendAs?: SendAsAddress;
  onChangeSendAs: (email: string) => void;
  recipients: Record<ComposeRecipientField, string | undefined>;
  onRecipientsChange: (
    field: ComposeRecipientField,
    recipients: string,
  ) => void;
  pendingRecipientsRef: RefObject<Record<ComposeRecipientField, string>>;
  onPendingRecipientChange: (
    field: ComposeRecipientField,
    query: string,
  ) => void;
  focusRecipientField: boolean;
  subjectRegisterProps: UseFormRegisterReturn<"subject">;
  subjectError?: FieldError;
  popOutButton: ReactNode;
}) {
  const { userEmail } = useAccount();
  const [activeRecipientField, setActiveRecipientField] =
    useState<ComposeRecipientField>("to");
  const [contactsReconnectRequired, setContactsReconnectRequired] =
    useState(false);
  const [isReconnectingContacts, setIsReconnectingContacts] = useState(false);
  const [editReply, setEditReply] = useState(false);
  const [ccBccRequested, setCcBccRequested] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inlineReplySummaryButtonRef = useRef<HTMLButtonElement>(null);
  const collapseInlineReplyFieldsButtonRef = useRef<HTMLButtonElement>(null);

  const reconnectContacts = async () => {
    setIsReconnectingContacts(true);

    try {
      const oauthProvider = isMicrosoftProvider(accountProvider)
        ? "microsoft"
        : "google";
      const url = await getAccountLinkingUrl(oauthProvider, {
        reconnectEmailAccountId: selectedEmailAccountId,
      });
      redirectToSafeUrl(url, { allowExternal: true });
    } catch (error) {
      toastError({
        title: "Error initiating reconnection",
        description:
          error instanceof Error
            ? error.message
            : "Please try again or contact support.",
      });
      setIsReconnectingContacts(false);
    }
  };

  const recipientFieldProps = {
    emailAccountId: selectedEmailAccountId,
    ownAddresses: [sendingAddress],
    isReconnectingContacts,
    onActivate: setActiveRecipientField,
    onReconnectContacts: reconnectContacts,
    onReconnectRequired: () => setContactsReconnectRequired(true),
    onSearchQueryChange: onPendingRecipientChange,
    onSelectedRecipientsChange: (
      field: ComposeRecipientField,
      recipients: string,
    ) => {
      // Removing the last Cc or Bcc should not collapse the row being edited.
      if (field !== "to") setCcBccRequested(true);
      onRecipientsChange(field, recipients);
    },
    reconnectRequired: contactsReconnectRequired,
  };

  const showAccountPicker = Boolean(fromAccounts?.length) && !replyingToEmail;
  const canCollapseInlineReplyFields =
    isInlineReply && Boolean(replyingToEmail?.to);
  const showInlineReplySummary = canCollapseInlineReplyFields && !editReply;
  const openInlineReplyFields = () => {
    setEditReply(true);
    requestAnimationFrame(() =>
      collapseInlineReplyFieldsButtonRef.current?.focus(),
    );
  };
  const closeInlineReplyFields = () => {
    setEditReply(false);
    requestAnimationFrame(() => inlineReplySummaryButtonRef.current?.focus());
  };
  // Inline replies open straight onto every recipient row; elsewhere Cc and
  // Bcc stay tucked away until asked for or filled.
  const canToggleCcBcc =
    !canCollapseInlineReplyFields && !recipients.cc && !recipients.bcc;
  const showCcBcc = !canToggleCcBcc || ccBccRequested;
  const toggleCcBcc = () => {
    // Hiding would unmount the rows and drop text that is not an address yet.
    const unfinishedField = (["cc", "bcc"] as const).find((field) =>
      pendingRecipientsRef.current[field].trim(),
    );
    const focusField = showCcBcc ? unfinishedField : "cc";
    if (!focusField) setCcBccRequested(false);
    else {
      setCcBccRequested(true);
      requestAnimationFrame(() =>
        containerRef.current
          ?.querySelector<HTMLInputElement>(`#${focusField}`)
          ?.focus(),
      );
    }
  };

  return (
    <div
      className={cn(isComposeWindow ? "shrink-0 px-4 pt-3" : "contents")}
      ref={containerRef}
    >
      {showAccountPicker && (
        <div className="flex min-h-7 items-center gap-2">
          <ComposeFieldLabel htmlFor="from-account" label="From" />
          <Select
            value={
              selectedSendAs
                ? `alias:${selectedSendAs.email}`
                : `account:${selectedEmailAccountId}`
            }
            onValueChange={(value) => {
              const [kind, id] = splitFromOption(value);
              if (kind === "alias") onChangeSendAs(id);
              else onSelectEmailAccount(id);
            }}
          >
            <SelectTrigger
              aria-label="From"
              className="h-7 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 text-sm shadow-none focus:ring-0 focus:ring-offset-0"
              id="from-account"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fromAccounts?.flatMap((account) =>
                account.id === selectedEmailAccountId && selectedSendAs
                  ? sendAsAddresses.map((address) => (
                      <SelectItem
                        key={address.email}
                        value={`alias:${address.email}`}
                      >
                        {formatAddressLabel(address.name, address.email)}
                      </SelectItem>
                    ))
                  : [
                      <SelectItem
                        disabled={Boolean(account.account.disconnectedAt)}
                        key={account.id}
                        value={`account:${account.id}`}
                      >
                        {formatAddressLabel(account.name, account.email)}
                      </SelectItem>,
                    ],
              )}
            </SelectContent>
          </Select>
        </div>
      )}
      {showInlineReplySummary ? (
        <div className="flex min-h-7 items-center gap-2">
          <button
            type="button"
            aria-expanded={false}
            ref={inlineReplySummaryButtonRef}
            onClick={openInlineReplyFields}
            className="flex min-w-0 items-center gap-1.5 rounded-sm text-left text-sm font-medium leading-5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="text-emerald-600 dark:text-emerald-400">
              Draft
            </span>
            <span className="min-w-0 truncate">
              to{" "}
              {formatRecipientNames(
                [
                  ...splitRecipientList(
                    recipients.to ?? replyingToEmail?.to ?? "",
                  ),
                  ...splitRecipientList(
                    recipients.cc ?? replyingToEmail?.cc ?? "",
                  ),
                ],
                userEmail,
              ) || "recipients"}
            </span>
            {selectedSendAs && !selectedSendAs.isDefault && (
              <span className="min-w-0 truncate font-normal text-muted-foreground">
                from {selectedSendAs.email}
              </span>
            )}
            <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
          </button>
          {popOutButton}
        </div>
      ) : (
        <div className="space-y-1 [&_input]:bg-transparent">
          {selectedSendAs && !showAccountPicker && (
            <div className="flex min-h-7 items-center gap-2">
              <ComposeFieldLabel htmlFor="from-address" label="From" />
              <Select
                value={selectedSendAs.email}
                onValueChange={onChangeSendAs}
              >
                <SelectTrigger
                  aria-label="From"
                  className="h-7 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 text-sm shadow-none focus:ring-0 focus:ring-offset-0"
                  id="from-address"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sendAsAddresses.map((address) => (
                    <SelectItem key={address.email} value={address.email}>
                      {formatAddressLabel(address.name, address.email)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {(showCcBcc ? (["to", "cc", "bcc"] as const) : (["to"] as const)).map(
            (field) => (
              <div key={field} className="flex min-h-7 items-center gap-2">
                <ComposeFieldLabel
                  htmlFor={field}
                  label={RECIPIENT_LABELS[field]}
                />
                <div className="min-w-0 flex-1">
                  <ComposeContactRecipientField
                    {...recipientFieldProps}
                    active={activeRecipientField === field}
                    autoFocus={field === "to" && focusRecipientField}
                    className="min-h-8"
                    name={field}
                    selectedRecipients={recipients[field] ?? ""}
                  />
                </div>
                {field === "to" && canCollapseInlineReplyFields && (
                  <button
                    type="button"
                    aria-label="Hide recipients"
                    ref={collapseInlineReplyFieldsButtonRef}
                    onClick={closeInlineReplyFields}
                    className="rounded-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ChevronDownIcon className="size-3 rotate-180" />
                  </button>
                )}
                {field === "to" && canToggleCcBcc && (
                  <button
                    type="button"
                    aria-expanded={showCcBcc}
                    aria-label={
                      showCcBcc ? "Hide Cc and Bcc" : "Show Cc and Bcc"
                    }
                    onClick={toggleCcBcc}
                    className="rounded-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ChevronDownIcon
                      className={cn("size-3", showCcBcc && "rotate-180")}
                    />
                  </button>
                )}
                {field === "to" && popOutButton}
              </div>
            ),
          )}
          <div className="pt-3">
            <Input
              type="text"
              name="subject"
              registerProps={subjectRegisterProps}
              error={subjectError}
              placeholder="Subject"
              className="h-8 rounded-none border-0 bg-transparent p-0 text-sm font-medium text-foreground shadow-none focus:border-transparent focus:ring-0 sm:text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}

const RECIPIENT_LABELS: Record<ComposeRecipientField, string> = {
  to: "To",
  cc: "Cc",
  bcc: "Bcc",
};

function ComposeFieldLabel({
  htmlFor,
  label,
}: {
  htmlFor: string;
  label: string;
}) {
  return (
    <label
      className="w-12 shrink-0 text-sm font-medium leading-5 text-foreground"
      htmlFor={htmlFor}
    >
      {label}
    </label>
  );
}

function formatAddressLabel(name: string | null | undefined, email: string) {
  return name ? `${name} (${email})` : email;
}

function splitFromOption(value: string) {
  const separator = value.indexOf(":");
  return [value.slice(0, separator), value.slice(separator + 1)] as const;
}
