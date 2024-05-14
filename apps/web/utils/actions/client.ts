import { toastSuccess, toastError } from "@/components/Toast";
import {
  createAutoArchiveFilterAction,
  deleteFilterAction,
} from "@/utils/actions/mail";
import { trashMessageAction, trashThreadAction } from "@/utils/actions/mail";
import { archiveEmails } from "@/providers/QueueProvider";
import { sleep } from "@/utils/sleep";
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

let toastSuccesShown: boolean = true;
export async function onArchiveAll(
  fromEmail: string,
  threadsAdded: Set<string>,
) {
  try {
    //using isOperationInProgress to show beforeunload
    isOperationInProgress = true;
    // fetching the thread Id's
    const url: string = `/api/google/threads?fromEmail=${encodeURIComponent(
      fromEmail,
    )}`;
    const response = await fetch(url);
    const data = await response.json();
    // when all the threadId's have been succesfully added to threadList
    if (data && data?.threads?.length == 0 && toastSuccesShown) {
      toastSuccesShown = false;
      toastSuccess({ description: "All Emails Archived" });
    }
    if (data && data?.threads?.length > 0) {
      // making sure that unique threads are being passed in archiveEmails function each time
      const threads: string[] = [];
      data.threads.forEach((res: any) => {
        if (!threadsAdded.has(res.id)) {
          threads.push(res.id);
          threadsAdded.add(res.id);
        }
      });
      //  archiving mails
      await sleep(40);
      await archiveEmails(threads, () => {
        onArchiveAll(fromEmail, threadsAdded);
      });
    }
  } catch (error: any) {
    isOperationInProgress = false;
    toastError({
      description: `There was an error fetching data: ${error.message}`,
    });
  } finally {
    isOperationInProgress = false;
  }
}

let isOperationInProgress: boolean = false;
window.addEventListener("beforeunload", function (event) {
  if (isOperationInProgress) {
    const confirmationMessage =
      "Are you sure you want to leave? The operation is still in progress.";
    event.returnValue = confirmationMessage;
    return confirmationMessage;
  }
});
