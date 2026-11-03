// The account's own signature in the list composers choose from.
export const DEFAULT_SIGNATURE_ID = "default";

export function getSignatureSuggestionsHintId(emailAccountId: string) {
  return `signature-suggestions:${emailAccountId}`;
}
