"use client";

import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { Plus, Search, Trash2 } from "lucide-react";
import useSWR from "swr";
import type { GetSignatureResponse } from "@/app/api/user/signature/route";
import { SignaturePreview } from "@/app/(app)/[emailAccountId]/assistant/settings/PersonalSignatureSetting";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Input } from "@/components/Input";
import { LoadingContent } from "@/components/LoadingContent";
import { SettingCard } from "@/components/SettingCard";
import { toastError, toastInfo, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAccount } from "@/providers/EmailAccountProvider";
import { saveSignatureAction } from "@/utils/actions/user";
import {
  createSignatureAction,
  deleteSignatureAction,
  findSentSignaturesAction,
  updateSignatureAction,
} from "@/utils/actions/signature";
import {
  createSignatureBody,
  type CreateSignatureBody,
} from "@/utils/actions/signature.validation";
import { DEFAULT_SIGNATURE_ID } from "@/utils/email/default-signature";
import { getAccountScopedKey } from "@/utils/swr";

type Signature = GetSignatureResponse["signatures"][number];
type EditingSignature = { id?: string; name: string; html: string };

type FoundSignature = { html: string; count: number };

export function SignaturesSetting() {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);

  return (
    <SettingCard
      title={t`More signatures`}
      description={t`Switch between signatures when you write, like one per language.`}
      right={
        <>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Trans>Manage</Trans>
          </Button>
          <SignaturesDialog open={open} onOpenChange={setOpen} />
        </>
      }
    />
  );
}

export function SignaturesDialog({
  open,
  onOpenChange,
  found,
  needsDefault = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  found?: FoundSignature[];
  needsDefault?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <Trans>Signatures</Trans>
          </DialogTitle>
          <DialogDescription>
            {needsDefault ? (
              <Trans>Pick the signature to add to emails you send.</Trans>
            ) : (
              <Trans>
                Pick one of these instead of your default signature when you
                compose.
              </Trans>
            )}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <SignaturesManager initialFound={found} needsDefault={needsDefault} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SignaturesManager({
  initialFound = [],
  needsDefault,
}: {
  initialFound?: FoundSignature[];
  needsDefault: boolean;
}) {
  const { t } = useLingui();
  const { emailAccountId } = useAccount();
  const { data, error, isLoading, mutate } = useSWR<GetSignatureResponse>(
    getAccountScopedKey("/api/user/signature", emailAccountId),
  );
  const [editing, setEditing] = useState<EditingSignature | null>(null);
  const [found, setFound] = useState(initialFound);
  const [hasDefault, setHasDefault] = useState(!needsDefault);

  const { executeAsync: findSent, isExecuting: isFinding } = useAction(
    findSentSignaturesAction.bind(null, emailAccountId),
  );
  const { executeAsync: saveDefault, isExecuting: isSavingDefault } = useAction(
    saveSignatureAction.bind(null, emailAccountId),
  );

  const handleUseAsDefault = async (html: string) => {
    const result = await saveDefault({ signature: html });
    if (result?.serverError || result?.validationErrors) {
      toastError({
        title: t`Error saving signature`,
        description: result.serverError ?? t`This signature is too long.`,
      });
      return;
    }
    toastSuccess({ description: t`Signature saved` });
    setHasDefault(true);
    setFound((items) => items.filter((item) => item.html !== html));
    mutate();
  };

  const signatures =
    data?.signatures.filter(({ id }) => id !== DEFAULT_SIGNATURE_ID) ?? [];

  const handleFind = async () => {
    const result = await findSent();
    if (result?.serverError) {
      toastError({
        title: t`Error searching sent mail`,
        description: result.serverError,
      });
      return;
    }
    const sentSignatures = result?.data?.signatures ?? [];
    if (sentSignatures.length === 0)
      toastInfo({
        title: t`No new signatures found`,
        description: t`Your recent sent mail only uses signatures you have.`,
      });
    setFound(sentSignatures);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setEditing({ name: "", html: "" })}>
          <Plus className="mr-2 size-4" />
          <Trans>Add</Trans>
        </Button>
        <Button
          size="sm"
          variant="outline"
          loading={isFinding}
          onClick={handleFind}
        >
          <Search className="mr-2 size-4" />
          <Trans>Find in sent mail</Trans>
        </Button>
      </div>

      {found.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm">
            <Trans>Found in your sent mail</Trans>
          </h4>
          {found.map((item) => (
            <Card key={item.html} className="flex items-start gap-4 p-3">
              <div className="flex-1">
                <SignaturePreview
                  signature={item.html}
                  className="h-28 min-h-0"
                />
                <p className="mt-1 text-muted-foreground text-xs">
                  {t`Used in ${plural(item.count, {
                    one: "# recent email",
                    other: "# recent emails",
                  })}`}
                </p>
              </div>
              <div className="flex gap-2">
                {!hasDefault && (
                  <Button
                    size="sm"
                    loading={isSavingDefault}
                    onClick={() => handleUseAsDefault(item.html)}
                  >
                    <Trans>Use as default</Trans>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing({ name: "", html: item.html })}
                >
                  <Trans>Add</Trans>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <LoadingContent loading={isLoading} error={error}>
        {signatures.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            <Trans>
              No other signatures yet. Add one, or find the ones you already use
              in your sent mail.
            </Trans>
          </p>
        ) : (
          <div className="space-y-2">
            {signatures.map((signature) => (
              <SignatureRow
                key={signature.id}
                signature={signature}
                onEdit={() =>
                  setEditing({
                    id: signature.id,
                    name: signature.name,
                    html: signature.signatureHtml,
                  })
                }
                onDeleted={() => mutate()}
              />
            ))}
          </div>
        )}
      </LoadingContent>

      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? (
                <Trans>Edit signature</Trans>
              ) : (
                <Trans>Add signature</Trans>
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">
              <Trans>Name the signature and set its content.</Trans>
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <SignatureForm
              signature={editing}
              onSaved={(html) => {
                setFound((items) => items.filter((item) => item.html !== html));
                setEditing(null);
                mutate();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SignatureRow({
  signature,
  onEdit,
  onDeleted,
}: {
  signature: Signature;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const { t } = useLingui();
  const { emailAccountId } = useAccount();
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <Card className="flex items-start gap-4 p-3">
      <div className="flex-1 space-y-2">
        <h4 className="font-medium text-sm">{signature.name}</h4>
        <SignaturePreview
          signature={signature.signatureHtml}
          className="h-28 min-h-0"
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Trans>Edit</Trans>
        </Button>
        <ConfirmDialog
          title={t`Delete signature`}
          description={t`Delete ${signature.name}? This cannot be undone.`}
          confirmText={t`Delete`}
          onConfirm={async () => {
            try {
              setIsDeleting(true);
              const result = await deleteSignatureAction(emailAccountId, {
                id: signature.id,
              });
              if (result?.serverError) {
                toastError({
                  title: t`Error deleting signature`,
                  description: result.serverError,
                });
                return;
              }
              toastSuccess({ description: t`Signature deleted` });
              onDeleted();
            } finally {
              setIsDeleting(false);
            }
          }}
          trigger={
            <Button
              aria-label={t`Delete ${signature.name}`}
              loading={isDeleting}
              size="sm"
              variant="outline"
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </Button>
          }
        />
      </div>
    </Card>
  );
}

function SignatureForm({
  signature,
  onSaved,
}: {
  signature: EditingSignature;
  onSaved: (html: string) => void;
}) {
  const { t } = useLingui();
  const { emailAccountId } = useAccount();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateSignatureBody>({
    resolver: zodResolver(createSignatureBody),
    defaultValues: { name: signature.name, html: signature.html },
  });

  const onSubmit = async (values: CreateSignatureBody) => {
    const result = signature.id
      ? await updateSignatureAction(emailAccountId, {
          ...values,
          id: signature.id,
        })
      : await createSignatureAction(emailAccountId, values);
    if (result?.serverError) {
      toastError({
        title: t`Error saving signature`,
        description: result.serverError,
      });
      return;
    }
    toastSuccess({ description: t`Signature saved` });
    onSaved(signature.html);
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <Input
        type="text"
        name="name"
        label={t`Name`}
        placeholder={t`German`}
        registerProps={register("name")}
        error={errors.name}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          type="text"
          autosizeTextarea
          rows={8}
          name="html"
          label={t`Signature (HTML supported)`}
          registerProps={register("html")}
          error={errors.html}
        />
        <SignaturePreview signature={watch("html")} />
      </div>
      <Button type="submit" loading={isSubmitting}>
        <Trans>Save signature</Trans>
      </Button>
    </form>
  );
}
