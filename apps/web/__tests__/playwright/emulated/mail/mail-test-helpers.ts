import { expect, type Locator, type Page } from "@playwright/test";
import { getEmailAccountId } from "../account-test-helpers";

export async function openMail(page: Page) {
  const emailAccountId = await getEmailAccountId(page);
  await page.goto(`/${emailAccountId}/mail`);

  const conversations = page.getByRole("listbox", { name: "Conversations" });
  await expect(conversations).toBeVisible({ timeout: 60_000 });

  return { conversations, emailAccountId };
}

export function conversationWithSubject(
  page: Page,
  conversations: Locator,
  subject: string,
) {
  return conversations
    .getByRole("option")
    .filter({ has: page.getByText(subject, { exact: true }) });
}

export async function readLatestMailMutation(
  page: Page,
  expected: {
    emailAccountId: string;
    kind: string;
    sender?: string;
    threadId?: string;
  },
) {
  try {
    return await page.evaluate(
      async (match) =>
        await new Promise<Record<string, unknown> | undefined>(
          (resolve, reject) => {
            const openRequest = indexedDB.open("inbox-zero-email-cache");
            openRequest.onerror = () => reject(openRequest.error);
            openRequest.onsuccess = () => {
              const database = openRequest.result;
              if (!database.objectStoreNames.contains("mailMutations")) {
                database.close();
                resolve(undefined);
                return;
              }
              const transaction = database.transaction(
                "mailMutations",
                "readonly",
              );
              transaction.onerror = () => reject(transaction.error);
              const request = transaction.objectStore("mailMutations").getAll();
              request.onerror = () => reject(request.error);
              request.onsuccess = () => {
                database.close();
                resolve(
                  request.result
                    .filter(
                      (mutation) =>
                        mutation.emailAccountId === match.emailAccountId &&
                        mutation.kind === match.kind &&
                        (!match.threadId ||
                          mutation.threadId === match.threadId) &&
                        (!match.sender ||
                          mutation.clientSource?.sender === match.sender),
                    )
                    .sort((left, right) => right.createdAt - left.createdAt)[0],
                );
              };
            };
          },
        ),
      expected,
    );
  } catch (error) {
    if (String(error).includes("Execution context was destroyed")) return;
    throw error;
  }
}

export function clearMailMutations(
  page: Page,
  expected: { emailAccountId: string; threadId?: string },
) {
  return page.evaluate(
    async (match) =>
      await new Promise<void>((resolve, reject) => {
        const openRequest = indexedDB.open("inbox-zero-email-cache");
        openRequest.onerror = () => reject(openRequest.error);
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          if (!database.objectStoreNames.contains("mailMutations")) {
            database.close();
            resolve();
            return;
          }
          const transaction = database.transaction(
            "mailMutations",
            "readwrite",
          );
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          const request = transaction.objectStore("mailMutations").openCursor();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return;
            const mutation = cursor.value;
            if (
              mutation.emailAccountId === match.emailAccountId &&
              (!match.threadId || mutation.threadId === match.threadId)
            ) {
              cursor.delete();
            }
            cursor.continue();
          };
        };
      }),
    expected,
  );
}
