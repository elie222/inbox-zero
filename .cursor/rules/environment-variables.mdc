---
description: Add environment variable
globs: 
alwaysApply: false
---
# Environment Variables

This is how we add environment variables to the project:

  1. Add to `.env.example`:
      ```bash
      NEW_VARIABLE=value_example
      ```

  2. Add to `apps/web/env.ts`:
      ```typescript
      // For server-only variables
      server: {
        NEW_VARIABLE: z.string(),
      }
      // For client-side variables
      client: {
        NEXT_PUBLIC_NEW_VARIABLE: z.string(),
      }
      experimental__runtimeEnv: {
        NEXT_PUBLIC_NEW_VARIABLE: process.env.NEXT_PUBLIC_NEW_VARIABLE,
      }
      ```

  3. For client-side variables:
      - Must be prefixed with `NEXT_PUBLIC_`
      - Add to both `client` and `experimental__runtimeEnv` sections

  4. Add to `turbo.json` under `globalDependencies`:
      ```json
      {
        "tasks": {
          "build": {
            "env": [
              "NEW_VARIABLE"
            ]
          }
        }
      }
      ```

examples:
  - input: |
      # Adding a server-side API key
      # .env.example
      API_KEY=your_api_key_here

      # env.ts
      server: {
        API_KEY: z.string(),
      }

      # turbo.json
      "build": {
        "env": ["API_KEY"]
      }
    output: "Server-side environment variable properly added"

  - input: |
      # Adding a client-side feature flag
      # .env.example
      NEXT_PUBLIC_FEATURE_ENABLED=false

      # env.ts
      client: {
        NEXT_PUBLIC_FEATURE_ENABLED: z.coerce.boolean().default(false),
      },
      experimental__runtimeEnv: {
        NEXT_PUBLIC_FEATURE_ENABLED: process.env.NEXT_PUBLIC_FEATURE_ENABLED,
      }

      # turbo.json
      "build": {
        "env": ["NEXT_PUBLIC_FEATURE_ENABLED"]
      }
    output: "Client-side environment variable properly added"

references:
  - apps/web/env.ts
  - apps/web/.env.example
  - turbo.json