import { toastSuccess, toastError } from "@/components/Toast";
import {
  createAutoArchiveFilterAction,
  deleteFilterAction,
  trashThreadAction,
  unMarkReadAction,
  markReadAction,
} from "@/utils/actions";

export async function onAutoArchive(from: string, gmailLabelId?: string) {
  try {
    await createAutoArchiveFilterAction(from, gmailLabelId);
    toastSuccess({ description: "Auto archive enabled!" });
  } catch (error: any) {
    toastError({
      description: `There was an error creating the filter to auto archive the emails: ${error.message}`,
    });
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

export async function onMarkUnmarkReadAction(
  threadId: string,
  isRead?: boolean,
) {
  try {
    if (isRead) {
      await unMarkReadAction(threadId);
      toastSuccess({ description: "Marked Unread!" });
    } else {
      await markReadAction(threadId);
      toastSuccess({ description: "Marked Read!" });
    }
  } catch (error: any) {
    toastError({
      description: `There was an error while marking mail: ${error.message}`,
    });
  }
}
