// Pins a full-screen app view (mail, contacts) to the visible viewport so
// its panes scroll internally instead of the page growing. On mobile use
// fixed positioning (tracks the real visual viewport even under iOS Safari
// page zoom, where svh/vh units over-report height), offset by the mobile
// chrome variables from globals.css — the same values the header and app
// tray are built from, so the panes can't slide under either. On desktop a
// viewport-unit height is reliable and respects the sidebar.
export function PinnedPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col overflow-hidden max-md:fixed max-md:inset-x-0 max-md:top-[var(--mobile-header-h)] max-md:bottom-[var(--mobile-tray-h)] md:h-[calc(100svh-2.25rem)]">
      {children}
    </div>
  );
}
