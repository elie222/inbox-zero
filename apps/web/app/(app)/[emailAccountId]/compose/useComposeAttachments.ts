import {
  detectInlineImageMimeType,
  type EmailAttachmentMetadata,
  validateEmailAttachmentMetadata,
} from "@inboxzero/email-editor/core";
import type { EmailEditorHandle } from "@inboxzero/email-editor/web";
import {
  type ChangeEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { toastError } from "@/components/Toast";
import type { DraftAttachment } from "@/utils/email/types";
import { randomUuid } from "@/utils/uuid";
import type { ReplyingToEmail } from "./ComposeEmailForm";
import {
  type ComposeAttachment,
  mergeDraftAttachments,
  toAttachmentMetadata,
} from "./compose-attachments";
import { enqueueDraftOperation } from "./draft-operation-queue";
import {
  forgetAttachedFiles,
  removeDraftAttachment,
  uploadDraftAttachment,
} from "./upload-draft-attachment";
import type { useComposeDraft } from "./useComposeDraft";

export function useComposeAttachments({
  draft,
  emailAccountId,
  editorRef,
  isSubmitting,
  replyingToEmail,
}: {
  draft: ReturnType<typeof useComposeDraft>;
  emailAccountId: string;
  editorRef: RefObject<EmailEditorHandle | null>;
  isSubmitting: boolean;
  replyingToEmail?: ReplyingToEmail;
}) {
  const {
    attachmentsRef,
    draftQueueKey,
    ensureProviderDraft,
    followDraftMessage,
    providerDraftId,
    updateAttachments,
  } = draft;
  // Set once a reply or forward has put files on a mailbox draft. A forward's
  // draft then holds the forwarded files and lists them with the others.
  const [savedToMailbox, setSavedToMailbox] = useState(
    Boolean(providerDraftId.current),
  );
  const forwardedAttachments = savedToMailbox
    ? []
    : (replyingToEmail?.forwardedAttachments ?? []);
  const isMountedRef = useRef(true);

  // After each change the mailbox's list is the truth for files on the draft.
  // This keeps running after the composer closes, so the local draft still
  // records uploads that finish later.
  const reconcileDraftAttachments = (
    listed: DraftAttachment[],
    current = attachmentsRef.current,
  ) => updateAttachments(mergeDraftAttachments(current, listed));

  const uploadComposeAttachment = (file: File, attachment: ComposeAttachment) =>
    enqueueDraftOperation(draftQueueKey, async () => {
      const isAttached = () =>
        attachmentsRef.current.some((item) => item.id === attachment.id);
      if (!isAttached()) return;
      const draftId = await ensureProviderDraft();
      const result = await uploadDraftAttachment({
        emailAccountId,
        draftId,
        file,
        attachment: toAttachmentMetadata(attachment),
      });
      await followDraftMessage(result.messageId);
      if (isAttached()) return result;
      // Removed while uploading: take it back off the draft.
      const removed = await removeDraftAttachment({
        emailAccountId,
        draftId,
        attachmentId: result.attachmentId,
      });
      await followDraftMessage(removed.messageId);
    }).then(
      (result) => {
        if (!result) return;
        setSavedToMailbox(true);
        reconcileDraftAttachments(
          result.attachments,
          attachmentsRef.current.map((item) =>
            item.id === attachment.id
              ? {
                  ...item,
                  status: "uploaded",
                  draftAttachmentId: result.attachmentId,
                }
              : item,
          ),
        );
      },
      (error: unknown) => {
        const description =
          error instanceof Error
            ? error.message
            : `Could not attach ${attachment.filename}.`;
        toastError({ description });
        updateAttachments(
          attachmentsRef.current.map((item) =>
            item.id === attachment.id
              ? { ...item, status: "failed", error: description }
              : item,
          ),
        );
      },
    );

  const detachAttachment = (attachment: ComposeAttachment) => {
    revokePreview(attachment);
    updateAttachments(
      attachmentsRef.current.filter(
        (candidate) => candidate.id !== attachment.id,
      ),
    );
    forgetAttachedFiles(emailAccountId, [attachment.id]);
    const draftId = providerDraftId.current;
    const { draftAttachmentId } = attachment;
    // Uploads still running take the file back off the draft when they end.
    if (attachment.status !== "uploaded" || !draftAttachmentId || !draftId)
      return;
    enqueueDraftOperation(draftQueueKey, () =>
      removeDraftAttachment({
        emailAccountId,
        draftId,
        attachmentId: draftAttachmentId,
      }),
    ).then(
      async (result) => {
        await followDraftMessage(result.messageId);
        reconcileDraftAttachments(result.attachments);
      },
      (error: unknown) => {
        toastError({
          description:
            error instanceof Error
              ? error.message
              : `Could not remove ${attachment.filename}.`,
        });
        updateAttachments([
          ...attachmentsRef.current,
          { ...attachment, previewUrl: undefined, managed: false },
        ]);
      },
    );
  };

  const removeUnusedInlineAttachments = (contentIds: string[]) => {
    const referencedIds = new Set(contentIds);
    for (const attachment of attachmentsRef.current) {
      if (
        attachment.managed &&
        attachment.disposition === "inline" &&
        attachment.contentId &&
        !referencedIds.has(attachment.contentId)
      )
        detachAttachment(attachment);
    }
  };

  const addFiles = async (
    files: File[],
    disposition: ComposeAttachment["disposition"],
  ) => {
    if (isSubmitting) return;
    const created = files.map((file) => {
      const attachment: ComposeAttachment = {
        ...createComposeAttachmentMetadata(file, disposition),
        status: "uploading",
      };
      return { file, attachment };
    });
    const validation = validateEmailAttachmentMetadata([
      ...attachmentsRef.current.filter((item) => item.status !== "failed"),
      ...created.map(({ attachment }) => attachment),
    ]);
    if (!validation.valid) {
      toastError({ description: validation.error });
      return;
    }
    if (disposition === "inline") {
      for (const { file } of created) {
        if (!(await isInlineImageContent(file))) {
          toastError({
            description: "Inline image content does not match its file type.",
          });
          return;
        }
      }
      if (!isMountedRef.current) return;
    }

    const accepted = created.filter(({ file, attachment }) => {
      if (disposition !== "inline" || !attachment.contentId) return true;
      attachment.previewUrl = URL.createObjectURL(file);
      attachment.managed = true;
      const inserted = editorRef.current?.insertInlineImage({
        alt: attachment.filename,
        contentId: attachment.contentId,
        previewUrl: attachment.previewUrl,
      });
      if (inserted) return true;
      revokePreview(attachment);
      return false;
    });
    if (accepted.length !== created.length) {
      toastError({
        description: "One of the inline images could not be inserted.",
      });
    }
    if (!accepted.length) return;
    updateAttachments([
      ...attachmentsRef.current,
      ...accepted.map(({ attachment }) => attachment),
    ]);
    await Promise.all(
      accepted.map(({ file, attachment }) =>
        uploadComposeAttachment(file, attachment),
      ),
    );
  };

  const removeAttachment = (attachment: ComposeAttachment) => {
    // Detached first, so the editor change this causes finds nothing to remove.
    detachAttachment(attachment);
    if (attachment.contentId && attachment.managed) {
      editorRef.current?.removeInlineImage(attachment.contentId);
    }
  };

  const handleFileInput =
    (disposition: ComposeAttachment["disposition"]) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (files.length) {
        addFiles(files, disposition).catch(() =>
          toastError({ description: "One of the files could not be read." }),
        );
      }
    };

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      const previews = [...attachmentsRef.current];
      setTimeout(() => {
        if (!isMountedRef.current)
          for (const attachment of previews) revokePreview(attachment);
      }, 0);
    };
  }, [attachmentsRef]);

  return {
    forwardedAttachments,
    addFiles,
    removeAttachment,
    removeUnusedInlineAttachments,
    handleFileInput,
  };
}

function createComposeAttachmentMetadata(
  file: File,
  disposition: ComposeAttachment["disposition"],
): EmailAttachmentMetadata {
  const id = randomUuid();
  return {
    id,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    disposition,
    ...(disposition === "inline"
      ? {
          contentId: `${id}@inboxzero.local`,
        }
      : {}),
  };
}

async function isInlineImageContent(file: File) {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  let binary = "";
  for (const byte of header) binary += String.fromCharCode(byte);
  return detectInlineImageMimeType(btoa(binary)) === file.type;
}

function revokePreview(attachment: ComposeAttachment) {
  if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
}
