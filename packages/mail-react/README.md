# @inboxzero/mail-react

Thin `useSyncExternalStore` bindings for the mail engine facade. This package
does not own mailbox state, talk to providers, or import React DOM.

Peer dependency: React >= 19.2.

```ts
import { MailEngineProvider } from "@inboxzero/mail-react/MailEngineProvider";
import { useMailboxWindow } from "@inboxzero/mail-react/use-mailbox-window";
import { useConversation } from "@inboxzero/mail-react/use-conversation";
import { useOperation } from "@inboxzero/mail-react/use-operation";
```
