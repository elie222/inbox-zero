export function getOriginalMessageId({
  references,
  inReplyTo,
}: {
  references?: string;
  inReplyTo?: string;
}): string | null {
  const referencesArray = references?.split(" ") || [];
  const allReferences = [...referencesArray, inReplyTo].filter(
    (id): id is string => !!id,
  );

  if (allReferences.length === 0) return null;

  // Get the last reference which should be the original message
  const originalMessageId = allReferences[allReferences.length - 1];

  return originalMessageId;
}
