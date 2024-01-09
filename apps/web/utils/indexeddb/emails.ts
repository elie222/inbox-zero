import { gmail_v1 } from "googleapis";
import { EMAIL_STORE, getIdb } from "@/utils/indexeddb";

export async function getEmails() {
  return (await getIdb()).getAll(EMAIL_STORE);
}

export async function saveEmails(emails: gmail_v1.Schema$Thread[]) {
  if (!emails.length) return;

  const tx = (await getIdb()).transaction(EMAIL_STORE, "readwrite");

  await Promise.all([
    ...emails.map((email) => {
      return tx.store.add(email);
    }),
    tx.done,
  ]);
}
