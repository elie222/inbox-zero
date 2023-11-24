import { toastSuccess, toastError } from "@/components/Toast";
import { createAutoArchiveFilterAction } from "@/utils/actions";

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
