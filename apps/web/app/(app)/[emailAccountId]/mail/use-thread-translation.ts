"use client";

import { atom, useAtomValue, useSetAtom, useStore } from "jotai";
import { useCallback } from "react";
import { toast } from "sonner";
import { translateThreadAction } from "@/utils/actions/translate";
import { getActionErrorMessage } from "@/utils/error";

type ThreadTranslation = {
  loading: boolean;
  showOriginal: boolean;
  subject?: string;
  messages: Record<string, { text: string; sourceLanguage: string | null }>;
};

/** Translations live for the session; reopening a thread shows them again. */
const threadTranslationsAtom = atom<Record<string, ThreadTranslation>>({});

const EMPTY_TRANSLATION: ThreadTranslation = {
  loading: false,
  showOriginal: false,
  messages: {},
};

const MAX_MESSAGES = 19;

export function useThreadTranslation(
  emailAccountId: string,
  threadId: string | null | undefined,
) {
  const translations = useAtomValue(threadTranslationsAtom);
  return threadId
    ? translations[getThreadKey(emailAccountId, threadId)]
    : undefined;
}

/**
 * Translates the thread into the browser's language, or flips between the
 * translation and the original once every message has one.
 */
export function useTranslateThread() {
  const store = useStore();
  const setTranslations = useSetAtom(threadTranslationsAtom);

  return useCallback(
    async ({
      emailAccountId,
      threadId,
      messageIds,
    }: {
      emailAccountId: string;
      threadId: string;
      messageIds: string[];
    }) => {
      const key = getThreadKey(emailAccountId, threadId);
      const update = (
        change: (translation: ThreadTranslation) => ThreadTranslation,
      ) =>
        setTranslations((translations) => ({
          ...translations,
          [key]: change(translations[key] ?? EMPTY_TRANSLATION),
        }));
      const existing = store.get(threadTranslationsAtom)[key];
      if (existing?.loading) return;

      const missingIds = messageIds.filter((id) => !existing?.messages[id]);
      if (existing && !missingIds.length) {
        update((current) => ({
          ...current,
          showOriginal: !current.showOriginal,
        }));
        return;
      }

      update((current) => ({
        ...current,
        loading: true,
      }));

      const targetLanguage = getTargetLanguage();
      const result = await translateThreadAction(emailAccountId, {
        messageIds: missingIds.slice(-MAX_MESSAGES),
        targetLanguage,
      });
      const data = result?.data;

      if (!data) {
        toast.error(
          getActionErrorMessage(result, "Couldn't translate this email"),
        );
        update((current) => ({
          ...current,
          loading: false,
        }));
        return;
      }

      if (
        data.messages.every(
          (message) =>
            !isForeignLanguage(message.sourceLanguage, targetLanguage),
        )
      ) {
        toast.info(
          `Already in ${getLanguageName(targetLanguage) ?? "your language"}`,
        );
      }

      update((current) => ({
        loading: false,
        showOriginal: false,
        subject: data.subject || current.subject,
        messages: {
          ...current.messages,
          ...Object.fromEntries(
            data.messages.map(({ id, text, sourceLanguage }) => [
              id,
              { text, sourceLanguage },
            ]),
          ),
        },
      }));
    },
    [store, setTranslations],
  );
}

/**
 * The translation to show in place of a message body, or null for the
 * original: messages already in the reader's language are left as written.
 */
export function getMessageTranslation(
  translation: ThreadTranslation | undefined,
  messageId: string,
) {
  const message = translation?.messages[messageId];
  if (!message) return null;
  if (!isForeignLanguage(message.sourceLanguage, getTargetLanguage())) {
    return null;
  }

  return {
    text: message.text,
    languageName: getLanguageName(message.sourceLanguage),
    showOriginal: translation.showOriginal,
  };
}

function getThreadKey(emailAccountId: string, threadId: string) {
  return `${emailAccountId}:${threadId}`;
}

function getTargetLanguage() {
  return navigator.language || "en";
}

function isForeignLanguage(
  sourceLanguage: string | null,
  targetLanguage: string,
) {
  if (!sourceLanguage) return false;
  return getBaseLanguage(sourceLanguage) !== getBaseLanguage(targetLanguage);
}

function getBaseLanguage(language: string) {
  return language.split("-")[0].toLowerCase();
}

function getLanguageName(language: string | null) {
  if (!language) return null;
  try {
    return (
      new Intl.DisplayNames([getTargetLanguage()], { type: "language" }).of(
        language,
      ) ?? null
    );
  } catch {
    return null;
  }
}
