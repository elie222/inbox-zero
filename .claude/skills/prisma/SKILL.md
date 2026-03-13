---
name: prisma
description: How to use Prisma
---
# Prisma Usage

We use PostgreSQL with Prisma 7.

## Imports

```typescript
// Prisma client instance
import prisma from "@/utils/prisma";

// Enums (NOT from @prisma/client)
import { ActionType, SystemType } from "@/generated/prisma/enums";

// Types (NOT from @prisma/client)
import type { Rule, PrismaClient } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
```

Never import from `@prisma/client` — always use `@/generated/prisma/enums` and `@/generated/prisma/client`.

Schema: `apps/web/prisma/schema.prisma`
