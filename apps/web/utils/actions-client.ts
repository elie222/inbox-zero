import { toastSuccess, toastError } from "@/components/Toast";
import {
  createAutoArchiveFilterAction,
  trashThreadAction,
} from "@/utils/actions";

export async function onAutoArchive(from: string) {
  try {
    await createAutoArchiveFilterAction(from);
    toastSuccess({ description: "Filter created!" });
  } catch (error: any) {
    toastError({
      description: `There was an error creating the filter: ${error.message}`,
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
