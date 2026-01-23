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
import {
  Loader2Icon,
  ExternalLink,
  ShieldAlert,
  Package,
  KeyRound,
  Lock,
} from "lucide-react";
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
  const [step, setStep] = useState<"input" | "auth" | "preview">("input");
  const [isFetching, setIsFetching] = useState(false);
  const [manifestData, setManifestData] =
    useState<FetchManifestResponse | null>(null);
  // private repo auth state
  const [githubToken, setGithubToken] = useState("");
  const [rememberToken, setRememberToken] = useState(true);

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

  const handleFetchManifest = useCallback(
    async (token?: string) => {
      const url = getValues("repositoryUrl");
      if (!url.trim()) return;

      setIsFetching(true);
      try {
        const params = new URLSearchParams({ url });
        if (token) {
          params.set("token", token);
        }

        const response = await fetch(
          `/api/user/plugins/fetch-manifest?${params.toString()}`,
        );
        const data = await response.json();

        if (!response.ok || data.error) {
          // check if this is a private repo requiring authentication
          if (data.requiresAuth) {
            setStep("auth");
            return;
          }

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
    },
    [getValues],
  );

  const handleRetryWithToken = useCallback(async () => {
    if (!githubToken.trim()) {
      toastError({
        title: "Token required",
        description: "Please enter a GitHub token to access this repository",
      });
      return;
    }
    await handleFetchManifest(githubToken);
  }, [githubToken, handleFetchManifest]);

  const onSubmit = useCallback(
    async (data: UrlFormData) => {
      if (!manifestData || "error" in manifestData) return;

      const result = await installPluginFromUrlAction({
        repositoryUrl: data.repositoryUrl.trim(),
        // pass token for private repos, with option to remember
        token: manifestData.isPrivate ? githubToken : undefined,
        rememberToken: manifestData.isPrivate ? rememberToken : undefined,
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
    [manifestData, onSuccess, githubToken, rememberToken],
  );

  const handleCancel = useCallback(() => {
    if (step === "preview" || step === "auth") {
      setStep("input");
      setManifestData(null);
      setValue("confirmUnverified", false);
      setValue("confirmInstall", false);
      setGithubToken("");
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
                onClick={() => handleFetchManifest()}
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

  // auth step - shown when private repo detected
  if (step === "auth") {
    const url = getValues("repositoryUrl");
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-400" />
            <div>
              <h3 className="font-medium text-amber-800 dark:text-amber-200">
                Private Repository Detected
              </h3>
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                This repository requires authentication to access. Please
                provide a GitHub personal access token with read access to the
                repository.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">
            Authenticate Private Repository
          </h2>

          <div className="mb-4 rounded-md border border-border bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ExternalLink className="h-4 w-4" />
              {url}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="github-token"
                className="mb-1 block text-sm font-medium"
              >
                GitHub Token
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="github-token"
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxx or github_pat_xxxxxxxxxxxx"
                  className="w-full rounded-md border border-input bg-background py-2 pl-10 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Use a{" "}
                <a
                  href="https://github.com/settings/tokens?type=beta"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  fine-grained personal access token
                </a>{" "}
                with &quot;Contents: Read&quot; permission for this repository.
              </p>
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={rememberToken}
                onChange={(e) => setRememberToken(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm">
                Remember this token for future updates to this plugin
              </span>
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleRetryWithToken}
              disabled={isFetching || !githubToken.trim()}
            >
              {isFetching ? (
                <>
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!manifestData || "error" in manifestData) return null;

  const { manifest, repositoryUrl, trustLevel, isPrivate } = manifestData;
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
              {isPrivate && (
                <Badge color="blue">
                  <Lock className="mr-1 h-3 w-3" />
                  Private
                </Badge>
              )}
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
