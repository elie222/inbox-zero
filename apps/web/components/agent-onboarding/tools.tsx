"use client";

import { useState } from "react";
import {
  MailIcon,
  SearchIcon,
  ArchiveIcon,
  TagIcon,
  SendIcon,
  SettingsIcon,
  FileTextIcon,
  CheckIcon,
  XIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils";

function ToolCard({ children }: { children: React.ReactNode }) {
  return <Card className="mb-4 space-y-3 p-4">{children}</Card>;
}

function ToolCardHeader({
  icon: Icon,
  title,
  status,
  actions,
}: {
  icon: React.ElementType;
  title: React.ReactNode;
  status?: "loading" | "complete" | "action-required";
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h3 className="font-medium">{title}</h3>
        {status === "loading" && (
          <Badge variant="secondary" className="text-xs">
            Running...
          </Badge>
        )}
        {status === "complete" && (
          <Badge
            variant="secondary"
            className="bg-green-100 text-xs text-green-700"
          >
            Complete
          </Badge>
        )}
        {status === "action-required" && (
          <Badge
            variant="secondary"
            className="bg-amber-100 text-xs text-amber-700"
          >
            Action Required
          </Badge>
        )}
      </div>
      {actions}
    </div>
  );
}

export interface SearchInboxResult {
  query: string;
  results: Array<{
    id: string;
    subject: string;
    from: string;
    date: string;
    snippet: string;
    isRead: boolean;
  }>;
  totalCount: number;
}

export function SearchInboxTool({
  input,
  output,
  isLoading,
}: {
  input: { query: string; maxResults?: number };
  output?: SearchInboxResult;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <ToolCard>
        <ToolCardHeader
          icon={SearchIcon}
          title={`Searching: "${input.query}"`}
          status="loading"
        />
      </ToolCard>
    );
  }

  if (!output) return null;

  return (
    <ToolCard>
      <ToolCardHeader
        icon={SearchIcon}
        title={`Found ${output.totalCount} emails for "${output.query}"`}
        status="complete"
      />
      <div className="space-y-2">
        {output.results.map((email) => (
          <div
            key={email.id}
            className={cn(
              "rounded-md border p-3",
              !email.isRead && "border-l-2 border-l-blue-500 bg-blue-50/50",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{email.subject}</span>
                  {!email.isRead && (
                    <Badge variant="secondary" className="text-xs">
                      Unread
                    </Badge>
                  )}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {email.from} · {email.date}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {email.snippet}
                </p>
              </div>
            </div>
          </div>
        ))}
        {output.totalCount > output.results.length && (
          <p className="text-center text-sm text-muted-foreground">
            Showing {output.results.length} of {output.totalCount} results
          </p>
        )}
      </div>
    </ToolCard>
  );
}

export interface ReadEmailResult {
  id: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
  labels: string[];
}

export function ReadEmailTool({
  input: _input,
  output,
  isLoading,
}: {
  input: { emailId: string };
  output?: ReadEmailResult;
  isLoading?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <ToolCard>
        <ToolCardHeader
          icon={MailIcon}
          title="Reading email..."
          status="loading"
        />
      </ToolCard>
    );
  }

  if (!output) return null;

  return (
    <ToolCard>
      <ToolCardHeader
        icon={MailIcon}
        title={output.subject}
        status="complete"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Collapse" : "Expand"}
          </Button>
        }
      />
      <div className="space-y-2 text-sm">
        <div className="flex gap-4 text-muted-foreground">
          <span>From: {output.from}</span>
          <span>To: {output.to}</span>
        </div>
        <div className="text-muted-foreground">{output.date}</div>
        {output.labels.length > 0 && (
          <div className="flex gap-1">
            {output.labels.map((label) => (
              <Badge key={label} variant="outline" className="text-xs">
                {label}
              </Badge>
            ))}
          </div>
        )}
        {expanded && (
          <div className="mt-2 whitespace-pre-wrap rounded-md bg-muted p-3">
            {output.body}
          </div>
        )}
      </div>
    </ToolCard>
  );
}

export interface ArchiveEmailsResult {
  archivedCount: number;
  emailIds: string[];
}

export function ArchiveEmailsTool({
  input,
  output,
  isLoading,
}: {
  input: { emailIds: string[]; reason?: string };
  output?: ArchiveEmailsResult;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <ToolCard>
        <ToolCardHeader
          icon={ArchiveIcon}
          title={`Archiving ${input.emailIds.length} emails...`}
          status="loading"
        />
      </ToolCard>
    );
  }

  if (!output) return null;

  return (
    <ToolCard>
      <ToolCardHeader
        icon={ArchiveIcon}
        title={`Archived ${output.archivedCount} emails`}
        status="complete"
      />
      {input.reason && (
        <p className="text-sm text-muted-foreground">{input.reason}</p>
      )}
    </ToolCard>
  );
}

export interface LabelEmailsResult {
  labeledCount: number;
  label: string;
}

export function LabelEmailsTool({
  input,
  output,
  isLoading,
}: {
  input: { emailIds: string[]; label: string };
  output?: LabelEmailsResult;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <ToolCard>
        <ToolCardHeader
          icon={TagIcon}
          title={`Applying label "${input.label}"...`}
          status="loading"
        />
      </ToolCard>
    );
  }

  if (!output) return null;

  return (
    <ToolCard>
      <ToolCardHeader
        icon={TagIcon}
        title={
          <>
            Applied{" "}
            <Badge variant="secondary" className="mx-1">
              {output.label}
            </Badge>{" "}
            to {output.labeledCount} emails
          </>
        }
        status="complete"
      />
    </ToolCard>
  );
}

export interface DraftReplyResult {
  draftId: string;
  to: string;
  subject: string;
  body: string;
}

export function DraftReplyTool({
  input: _input,
  output,
  isLoading,
  onViewDraft,
}: {
  input: { emailId: string; instructions?: string };
  output?: DraftReplyResult;
  isLoading?: boolean;
  onViewDraft?: (draftId: string) => void;
}) {
  if (isLoading) {
    return (
      <ToolCard>
        <ToolCardHeader
          icon={FileTextIcon}
          title="Drafting reply..."
          status="loading"
        />
      </ToolCard>
    );
  }

  if (!output) return null;

  return (
    <ToolCard>
      <ToolCardHeader
        icon={FileTextIcon}
        title="Draft created"
        status="complete"
        actions={
          onViewDraft && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewDraft(output.draftId)}
            >
              <ExternalLinkIcon className="mr-1 size-3" />
              View Draft
            </Button>
          )
        }
      />
      <div className="rounded-md bg-muted p-3 text-sm">
        <div className="mb-2 text-muted-foreground">
          To: {output.to}
          <br />
          Subject: {output.subject}
        </div>
        <div className="whitespace-pre-wrap">{output.body}</div>
      </div>
    </ToolCard>
  );
}

export interface SendReplyInput {
  emailId: string;
  body: string;
  to: string;
  subject: string;
}

export function SendReplyTool({
  input,
  onApprove,
  onDeny,
  isPending,
}: {
  input: SendReplyInput;
  onApprove: () => void;
  onDeny: () => void;
  isPending?: boolean;
}) {
  return (
    <ToolCard>
      <ToolCardHeader
        icon={SendIcon}
        title="Confirm: Send this reply?"
        status="action-required"
      />
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
        <div className="mb-2 text-muted-foreground">
          To: {input.to}
          <br />
          Subject: {input.subject}
        </div>
        <div className="whitespace-pre-wrap">{input.body}</div>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onDeny}
          disabled={isPending}
        >
          <XIcon className="mr-1 size-3" />
          Don't Send
        </Button>
        <Button size="sm" onClick={onApprove} disabled={isPending}>
          <CheckIcon className="mr-1 size-3" />
          Send Reply
        </Button>
      </div>
    </ToolCard>
  );
}

export interface UpdateSettingsInput {
  settings: Array<{
    key: string;
    label: string;
    description?: string;
    currentValue: boolean;
    newValue: boolean;
  }>;
}

export function UpdateSettingsTool({
  input,
  onConfirm,
  onCancel,
  isPending,
}: {
  input: UpdateSettingsInput;
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
}) {
  const changedSettings = input.settings.filter(
    (s) => s.currentValue !== s.newValue,
  );

  return (
    <ToolCard>
      <ToolCardHeader
        icon={SettingsIcon}
        title="Confirm: Update settings?"
        status="action-required"
      />
      <div className="space-y-3">
        {changedSettings.map((setting) => (
          <div
            key={setting.key}
            className="flex items-center justify-between rounded-md border p-3"
          >
            <div>
              <div className="font-medium">{setting.label}</div>
              {setting.description && (
                <div className="text-sm text-muted-foreground">
                  {setting.description}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-sm",
                  setting.currentValue
                    ? "text-green-600"
                    : "text-muted-foreground",
                )}
              >
                {setting.currentValue ? "On" : "Off"}
              </span>
              <span className="text-muted-foreground">→</span>
              <span
                className={cn(
                  "text-sm font-medium",
                  setting.newValue ? "text-green-600" : "text-muted-foreground",
                )}
              >
                {setting.newValue ? "On" : "Off"}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button size="sm" onClick={onConfirm} disabled={isPending}>
          <CheckIcon className="mr-1 size-3" />
          Confirm Changes
        </Button>
      </div>
    </ToolCard>
  );
}

export function EnableSendingTool({
  onEnable,
  onSkip,
  isPending,
}: {
  onEnable: () => void;
  onSkip: () => void;
  isPending?: boolean;
}) {
  return (
    <ToolCard>
      <ToolCardHeader
        icon={SendIcon}
        title="Enable email sending?"
        status="action-required"
      />
      <p className="text-sm text-muted-foreground">
        Sending emails on your behalf is disabled by default for safety. Would
        you like to enable it?
      </p>
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
        <strong>What this means:</strong>
        <ul className="mt-1 list-inside list-disc space-y-1 text-muted-foreground">
          <li>The assistant can send replies after you approve them</li>
          <li>You'll always see a confirmation before anything is sent</li>
          <li>You can disable this at any time</li>
        </ul>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onSkip}
          disabled={isPending}
        >
          Not Now
        </Button>
        <Button size="sm" onClick={onEnable} disabled={isPending}>
          <CheckIcon className="mr-1 size-3" />
          Enable Sending
        </Button>
      </div>
    </ToolCard>
  );
}
