"use client";

import { useEffect, useRef, useState } from "react";
import type { StoredReplyDraft } from "@/utils/mail-engine/reply-drafts";
import {
  type ComposeAttachment,
  mergeDraftAttachments,
} from "./compose-attachments";
import {
  fetchDraftAttachments,
  readDraftAttachmentBytes,
  resolveDraftId,
} from "./upload-draft-attachment";

type LoadedDraftAttachments = {
  draftId?: string;
  /** Set when the mailbox draft no longer exists. */
  draftMissing?: boolean;
  attachments: ComposeAttachment[];
};

const LOAD_TIMEOUT_MS = 8000;

/**
 * The files already on a compose session's mailbox draft. The mailbox is the
 * source of truth; the local draft only remembers references, which are used
 * as they are when the mailbox can't be reached in time.
 */
export function useComposeDraftAttachments({
  emailAccountId,
  sessionKey,
  storedDraft,
  providerDraftMessageId,
  loadMailboxDraft,
  enabled,
}: {
  emailAccountId: string;
  /** Changes only when a different compose session mounts. */
  sessionKey: string;
  storedDraft?: StoredReplyDraft;
  providerDraftMessageId?: string;
  /** An opened mailbox draft whose files should be listed. */
  loadMailboxDraft: boolean;
  enabled: boolean;
}) {
  // Loaded once per compose session: Gmail moves an open draft to a new
  // message on every save, and reloading then would remount the composer.
  // A send restored for editing keeps only its mailbox draft, not the list of
  // files on it, so any session with a mailbox draft asks the mailbox.
  const needed =
    enabled &&
    (loadMailboxDraft || Boolean(storedDraft?.content?.providerDraftId));
  const key = needed ? sessionKey : "";
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
    loadDraftAttachments(inputs.current).then((value) => {
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
  const value = loaded?.key === key ? loaded.value : undefined;
  return {
    isLoading: Boolean(key && !value),
    draftId: value?.draftId,
    draftMissing: value?.draftMissing ?? false,
    attachments: value?.attachments ?? [],
  };
}

async function loadDraftAttachments({
  emailAccountId,
  storedDraft,
  providerDraftMessageId,
}: {
  emailAccountId: string;
  storedDraft?: StoredReplyDraft;
  providerDraftMessageId?: string;
}): Promise<LoadedDraftAttachments> {
  const stored: ComposeAttachment[] = (
    storedDraft?.content?.attachments ?? []
  ).map((attachment) => ({ ...attachment, status: "uploaded" }));
  let draftId = storedDraft?.content?.providerDraftId;
  const signal = AbortSignal.timeout(LOAD_TIMEOUT_MS);
  try {
    if (!draftId && providerDraftMessageId)
      draftId = await resolveDraftId({
        emailAccountId,
        messageId: providerDraftMessageId,
        signal,
      });
    if (!draftId) return { attachments: stored };
    const listed = await fetchDraftAttachments({
      emailAccountId,
      draftId,
      signal,
    });
    if (!listed) return { draftMissing: true, attachments: [] };
    const attachments = mergeDraftAttachments(stored, listed.attachments);
    // Previews only replace images in HTML the composer already edited.
    if (storedDraft?.content?.draft.mode !== "edited")
      return { draftId, attachments };
    for (const attachment of attachments) {
      const source = listed.attachments.find(
        (item) => item.id === attachment.draftAttachmentId,
      );
      if (attachment.disposition !== "inline" || !source) continue;
      const bytes = await readDraftAttachmentBytes({
        emailAccountId,
        attachmentId: attachment.id,
        source,
        size: attachment.size,
        signal,
      }).catch(() => null);
      if (bytes)
        attachment.previewUrl = URL.createObjectURL(
          new Blob([bytes], { type: attachment.mimeType }),
        );
    }
    return { draftId, attachments };
  } catch {
    return { draftId, attachments: stored };
  }
}
