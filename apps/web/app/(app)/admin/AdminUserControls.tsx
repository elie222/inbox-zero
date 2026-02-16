"use client";

import { useAction } from "next-safe-action/hooks";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import {
  adminProcessHistorySchema,
  type AdminProcessHistoryOptions,
} from "@/app/(app)/admin/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  adminDeleteAccountAction,
  adminProcessHistoryAction,
  adminWatchEmailsAction,
  adminDisableAllRulesAction,
  adminCleanupDraftsAction,
} from "@/utils/actions/admin";
import { adminCheckPermissionsAction } from "@/utils/actions/permissions";
import { toastError, toastSuccess } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";

export const AdminUserControls = () => {
  const { execute: processHistory, isExecuting: isProcessing } = useAction(
    adminProcessHistoryAction,
    {
      onSuccess: () => {
        toastSuccess({
          title: "History processed",
          description: "History processed",
        });
      },
      onError: () => {
        toastError({
          title: "Error processing history",
          description: "Error processing history",
        });
      },
    },
  );
  const { execute: checkPermissions, isExecuting: isCheckingPermissions } =
    useAction(adminCheckPermissionsAction, {
      onSuccess: (result) => {
        toastSuccess({
          title: "Permissions checked",
          description: `Permissions checked. ${
            result.data?.hasAllPermissions
              ? "Has all permissions"
              : "Missing permissions"
          }`,
        });
      },
      onError: (error) => {
        console.error(error);
        toastError({
          title: "Error checking permissions",
          description: getActionErrorMessage(error.error),
        });
      },
    });
  const { execute: watchEmails, isExecuting: isWatching } = useAction(
    adminWatchEmailsAction,
    {
      onSuccess: (result) => {
        const results = result.data?.results || [];
        const successCount = results.filter(
          (r) => r.status === "success",
        ).length;
        const errorCount = results.filter((r) => r.status === "error").length;
        const description =
          successCount > 0
            ? `${successCount} succeeded, ${errorCount} failed`
            : errorCount > 0
              ? `0 succeeded, ${errorCount} failed`
              : "No watchable email accounts found";
        toastSuccess({
          title: "Watch completed",
          description,
        });
      },
      onError: (error) => {
        toastError({
          title: "Error watching emails",
          description: getActionErrorMessage(error.error),
        });
      },
    },
  );
  const { execute: disableRules, isExecuting: isDisablingRules } = useAction(
    adminDisableAllRulesAction,
    {
      onSuccess: (result) => {
        toastSuccess({
          title: "Rules disabled",
          description: `Disabled rules and follow-up for ${result.data?.emailAccountCount} account(s)`,
        });
      },
      onError: (error) => {
        toastError({
          title: "Error disabling rules",
          description: getActionErrorMessage(error.error),
        });
      },
    },
  );
  const { execute: cleanupDrafts, isExecuting: isCleaningDrafts } = useAction(
    adminCleanupDraftsAction,
    {
      onSuccess: (result) => {
        toastSuccess({
          title: "Drafts cleaned up",
          description: `Deleted ${result.data?.deleted ?? 0} draft(s), skipped ${result.data?.skippedModified ?? 0} modified`,
        });
      },
      onError: (error) => {
        toastError({
          title: "Error cleaning up drafts",
          description: getActionErrorMessage(error.error),
        });
      },
    },
  );
  const { execute: deleteAccount, isExecuting: isDeleting } = useAction(
    adminDeleteAccountAction,
    {
      onSuccess: () => {
        toastSuccess({
          title: "User deleted",
          description: "User deleted",
        });
      },
      onError: () => {
        toastError({
          title: "Error deleting user",
          description: "Error deleting user",
        });
      },
    },
  );

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
          onClick={() => {
            processHistory({ emailAddress: getValues("email") });
          }}
        >
          Process History
        </Button>
        <Button
          variant="outline"
          loading={isCheckingPermissions}
          onClick={() => {
            checkPermissions({ email: getValues("email") });
          }}
        >
          Check Permissions
        </Button>
        <Button
          variant="outline"
          loading={isWatching}
          onClick={() => {
            watchEmails({ email: getValues("email") });
          }}
        >
          Watch
        </Button>
        <Button
          variant="outline"
          loading={isDisablingRules}
          onClick={() => {
            disableRules({ email: getValues("email") });
          }}
        >
          Disable Rules
        </Button>
        <Button
          variant="outline"
          loading={isCleaningDrafts}
          onClick={() => {
            cleanupDrafts({ email: getValues("email") });
          }}
        >
          Cleanup Drafts
        </Button>
        <Button
          variant="destructive"
          loading={isDeleting}
          onClick={() => {
            deleteAccount({ email: getValues("email") });
          }}
        >
          Delete User
        </Button>
      </div>
    </form>
  );
};
