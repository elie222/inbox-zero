---
description: UI component and styling guidelines using Shadcn UI, Radix UI, and Tailwind
globs: 
alwaysApply: false
---
# UI Components and Styling

## UI Framework
- Use Shadcn UI and Tailwind for components and styling
- Implement responsive design with Tailwind CSS using a mobile-first approach
- Use `next/image` package for images

## Install new Shadcn components

```sh
pnpm dlx shadcn@latest add COMPONENT
```

Example:

```sh
pnpm dlx shadcn@latest add progress
```

## Data Fetching with SWR
For API get requests to server use the `swr` package:

```typescript
const searchParams = useSearchParams();
const page = searchParams.get("page") || "1";
const { data, isLoading, error } = useSWR<PlanHistoryResponse>(
  `/api/user/planned/history?page=${page}`
);
```

## Loading Components
Use the `LoadingContent` component to handle loading states:

```tsx
<Card>
  <LoadingContent loading={isLoading} error={error}>
    {data && <MyComponent data={data} />}
  </LoadingContent>
</Card>
```

## Form Components
### Text Inputs
```tsx
<Input
  type="email"
  name="email"
  label="Email"
  registerProps={register("email", { required: true })}
  error={errors.email}
/>
```

### Text Area
```tsx
<Input
  type="text"
  autosizeTextarea
  rows={3}
  name="message"
  placeholder="Paste in email content"
  registerProps={register("message", { required: true })}
  error={errors.message}
/>
``` 