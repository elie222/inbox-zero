# @inboxzero/mail-ui

Shared React DOM mail presentation for the Next mail route and the locally
bootable desktop renderer. This package is not a mobile dependency.

`MailProductFrame`, `MailThreadRow`, `MailReaderToolbar`, and `MailReaderSurface`
accept display data and callbacks without depending on an engine, API, router,
or host bridge. Import them directly from their exported file paths. `MailApp`
is the separate engine-connected controller used by the local desktop renderer.

`getMailSidebarRowPresentation` returns the sidebar row classes and content.
Calling it directly preserves the existing React tree and DOM; hosts retain
their own navigation and tooltip wrappers.

Keep host-specific state, fetching, synchronization, and SDKs in host adapters.
Preserve existing row memoization and virtualized list boundaries when extracting
further presentation.
