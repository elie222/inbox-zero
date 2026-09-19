export type MailUiHost = {
  openSettings(): void;
  openAccount(accountId: string): void;
  compose(): void;
};
