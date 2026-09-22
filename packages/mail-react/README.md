# @inboxzero/mail-react

Thin `useSyncExternalStore` bindings for the mail engine facade. This package
does not own mailbox state, talk to providers, or import React DOM.

Peer dependency: React >= 19.2.

```ts
import { MailEngineProvider } from "@inboxzero/mail-react/MailEngineProvider";
import { useMailboxWindow } from "@inboxzero/mail-react/use-mailbox-window";
import { useDrafts } from "@inboxzero/mail-react/use-drafts";
import { useOutbox } from "@inboxzero/mail-react/use-outbox";
import { useAccounts } from "@inboxzero/mail-react/use-accounts";
import { useMailboxCatalog } from "@inboxzero/mail-react/use-mailbox-catalog";
```
