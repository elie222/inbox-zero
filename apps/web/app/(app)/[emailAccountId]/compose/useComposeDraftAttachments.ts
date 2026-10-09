"use client";

import { useEffect, useRef, useState } from "react";
import type { ReadComposeDraftResponse } from "@/app/api/user/drafts/route";
import { fetchWithAccount } from "@/utils/fetch";
import type { StoredReplyDraft } from "@/utils/mail-engine/reply-drafts";
import {
  type ComposeAttachment,
  mergeDraftAttachments,
} from "./compose-attachments";
import {
  fetchDraftAttachments,
  readDraftAttachmentBytes,
} from "./upload-draft-attachment";

type LoadedDraftAttachments = {
  draftId?: string;
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
  return {
    isLoading: Boolean(key && loaded?.key !== key),
    draftId: loaded?.key === key ? loaded.value.draftId : undefined,
    attachments: loaded?.key === key ? loaded.value.attachments : [],
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
      draftId = await resolveDraftId(
        emailAccountId,
        providerDraftMessageId,
        signal,
      );
    if (!draftId) return { attachments: stored };
    const listed = await fetchDraftAttachments({
      emailAccountId,
      draftId,
      signal,
    });
    if (!listed) return { draftId, attachments: [] };
    const attachments = mergeDraftAttachments(stored, listed.attachments);
    for (const attachment of attachments) {
      const source = listed.attachments.find(
        (item) => item.id === attachment.providerAttachmentId,
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
