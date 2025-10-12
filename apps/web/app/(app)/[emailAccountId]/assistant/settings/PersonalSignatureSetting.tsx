"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess, toastInfo } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingCard } from "@/components/SettingCard";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useAction } from "next-safe-action/hooks";
import { fetchSignaturesFromProviderAction } from "@/utils/actions/email-account";
import { saveSignatureAction } from "@/utils/actions/user";
import type { EmailSignature } from "@/utils/email/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function PersonalSignatureSetting() {
  const { data, isLoading, error } = useEmailAccountFull();

  const hasSignature = !!data?.signature;

  return (
    <SettingCard
      title="Email signature"
      description="Set your email signature to include in drafted messages."
      right={
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-8 w-32" />}
        >
          <SignatureDialog currentSignature={data?.signature || ""}>
            <Button variant="outline" size="sm">
              {hasSignature ? "Edit" : "Set"} Signature
            </Button>
          </SignatureDialog>
        </LoadingContent>
      }
    />
  );
}

function SignatureDialog({
  children,
  currentSignature,
}: {
  children: React.ReactNode;
  currentSignature: string;
}) {
  const [open, setOpen] = useState(false);
  const { emailAccountId, provider } = useAccount();
  const { mutate } = useEmailAccountFull();
  const [signatures, setSignatures] = useState<EmailSignature[]>([]);
  const [selectedSignature, setSelectedSignature] = useState<string>("");
  const [manualSignature, setManualSignature] = useState(currentSignature);

  const isGmail = provider === "google";

  const { execute: executeSave, isExecuting: isSaving } = useAction(
    saveSignatureAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({
          description: "Signature saved!",
        });
        setOpen(false);
      },
      onError: (error) => {
        toastError({
          description: error.error.serverError || "Failed to save signature",
        });
      },
      onSettled: () => {
        mutate();
      },
    },
  );

  const { executeAsync: executeFetchSignatures, isExecuting: isFetching } =
    useAction(fetchSignaturesFromProviderAction.bind(null, emailAccountId));

  const handleLoadFromProvider = useCallback(async () => {
    const result = await executeFetchSignatures();

    if (result?.serverError) {
      toastError({
        title: `Error loading signature from ${isGmail ? "Gmail" : "Outlook"}`,
        description: result.serverError,
      });
      return;
    }

    const fetchedSignatures = result?.data?.signatures || [];

    if (fetchedSignatures.length === 0) {
      toastInfo({
        title: "No signatures found",
        description: isGmail
          ? "No signatures found in your Gmail account"
          : "No signature found in recent sent emails",
      });
      return;
    }

    setSignatures(fetchedSignatures);

    // Auto-select the default/first signature and populate the textarea
    const defaultSig =
      fetchedSignatures.find((sig) => sig.isDefault) || fetchedSignatures[0];
    if (defaultSig) {
      setSelectedSignature(defaultSig.email);
      setManualSignature(defaultSig.signature);
    }

    toastSuccess({
      title: "Signatures loaded",
      description: `Found ${fetchedSignatures.length} signature${fetchedSignatures.length !== 1 ? "s" : ""}`,
    });
  }, [executeFetchSignatures, isGmail]);

  const handleSelectSignature = useCallback(
    (signatureEmail: string) => {
      setSelectedSignature(signatureEmail);
      const signature = signatures.find((sig) => sig.email === signatureEmail);
      if (signature) {
        setManualSignature(signature.signature);
      }
    },
    [signatures],
  );

  const handleSave = useCallback(() => {
    executeSave({ signature: manualSignature });
  }, [executeSave, manualSignature]);

  const handleClear = useCallback(() => {
    setManualSignature("");
    executeSave({ signature: "" });
  }, [executeSave]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Email Signature</DialogTitle>
          <DialogDescription>
            Set your email signature to include in all drafted messages.
            {isGmail &&
              " You can load signatures from Gmail or enter manually."}
            {!isGmail &&
              " For Outlook, we can extract from recent sent emails or you can enter manually."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleLoadFromProvider}
              disabled={isFetching}
            >
              {isFetching
                ? "Loading..."
                : `Load from ${isGmail ? "Gmail" : "Outlook"}`}
            </Button>
            {signatures.length > 1 && (
              <Select
                value={selectedSignature}
                onValueChange={handleSelectSignature}
              >
                <SelectTrigger className="w-[250px]">
                  <SelectValue placeholder="Select signature" />
                </SelectTrigger>
                <SelectContent>
                  {signatures.map((sig) => (
                    <SelectItem key={sig.email} value={sig.email}>
                      {sig.displayName || sig.email}
                      {sig.isDefault && " (default)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="signature">Signature (HTML supported)</Label>
              <Textarea
                id="signature"
                value={manualSignature}
                onChange={(e) => setManualSignature(e.target.value)}
                placeholder="Enter your email signature..."
                className="min-h-[200px] font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>Preview</Label>
              <SignaturePreview signature={manualSignature} />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClear}>
              Clear
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Signature"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SignaturePreview({ signature }: { signature: string }) {
  const previewHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            margin: 0;
            padding: 12px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            line-height: 1.5;
          }
        </style>
      </head>
      <body>
        ${signature || '<em style="color: #888;">Your signature preview will appear here...</em>'}
      </body>
    </html>
  `;

  return (
    <iframe
      title="Signature Preview"
      sandbox="allow-same-origin"
      srcDoc={previewHtml}
      className="min-h-[200px] w-full rounded-md border border-input bg-muted/50"
    />
  );
}
