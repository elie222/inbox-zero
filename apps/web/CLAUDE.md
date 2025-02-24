# CLAUDE.md - Development Guidelines

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
