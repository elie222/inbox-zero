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

export function unownedAccountRedirectUrl({
  pathname,
  routeAccountId,
  ownedRouteId,
  fallbackAccountId,
  tab,
}: {
  pathname: string;
  routeAccountId: string | undefined;
  ownedRouteId: string | null;
  fallbackAccountId: string | undefined;
  tab: string | null;
}) {
  if (ownedRouteId || !routeAccountId || !fallbackAccountId) return null;
  const next = getAccountSwitchUrl({
    pathname,
    currentAccountId: routeAccountId,
    targetAccountId: fallbackAccountId,
    tab,
  });
  const current = getAccountSwitchUrl({
    pathname,
    currentAccountId: routeAccountId,
    targetAccountId: routeAccountId,
    tab,
  });
  return next === current ? null : next;
}
