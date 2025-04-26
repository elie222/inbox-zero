---
description: Form handling
globs: 
alwaysApply: false
---
# Form Handling

- Use React Hook Form with Zod for validation
- The same validation should be done in the server action too

## Form Example

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/Input";
import { Button } from "@/components/ui/button";
import { toastSuccess, toastError } from "@/components/Toast";
import { createExampleAction } from "@/utils/actions/example";
import { type CreateExampleBody } from "@/utils/actions/example.validation";

export const ExampleForm = ({ emailAccountId }: { emailAccountId: string }) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateExampleBody>({
    resolver: zodResolver(schema),
  });

  const onSubmit: SubmitHandler<CreateExampleBody> = useCallback(
    async (data) => {
      const result = await createExampleAction(emailAccountId, data);
      
      if (result?.serverError) {
        toastError({ title: "Error", description: result.serverError });
      } else {
        toastSuccess({ description: "Created example!" });
      }
    },
    []
  );

  return (
    <form className="max-w-sm space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <Input
        type="email"
        name="email"
        label="Email"
        registerProps={register("email", { required: true })}
        error={errors.email}
      />
      <Button type="submit" loading={isSubmitting}>
        Save
      </Button>
    </form>
  );
};
```

## Validation Guidelines

- Define validation schemas using Zod
- Apply the same validation in both client and server
- Use descriptive error messages
- Validate form inputs before submission
- Show validation errors inline next to form fields
