"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import {
  adminProcessHistorySchema,
  type AdminProcessHistoryOptions,
} from "@/app/(app)/admin/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import { handleActionResult } from "@/utils/server-action";
import {
  adminDeleteAccountAction,
  adminProcessHistoryAction,
} from "@/utils/actions/admin";
import { adminCheckPermissionsAction } from "@/utils/actions/permissions";

export const AdminUserControls = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCheckingPermissions, setIsCheckingPermissions] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const {
    register,
    formState: { errors },
    getValues,
  } = useForm<AdminProcessHistoryOptions>({
    resolver: zodResolver(adminProcessHistorySchema),
  });

  return (
    <form className="max-w-sm space-y-4">
      <Input
        type="email"
        name="email"
        label="Email"
        registerProps={register("email", { required: true })}
        error={errors.email}
      />
      <div className="flex gap-2">
        <Button
          variant="outline"
          loading={isProcessing}
          onClick={async () => {
            setIsProcessing(true);
            const email = getValues("email");
            const result = await adminProcessHistoryAction({
              emailAddress: email,
            });
            handleActionResult(result, `Processed history for ${email}`);
            setIsProcessing(false);
          }}
        >
          Process History
        </Button>
        <Button
          variant="outline"
          loading={isCheckingPermissions}
          onClick={async () => {
            setIsCheckingPermissions(true);
            const email = getValues("email");
            const result = await adminCheckPermissionsAction({ email });
            handleActionResult(
              result,
              `Checked permissions for ${email}. ${
                result?.hasAllPermissions
                  ? "Has all permissions"
                  : "Missing permissions"
              }`,
            );
            setIsCheckingPermissions(false);
          }}
        >
          Check Permissions
        </Button>
        <Button
          variant="destructive"
          loading={isDeleting}
          onClick={async () => {
            setIsDeleting(true);
            const email = getValues("email");
            const result = await adminDeleteAccountAction(email);
            handleActionResult(result, "Deleted user");
            setIsDeleting(false);
          }}
        >
          Delete User
        </Button>
      </div>
    </form>
  );
};
