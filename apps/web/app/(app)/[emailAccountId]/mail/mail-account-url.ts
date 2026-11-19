export function getMailAccountUrl(accountId: string, search: string) {
  const params = new URLSearchParams(search);
  const hasAccountScopedFilter =
    params.has("labelId") || params.has("folderId");
  params.delete("accountScope");
  params.delete("split");
  params.delete("thread-id");
  params.delete("thread-account-id");
  params.delete("side-panel-thread-id");
  // Setup state is per account, so the next account decides whether it shows.
  params.delete("setup");
  // A chat belongs to one account, so it cannot follow the user to another.
  params.delete("chatId");
  params.delete("labelId");
  params.delete("folderId");
  if (hasAccountScopedFilter) params.delete("type");
  const query = params.toString();
  return `/${accountId}/mail${query ? `?${query}` : ""}`;
}
