export function getAccountSwitchUrl({
  pathname,
  currentAccountId,
  targetAccountId,
  tab,
}: {
  pathname: string;
  currentAccountId: string | undefined;
  targetAccountId: string;
  tab: string | null;
}) {
  const segments = pathname.split("?")[0].split("/").filter(Boolean);
  if (currentAccountId && segments[0] === currentAccountId) {
    segments[0] = targetAccountId;
  }
  const query = tab ? `?${new URLSearchParams({ tab })}` : "";
  return `/${segments.join("/")}${query}`;
}
