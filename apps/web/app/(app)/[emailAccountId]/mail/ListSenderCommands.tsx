"use client";

import { useSenderCommands } from "@/app/(app)/[emailAccountId]/mail/use-sender-commands";
import type { ParsedMessage } from "@/utils/types";

export function ListSenderCommands({
  message,
}: {
  message: Pick<ParsedMessage, "headers" | "threadId"> | null;
}) {
  const { PremiumModal } = useSenderCommands(message);
  return <PremiumModal />;
}
