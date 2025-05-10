---
description: Fetching data from the API using SWR
globs: 
alwaysApply: false
---
# Data Fetching

There are two ways we fetch data in the app:
1. SWR (default)
2. Server Components

Default to SWR as it makes it easier to refetch data we need.

Here's how we use SWR:

- For API GET requests to server, use the `swr` package
- If we're in a server file, you can fetch the data inline
- For mutating data, use Next.js server actions

## SWR Example
```typescript
const searchParams = useSearchParams();
const page = searchParams.get("page") || "1";
const { data, isLoading, error } = useSWR<PlanHistoryResponse>(
  `/api/user/planned/history?page=${page}`
);
```

## Error Handling

Use `result?.serverError` with `toastError` and `toastSuccess`. Success toast is optional:

```typescript
import { toastError, toastSuccess } from "@/components/Toast";

const onSubmit: SubmitHandler<TestRulesInputs> = useCallback(async (data) => {
  const result = await testAiCustomContentAction({ content: data.message });
  if (result?.serverError) {
    toastError({
      title: "Error testing email",
      description: result?.serverError || "",
    });
  } else {
    toastSuccess({ description: "Saved!" });
  }
}, []);
``` 