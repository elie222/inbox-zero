export type InboxZeroDesktopApi = {
  mailEngine: (payload: unknown) => Promise<unknown>;
  wipeMailbox: () => Promise<unknown>;
  openWindow?: (path: string) => Promise<unknown>;
};
