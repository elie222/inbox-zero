interface CalendarConnectionState {
  isConnected: boolean;
}

export function hasConnectedCalendar(
  connections: readonly CalendarConnectionState[] | undefined,
): boolean {
  return connections?.some((connection) => connection.isConnected) ?? false;
}
