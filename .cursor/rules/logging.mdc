---
description: How to do backend logging
globs: 
alwaysApply: false
---
# Logging

We use `createScopedLogger` to do logging:

```typescript
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("action/rules");

logger.log("Created rule", { userId });
```

Typically this will be added at the top of a file.
If we have a large function that reuses multiple variables we can do this within a function:

```typescript
const logger = createScopedLogger("action/rules").with({ userId: user.id });

// Can now call without passing userId:
logger.log("Created rule");
```

Don't use `.with()` for a global logger. Only use within a specific function.