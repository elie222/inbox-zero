# CLAUDE.md - Development Guidelines

## Local Deployment

### Docker Compose Setup

The application is deployed locally using Docker Compose with the following services:
- **PostgreSQL** database (port 5432)
- **Redis** cache (port 6380) 
- **Serverless Redis HTTP** proxy (port 8079)
- **Web** application (port 3000)
- **Cron** service for scheduled tasks

### Quick Commands

```bash
# Start/restart using the helper script (recommended)
./run-docker.sh

# Build from source and restart
docker compose build web
sudo systemctl restart inbox-zero

# Check service status
sudo systemctl status inbox-zero

# View logs
sudo journalctl -u inbox-zero -f

# Stop service
sudo systemctl stop inbox-zero
```

### SystemD Service

The application runs as a systemd service (`/etc/systemd/system/inbox-zero.service`):
- Auto-starts on boot
- Restarts on failure
- Working directory: `/home/jason/services/inbox-zero`
- Runs: `docker compose up --remove-orphans`

### Helper Script: run-docker.sh

The `run-docker.sh` script:
1. Sources environment variables from `apps/web/.env`
2. Runs `docker compose up -d` (or passes through custom arguments)
3. Provides environment validation

### Docker Configuration

- **docker-compose.yml**: Main compose configuration
- **docker/Dockerfile.prod**: Production Dockerfile
- Web service can use pre-built image (`ghcr.io/elie222/inbox-zero:latest`) or build from source
- Environment variables loaded from `apps/web/.env`

## Build & Test Commands

- Development: `pnpm dev`
- Build: `pnpm build`
- Lint: `pnpm lint`
- Run all tests: `pnpm test`
- Run AI tests: `pnpm test-ai`
- Run single test: `pnpm test __tests__/test-file.test.ts`
- Run specific AI test: `pnpm test-ai ai-categorize-senders`

## Code Style

- Use TypeScript with strict null checks
- Path aliases: Use `@/` for imports from project root
- NextJS app router structure with (app) directory
- Follow tailwindcss patterns with prettier-plugin-tailwindcss
- Prefer functional components with hooks
- Use proper error handling with try/catch blocks
- Format code with Prettier
- Consult .cursor/rules for environment variable management

## Component Guidelines

- Use shadcn/ui components when available
- Ensure responsive design with mobile-first approach
- Follow consistent naming conventions (PascalCase for components)
- Centralize types in dedicated type files when shared
- Use LoadingContent component for async data:
  ```tsx
  <LoadingContent loading={isLoading} error={error}>
    {data && <YourComponent data={data} />}
  </LoadingContent>
  ```

## Environment Variables

- Add to `.env.example`, `env.ts`, and `turbo.json`
- Client-side vars: Prefix with `NEXT_PUBLIC_`

## Fullstack Workflow

Complete guide for building features from API to UI, combining GET API routes, data fetching, form handling, and server actions.

### Overview

When building a new feature, follow this pattern:

1. **GET API Route** - For fetching data
2. **Server Action** - For mutations (create/update/delete)
3. **Data Fetching** - Using SWR on the client
4. **Form Handling** - Using React Hook Form with Zod validation

### 1. GET API Route

For fetching data. Always wrap with `withAuth` or `withEmailAccount`:

```typescript
// apps/web/app/api/user/example/route.ts
import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

// Auto-generate response type for client use
export type GetExampleResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount(async (request) => {
  const { emailAccountId } = request.auth;

  const result = await getData({ emailAccountId });
  return NextResponse.json(result);
});

// We make this its own function so we can infer the return type for a type-safe response on the client
async function getData({ emailAccountId }: { emailAccountId: string }) {
  const items = await prisma.example.findMany({
    where: { emailAccountId },
  });

  return { items };
}
```

### 2. Server Action

For mutations. Use `next-safe-action` with proper validation:

**Validation Schema** (`apps/web/utils/actions/example.validation.ts`):

```typescript
import { z } from "zod";

export const createExampleBody = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  description: z.string().optional(),
});
export type CreateExampleBody = z.infer<typeof createExampleBody>;

export const updateExampleBody = z.object({
  id: z.string(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  description: z.string().optional(),
});
export type UpdateExampleBody = z.infer<typeof updateExampleBody>;
```

**Server Action** (`apps/web/utils/actions/example.ts`):

```typescript
"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  createExampleBody,
  updateExampleBody,
} from "@/utils/actions/example.validation";
import prisma from "@/utils/prisma";
import { revalidatePath } from "next/cache";

export const createExampleAction = actionClient
  .metadata({ name: "createExample" })
  .schema(createExampleBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { name, email, description },
    }) => {
      const example = await prisma.example.create({
        data: {
          name,
          email,
          description,
          emailAccountId,
        },
      });

      revalidatePath("/examples");
      return example;
    },
  );

export const updateExampleAction = actionClient
  .metadata({ name: "updateExample" })
  .schema(updateExampleBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { id, name, email, description },
    }) => {
      const example = await prisma.example.update({
        where: { id, emailAccountId },
        data: { name, email, description },
      });

      revalidatePath("/examples");
      return example;
    },
  );
```

### 3. Data Fetching

Use SWR for client-side data fetching:

```typescript
import useSWR from "swr";
import { GetExampleResponse } from "@/app/api/user/example/route";

export function useExamples() {
  return useSWR<GetExampleResponse>("/api/user/example");
}
```

### 4. Form Handling

Use React Hook Form with Zod validation:

```typescript
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/Input";
import { Button } from "@/components/ui/button";
import { toastSuccess, toastError } from "@/components/Toast";
import { createExampleAction } from "@/utils/actions/example";
import { createExampleBody, type CreateExampleBody } from "@/utils/actions/example.validation";

export function ExampleForm({ onSuccess }: { onSuccess?: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CreateExampleBody>({
    resolver: zodResolver(createExampleBody),
  });

  const onSubmit: SubmitHandler<CreateExampleBody> = useCallback(
    async (data) => {
      const result = await createExampleAction(data);

      if (result?.serverError) {
        toastError({
          title: "Error creating example",
          description: result.serverError
        });
      } else {
        toastSuccess({ description: "Example created!" });
        reset();
        onSuccess?.();
      }
    },
    [reset, onSuccess]
  );

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <Input
        type="text"
        name="name"
        label="Name"
        registerProps={register("name")}
        error={errors.name}
      />
      <Input
        type="email"
        name="email"
        label="Email"
        registerProps={register("email")}
        error={errors.email}
      />
      <Input
        type="text"
        name="description"
        label="Description"
        registerProps={register("description")}
        error={errors.description}
      />
      <Button type="submit" loading={isSubmitting}>
        Create Example
      </Button>
    </form>
  );
}
```

### 5. Complete Data Fetching Component

```typescript
'use client';

import { useExamples } from "@/hooks/useExamples";
import { Button } from "@/components/ui/button";
import { LoadingContent } from "@/components/LoadingContent";

export function Examples() {
  const { data, isLoading, error } = useExamples();

  return (
    <LoadingContent loading={isLoading} error={error}>
      <div className="grid gap-4">
        {data?.examples.map((example) => (
          <div key={example.id} className="border p-4 rounded">
            <h3 className="font-semibold">{example.name}</h3>
            <p className="text-gray-600">{example.email}</p>
            {example.description && (
              <p className="text-sm text-gray-500">{example.description}</p>
            )}
          </div>
        ))}
      </div>
    </LoadingContent>
  );
}
```

### Key Guidelines

#### Authentication & Authorization

- Use `withAuth` for user-level operations
- Use `withEmailAccount` for email-account-level operations
- Server actions automatically get the right context

#### Mutations

- Use server actions for all mutations (create/update/delete operations)
- Do NOT use POST API routes for mutations - use server actions instead

#### Error Handling

- Use `result?.serverError` with `toastError` and `toastSuccess`
- `next-safe-action` provides centralized error handling
- No need for try/catch in GET routes when using middleware

#### Type Safety

- Export response types from GET routes
- Use Zod schemas for validation on both client and server
- Leverage TypeScript inference for better DX

#### Loading and Error States

- Use `LoadingContent` component to handle loading and error states consistently
- Pass `loading`, `error`, and children props to `LoadingContent`
- This provides a standardized way to show loading spinners and error messages

#### Performance

- Use SWR for efficient data fetching and caching
- Call `mutate()` after successful mutations to refresh data
- Use `revalidatePath` in server actions for cache invalidation

#### File Organization

```
apps/web/
├── app/api/user/example/route.ts          # GET API route
├── utils/actions/example.validation.ts    # Zod schemas
├── utils/actions/example.ts               # Server actions
├── hooks/useExamples.ts                   # SWR hook
└── components/ExampleForm.tsx             # Form component
```
