"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useAction } from "next-safe-action/hooks";
import { zodResolver } from "@hookform/resolvers/zod";
import useSWR, { useSWRConfig } from "swr";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { z } from "zod";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { LoadingContent } from "@/components/LoadingContent";
import {
  connectICloudAction,
  updateICloudFoldersAction,
} from "@/utils/actions/icloud";
import { connectICloudBody } from "@/utils/actions/icloud.validation";
import type { GetICloudFoldersResponse } from "@/app/api/icloud/folders/route";
import type { ICloudFolders } from "@/utils/icloud/folders";
import { getActionErrorMessage } from "@/utils/error";
import { toastError, toastSuccess } from "@/components/Toast";
import {
  EMAIL_ACCOUNTS_KEY,
  fetchEmailAccounts,
} from "@/utils/fetch-email-accounts";

export default function ICloudAccountPage() {
  const accountId = useSearchParams().get("account");
  return (
    <PageWrapper>
      <PageHeader title="Connect iCloud Mail" />
      <div className="mx-auto max-w-xl space-y-6 py-6">
        {accountId ? (
          <FolderSettings emailAccountId={accountId} />
        ) : (
          <ConnectForm />
        )}
        <Link className="text-sm underline" href="/accounts">
          Back to accounts
        </Link>
      </div>
    </PageWrapper>
  );
}

function ConnectForm() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const {
    register,
    handleSubmit,
    formState: { errors },
    resetField,
  } = useForm<z.infer<typeof connectICloudBody>>({
    resolver: zodResolver(connectICloudBody),
  });
  const { execute, isExecuting } = useAction(connectICloudAction, {
    onSuccess: async ({ data }) => {
      resetField("password");
      await fetchEmailAccounts();
      await mutate(EMAIL_ACCOUNTS_KEY);
      if (data)
        router.replace(
          `/accounts/icloud?account=${encodeURIComponent(data.emailAccountId)}`,
        );
    },
    onError: ({ error }) => {
      resetField("password");
      toastError({
        title: "Could not connect iCloud",
        description: getActionErrorMessage(error),
      });
    },
  });
  return (
    <form onSubmit={handleSubmit(execute)} className="space-y-5">
      <p>
        Connect using your iCloud Mail address and an Apple app-specific
        password. Your Apple Account password will not work here.
      </p>
      <p className="text-sm text-muted-foreground">
        <a
          className="underline"
          href="https://account.apple.com/"
          target="_blank"
          rel="noreferrer"
        >
          Create an app-specific password
        </a>{" "}
        in Sign-In and Security. The password is encrypted on this server.
      </p>
      <Input
        name="email"
        label="iCloud Mail address"
        type="email"
        registerProps={register("email")}
        error={errors.email}
      />
      <Input
        name="password"
        label="App-specific password"
        type="password"
        registerProps={{
          ...register("password"),
          autoComplete: "new-password",
        }}
        error={errors.password}
      />
      <p className="text-sm text-muted-foreground">
        Connecting lists your folders. It does not sort or send messages.
      </p>
      <Button type="submit" loading={isExecuting}>
        Connect iCloud
      </Button>
    </form>
  );
}

function FolderSettings({ emailAccountId }: { emailAccountId: string }) {
  const { data, isLoading, error } = useSWR<GetICloudFoldersResponse>([
    "/api/icloud/folders",
    emailAccountId,
  ]);
  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <FolderForm
          key={emailAccountId}
          emailAccountId={emailAccountId}
          data={data}
        />
      )}
    </LoadingContent>
  );
}

function FolderForm({
  emailAccountId,
  data,
}: {
  emailAccountId: string;
  data: GetICloudFoldersResponse;
}) {
  const [folders, setFolders] = useState<ICloudFolders>(data.mapping);
  const { execute, isExecuting } = useAction(
    updateICloudFoldersAction.bind(null, emailAccountId),
    {
      onSuccess: () =>
        toastSuccess({ description: "iCloud folder mapping saved" }),
      onError: ({ error }) =>
        toastError({
          title: "Could not save folders",
          description: getActionErrorMessage(error),
        }),
    },
  );
  return (
    <div className="space-y-5">
      <p>
        iCloud is connected. Confirm the existing folder for each role.
        Unassigned roles remain unavailable until you choose a folder.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          execute(folders);
        }}
        className="space-y-4"
      >
        {(["inbox", "sent", "drafts", "archive", "trash", "junk"] as const).map(
          (role) => (
            <div key={role} className="space-y-1">
              <label
                className="block text-sm font-medium capitalize"
                htmlFor={`folder-${role}`}
              >
                {role}
              </label>
              <select
                id={`folder-${role}`}
                className="w-full rounded-md border bg-background p-2"
                value={folders[role] ?? ""}
                required={role === "inbox"}
                onChange={(event) =>
                  setFolders((current) => ({
                    ...current,
                    [role]: event.target.value || undefined,
                  }))
                }
              >
                <option value="">Not assigned</option>
                {data.folders.map((folder) => (
                  <option key={folder.path} value={folder.path}>
                    {folder.path}
                  </option>
                ))}
              </select>
            </div>
          ),
        )}
        <Button type="submit" loading={isExecuting}>
          Save folder mapping
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        This only assigns folder roles. Existing messages stay where they are;
        automatic processing remains off.
      </p>
      <p className="text-sm text-muted-foreground">
        You can read mail, mark messages read or starred, and move them between
        folders. Send mail and edit saved drafts in Apple Mail for now.
      </p>
      <Link className="block text-sm underline" href="/accounts/icloud">
        Reconnect with a new app-specific password
      </Link>
      <Button asChild variant="outline">
        <Link href={`/${emailAccountId}/mail`}>Open iCloud mailbox</Link>
      </Button>
    </div>
  );
}
