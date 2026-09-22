import { SharedConversationReader } from "@/app/(app)/shared/[conversationId]/SharedConversationReader";

export default async function SharedConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return <SharedConversationReader conversationId={conversationId} />;
}
