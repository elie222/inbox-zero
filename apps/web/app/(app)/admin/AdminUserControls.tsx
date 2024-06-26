"use client";

import { useCallback } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import {
  adminProcessHistorySchema,
  type AdminProcessHistoryOptions,
} from "@/app/(app)/admin/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import { handleActionResult } from "@/utils/server-action";
import { adminProcessHistoryAction } from "@/utils/actions/admin";

export const AdminUserControls = () => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AdminProcessHistoryOptions>({
    resolver: zodResolver(adminProcessHistorySchema),
  });

  const onSubmit: SubmitHandler<AdminProcessHistoryOptions> = useCallback(
    async (data) => {
      const result = await adminProcessHistoryAction(data.email);
      handleActionResult(result, `Processed history for ${data.email}`);
    },
    [],
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
        Process History
      </Button>
    </form>
  );
};
