"use client";

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
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAccount } from "@/providers/EmailAccountProvider";
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

export function SignaturesSetting() {
  return (
    <SettingCard
      title="More signatures"
      description="Switch between signatures when you write, like one per language."
      right={
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              Manage
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] max-w-4xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Signatures</DialogTitle>
              <DialogDescription>
                Pick one of these instead of your default signature when you
                compose.
              </DialogDescription>
            </DialogHeader>
            <SignaturesManager />
          </DialogContent>
        </Dialog>
      }
    />
  );
}

function SignaturesManager() {
  const { emailAccountId } = useAccount();
  const { data, error, isLoading, mutate } = useSWR<GetSignatureResponse>(
    getAccountScopedKey("/api/user/signature", emailAccountId),
  );
  const [editing, setEditing] = useState<EditingSignature | null>(null);
  const [found, setFound] = useState<{ html: string; count: number }[]>([]);

  const { executeAsync: findSent, isExecuting: isFinding } = useAction(
    findSentSignaturesAction.bind(null, emailAccountId),
  );

  const signatures =
    data?.signatures.filter(({ id }) => id !== DEFAULT_SIGNATURE_ID) ?? [];

  const handleFind = async () => {
    const result = await findSent();
    if (result?.serverError) {
      toastError({
        title: "Error searching sent mail",
        description: result.serverError,
      });
      return;
    }
    const sentSignatures = result?.data?.signatures ?? [];
    if (sentSignatures.length === 0)
      toastInfo({
        title: "No new signatures found",
        description: "Your recent sent mail only uses signatures you have.",
      });
    setFound(sentSignatures);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setEditing({ name: "", html: "" })}>
          <Plus className="mr-2 size-4" />
          Add
        </Button>
        <Button
          size="sm"
          variant="outline"
          loading={isFinding}
          onClick={handleFind}
        >
          <Search className="mr-2 size-4" />
          Find in sent mail
        </Button>
      </div>

      {found.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Found in your sent mail</h4>
          {found.map((item) => (
            <Card key={item.html} className="flex items-start gap-4 p-3">
              <div className="flex-1">
                <SignaturePreview
                  signature={item.html}
                  className="h-28 min-h-0"
                />
                <p className="mt-1 text-muted-foreground text-xs">
                  Used in {item.count} recent{" "}
                  {item.count === 1 ? "email" : "emails"}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing({ name: "", html: item.html })}
              >
                Add
              </Button>
            </Card>
          ))}
        </div>
      )}

      <LoadingContent loading={isLoading} error={error}>
        {signatures.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No other signatures yet. Add one, or find the ones you already use
            in your sent mail.
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
              {editing?.id ? "Edit signature" : "Add signature"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Name the signature and set its content.
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
          Edit
        </Button>
        <ConfirmDialog
          title="Delete signature"
          description={`Delete ${signature.name}? This cannot be undone.`}
          confirmText="Delete"
          onConfirm={async () => {
            try {
              setIsDeleting(true);
              const result = await deleteSignatureAction(emailAccountId, {
                id: signature.id,
              });
              if (result?.serverError) {
                toastError({
                  title: "Error deleting signature",
                  description: result.serverError,
                });
                return;
              }
              toastSuccess({ description: "Signature deleted" });
              onDeleted();
            } finally {
              setIsDeleting(false);
            }
          }}
          trigger={
            <Button
              aria-label={`Delete ${signature.name}`}
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
        title: "Error saving signature",
        description: result.serverError,
      });
      return;
    }
    toastSuccess({ description: "Signature saved" });
    onSaved(signature.html);
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <Input
        type="text"
        name="name"
        label="Name"
        placeholder="German"
        registerProps={register("name")}
        error={errors.name}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          type="text"
          autosizeTextarea
          rows={8}
          name="html"
          label="Signature (HTML supported)"
          registerProps={register("html")}
          error={errors.html}
        />
        <SignaturePreview signature={watch("html")} />
      </div>
      <Button type="submit" loading={isSubmitting}>
        Save signature
      </Button>
    </form>
  );
}
