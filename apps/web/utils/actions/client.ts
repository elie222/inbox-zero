import { toastSuccess, toastError } from "@/components/Toast";
import {
  createAutoArchiveFilterAction,
  deleteFilterAction,
} from "@/utils/actions/mail";
import { trashMessageAction, trashThreadAction } from "@/utils/actions/mail";
import { isActionError } from "@/utils/error";

export async function onAutoArchive(from: string, gmailLabelId?: string) {
  const result = await createAutoArchiveFilterAction(from, gmailLabelId);

  if (isActionError(result)) {
    toastError({ description: result.error });
  } else {
    toastSuccess({ description: "Auto archive enabled!" });
  }
}

export async function onDeleteFilter(gmailLabelId: string) {
  try {
    await deleteFilterAction(gmailLabelId);
    toastSuccess({ description: "Auto archive disabled!" });
  } catch (error: any) {
    toastError({
      description: `There was an error deleting the filter to auto archive the emails: ${error.message}`,
    });
  }
}

export async function onTrashThread(threadId: string) {
  try {
    await trashThreadAction(threadId);
    toastSuccess({ description: "Thread deleted!" });
  } catch (error: any) {
    toastError({
      description: `There was an error deleting the thread: ${error.message}`,
    });
  }
}
export async function onTrashMessage(messageId: string) {
  try {
    await trashMessageAction(messageId);
    toastSuccess({ description: "Message deleted!" });
  } catch (error: any) {
    toastError({
      description: `There was an error deleting the message: ${error.message}`,
    });
  }
}
