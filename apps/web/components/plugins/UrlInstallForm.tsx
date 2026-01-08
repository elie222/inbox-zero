"use client";

import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { Badge } from "@/components/Badge";
import { UnverifiedWarning } from "@/components/plugins/UnverifiedWarning";
import { TrustBadge } from "@/components/plugins/TrustBadge";
import { toastSuccess, toastError } from "@/components/Toast";
import { installPluginFromUrlAction } from "@/utils/actions/plugins";
import { formatPermissionSummary } from "@/lib/plugin-runtime/risk-levels";
import { Loader2Icon, ExternalLink, ShieldAlert, Package } from "lucide-react";
import type { FetchManifestResponse } from "@/app/api/user/plugins/fetch-manifest/route";

const urlFormSchema = z.object({
  repositoryUrl: z.string().min(1, "Repository URL is required"),
  confirmUnverified: z.boolean().refine((val) => val === true, {
    message: "You must acknowledge the security risks",
  }),
  confirmInstall: z.boolean().refine((val) => val === true, {
    message: "You must confirm installation",
  }),
});

type UrlFormData = z.infer<typeof urlFormSchema>;

interface UrlInstallFormProps {
  onSuccess?: () => void;
}

export function UrlInstallForm({ onSuccess }: UrlInstallFormProps) {
  const [step, setStep] = useState<"input" | "preview">("input");
  const [isFetching, setIsFetching] = useState(false);
  const [manifestData, setManifestData] =
    useState<FetchManifestResponse | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    getValues,
    setValue,
    watch,
  } = useForm<UrlFormData>({
    resolver: zodResolver(urlFormSchema),
    defaultValues: {
      repositoryUrl: "",
      confirmUnverified: false,
      confirmInstall: false,
    },
  });

  const confirmUnverified = watch("confirmUnverified");
  const confirmInstall = watch("confirmInstall");

  const handleFetchManifest = useCallback(async () => {
    const url = getValues("repositoryUrl");
    if (!url.trim()) return;

    setIsFetching(true);
    try {
      const response = await fetch(
        `/api/user/plugins/fetch-manifest?url=${encodeURIComponent(url)}`,
      );
      const data = await response.json();

      if (!response.ok || data.error) {
        toastError({
          title: "Failed to fetch plugin",
          description: data.error || "Could not fetch plugin manifest",
        });
        return;
      }

      setManifestData(data);
      setStep("preview");
    } catch (_error) {
      toastError({
        title: "Failed to fetch plugin",
        description: "Could not connect to the repository",
      });
    } finally {
      setIsFetching(false);
    }
  }, [getValues]);

  const onSubmit = useCallback(
    async (data: UrlFormData) => {
      if (!manifestData || "error" in manifestData) return;

      const result = await installPluginFromUrlAction({
        repositoryUrl: data.repositoryUrl.trim(),
      });

      if (result?.serverError) {
        toastError({
          title: "Installation failed",
          description: result.serverError,
        });
      } else {
        toastSuccess({
          description: `Plugin "${manifestData.manifest.name}" installed successfully`,
        });
        onSuccess?.();
      }
    },
    [manifestData, onSuccess],
  );

  const handleCancel = useCallback(() => {
    if (step === "preview") {
      setStep("input");
      setManifestData(null);
      setValue("confirmUnverified", false);
      setValue("confirmInstall", false);
    }
  }, [step, setValue]);

  if (step === "input") {
    return (
      <div className="space-y-6">
        <UnverifiedWarning />

        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">
            Enter GitHub Repository URL
          </h2>
          <form className="space-y-4">
            <Input
              type="text"
              name="repositoryUrl"
              label="GitHub Repository URL"
              placeholder="https://github.com/username/repo or github.com/username/repo"
              registerProps={register("repositoryUrl")}
              error={errors.repositoryUrl}
            />
            <p className="text-xs text-muted-foreground">
              The repository must contain a valid plugin.json manifest file
            </p>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                onClick={handleFetchManifest}
                disabled={isFetching || !getValues("repositoryUrl").trim()}
              >
                {isFetching ? (
                  <>
                    <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  "Fetch & Review"
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (!manifestData || "error" in manifestData) return null;

  const { manifest, repositoryUrl, trustLevel } = manifestData;
  const permissionSummary = formatPermissionSummary(manifest);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="mb-6 flex items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-border bg-muted">
            <Package className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <h2 className="mb-1 text-xl font-bold">{manifest.name}</h2>
            <p className="mb-2 text-sm text-muted-foreground">
              {manifest.author || repositoryUrl}
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge color="gray">v{manifest.version}</Badge>
              <TrustBadge level={trustLevel || "unverified"} />
            </div>
          </div>
        </div>

        {manifest.description && (
          <p className="mb-6 text-sm text-muted-foreground">
            {manifest.description}
          </p>
        )}

        <div className="mb-6 rounded-md border border-border bg-muted/50 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <ExternalLink className="h-4 w-4" />
            Repository
          </div>
          <a
            href={repositoryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            {repositoryUrl}
          </a>
        </div>

        <div className="mb-6">
          <h3 className="mb-3 flex items-center gap-2 font-semibold">
            <ShieldAlert className="h-5 w-5" />
            Permissions Requested
          </h3>
          <div className="space-y-2">
            {permissionSummary.capabilities.length > 0 ? (
              permissionSummary.capabilities.map((capability) => (
                <div
                  key={capability.name}
                  className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3"
                >
                  <div className="flex-1">
                    <div className="font-medium">{capability.description}</div>
                    <div className="text-xs text-muted-foreground">
                      Capability: {capability.name}
                    </div>
                  </div>
                  <Badge
                    color={capability.risk === "elevated" ? "yellow" : "green"}
                  >
                    {capability.risk === "elevated" ? "Elevated" : "Standard"}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No special permissions required
              </p>
            )}
          </div>
        </div>

        <UnverifiedWarning variant="install" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              {...register("confirmUnverified")}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm">
              I understand this plugin is from an unverified source and has not
              been reviewed by Inbox Zero
            </span>
          </label>
          {errors.confirmUnverified && (
            <p className="text-sm text-red-600">
              {errors.confirmUnverified.message}
            </p>
          )}

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              {...register("confirmInstall")}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm">
              I accept the security risks of installing unverified plugins and
              trust this source
            </span>
          </label>
          {errors.confirmInstall && (
            <p className="text-sm text-red-600">
              {errors.confirmInstall.message}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={isSubmitting}
            disabled={!confirmUnverified || !confirmInstall}
          >
            Install Anyway
          </Button>
        </div>
      </form>
    </div>
  );
}
