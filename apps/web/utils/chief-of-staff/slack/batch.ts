export function shouldUseBatchMode(emailCount: number): boolean {
  return emailCount >= 3;
}
