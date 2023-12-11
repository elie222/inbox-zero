import { toastSuccess, toastError } from "@/components/Toast";
import {
  createAutoArchiveFilterAction,
  trashThreadAction,
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
