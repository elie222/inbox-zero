"use client";

import { useEffect, useRef, useState } from "react";
import type { ReadComposeDraftResponse } from "@/app/api/user/drafts/route";
import type { DraftAttachment } from "@/utils/email/types";
import { fetchWithAccount } from "@/utils/fetch";
import type {
  ComposeAttachmentReference,
  StoredReplyDraft,
} from "@/utils/mail-engine/reply-drafts";
import { readComposeAttachmentBytes } from "./attachment-bytes";
import {
  fetchDraftAttachments,
  readDraftAttachmentBytes,
} from "./upload-draft-attachment";

export type LoadedComposeAttachment = ComposeAttachmentReference & {
  previewUrl?: string;
};

type LoadedDraftAttachments = {
  draftId?: string;
  attachments: LoadedComposeAttachment[];
};

const LOAD_TIMEOUT_MS = 8000;

/**
 * The files already on a compose session's mailbox draft. The mailbox is the
 * source of truth: the local draft only remembers references, and a reopened
 * draft (or one restored after undo) lists whatever the mailbox holds. When
 * the mailbox can't be reached the stored references are used as they are.
 */
export function useComposeDraftAttachments({
  emailAccountId,
  sessionKey,
  storedDraft,
  providerDraftMessageId,
  enabled,
}: {
  emailAccountId: string;
  /** Changes only when a different compose session mounts. */
  sessionKey: string;
  storedDraft?: StoredReplyDraft;
  providerDraftMessageId?: string;
  enabled: boolean;
}) {
  // Loaded once per compose session: Gmail moves an open draft to a new
  // message on every save, and reloading then would remount the composer.
  const key = enabled ? sessionKey : "";
  const inputs = useRef({
    emailAccountId,
    storedDraft,
    providerDraftMessageId,
  });
  inputs.current = { emailAccountId, storedDraft, providerDraftMessageId };
  const [loaded, setLoaded] = useState<{
    key: string;
    value: LoadedDraftAttachments;
  }>();
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const { emailAccountId, storedDraft, providerDraftMessageId } =
      inputs.current;
    loadDraftAttachments({
      emailAccountId,
      providerDraftId: storedDraft?.content?.providerDraftId,
      providerDraftMessageId,
      stored: (storedDraft?.content?.attachments ?? []).filter(
        (attachment) => attachment.providerAttachmentId,
      ),
    }).then((value) => {
      if (cancelled) {
        for (const attachment of value.attachments)
          if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
        return;
      }
      setLoaded({ key, value });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return {
    isLoading: Boolean(key && loaded?.key !== key),
    draftId: loaded?.key === key ? loaded.value.draftId : undefined,
    attachments: loaded?.key === key ? loaded.value.attachments : [],
  };
}

async function loadDraftAttachments({
  emailAccountId,
  providerDraftId,
  providerDraftMessageId,
  stored,
}: {
  emailAccountId: string;
  providerDraftId?: string;
  providerDraftMessageId?: string;
  stored: ComposeAttachmentReference[];
}): Promise<LoadedDraftAttachments> {
  const signal = AbortSignal.timeout(LOAD_TIMEOUT_MS);
  try {
    const draftId =
      providerDraftId ??
      (providerDraftMessageId
        ? await resolveDraftId(emailAccountId, providerDraftMessageId, signal)
        : undefined);
    if (!draftId)
      return { attachments: await withPreviews(emailAccountId, stored) };
    const listed = await fetchDraftAttachments({
      emailAccountId,
      draftId,
      signal,
    });
    if (!listed) return { draftId, attachments: [] };
    return {
      draftId,
      attachments: await withPreviews(
        emailAccountId,
        listed.attachments.map((attachment) =>
          fromDraftAttachment(attachment, stored),
        ),
        listed.attachments,
      ),
    };
  } catch {
    return {
      draftId: providerDraftId,
      attachments: await withPreviews(emailAccountId, stored),
    };
  }
}

async function resolveDraftId(
  emailAccountId: string,
  messageId: string,
  signal: AbortSignal,
) {
  const response = await fetchWithAccount({
    url: `/api/user/drafts?messageId=${encodeURIComponent(messageId)}`,
    emailAccountId,
    init: { cache: "no-store", signal },
  });
  if (!response.ok) return;
  const draft: ReadComposeDraftResponse = await response.json();
  return draft.draftId;
}

function fromDraftAttachment(
  attachment: DraftAttachment,
  stored: ComposeAttachmentReference[],
): ComposeAttachmentReference {
  // Outlook gives each file its own id, so the composer keeps the local id it
  // stored the bytes under. Gmail drafts carry the composer's id already.
  const local = stored.find(
    (reference) => reference.providerAttachmentId === attachment.id,
  );
  return {
    id: local?.id ?? attachment.id,
    providerAttachmentId: attachment.id,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: attachment.size,
    disposition: attachment.disposition,
    ...(attachment.contentId ? { contentId: attachment.contentId } : {}),
  };
}

async function withPreviews(
  emailAccountId: string,
  attachments: ComposeAttachmentReference[],
  listed: DraftAttachment[] = [],
): Promise<LoadedComposeAttachment[]> {
  return Promise.all(
    attachments.map(async (attachment) => {
      if (attachment.disposition !== "inline") return attachment;
      const source = listed.find(
        (item) => item.id === attachment.providerAttachmentId,
      );
      const bytes = await (source
        ? readDraftAttachmentBytes({
            emailAccountId,
            localId: attachment.id,
            source,
            size: attachment.size,
          })
        : readComposeAttachmentBytes(emailAccountId, attachment.id)
      ).catch(() => null);
      if (!bytes) return attachment;
      return {
        ...attachment,
        previewUrl: URL.createObjectURL(
          new Blob([bytes], { type: attachment.mimeType }),
        ),
      };
    }),
  );
}
