# @inboxzero/mail-core

Portable mailbox schemas, query semantics, command state, and the shared
engine API. This package has no React, DOM, SQL driver, or app-framework
dependencies.

## Exports

Import from a specific subpath. There is no barrel file.

```ts
import { createMailEngine } from "@inboxzero/mail-core/engine";
import { mailCommandSchema } from "@inboxzero/mail-core/commands";
```

Forbidden imports in this package: React, DOM globals, IndexedDB, Electron,
Expo, Next, Prisma, Redis, and Node-only modules.
