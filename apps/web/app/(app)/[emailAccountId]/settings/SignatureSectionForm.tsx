"use client";

import { useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/Button";
import {
  saveSignatureAction,
  type SaveSignatureBody,
} from "@/utils/actions/user";
import { fetchSignaturesFromProviderAction } from "@/utils/actions/email-account";
import {
  FormSection,
  FormSectionLeft,
  FormSectionRight,
  SubmitButtonWrapper,
} from "@/components/Form";
import { Tiptap, type TiptapHandle } from "@/components/editor/Tiptap";
import { toastError, toastInfo, toastSuccess } from "@/components/Toast";
import { ClientOnly } from "@/components/ClientOnly";
import { useAccount } from "@/providers/EmailAccountProvider";

export const SignatureSectionForm = ({
  signature,
}: {
  signature: string | null;
}) => {
  const defaultSignature = signature ?? "";

  const { handleSubmit, setValue } = useForm<SaveSignatureBody>({
    defaultValues: { signature: defaultSignature },
  });

  const editorRef = useRef<TiptapHandle>(null);

  const { emailAccountId, provider } = useAccount();
  const isGmail = provider === "google";

  const { execute, isExecuting } = useAction(
    saveSignatureAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Signature saved" });
      },
      onError: (error) => {
        toastError({
          description: error.error.serverError ?? "An unknown error occurred",
        });
      },
    },
  );
  const { executeAsync: executeFetchSignatures } = useAction(
    fetchSignaturesFromProviderAction.bind(null, emailAccountId),
  );

  const handleEditorChange = useCallback(
    (html: string) => {
      setValue("signature", html);
    },
    [setValue],
  );

  return (
    <form onSubmit={handleSubmit(execute)}>
      <FormSection>
        <FormSectionLeft
          title="Signature"
          description="Appended at the end of all outgoing messages."
        />
        <div className="md:col-span-2">
          <FormSectionRight>
            <div className="sm:col-span-full">
              <ClientOnly>
                <Tiptap
                  ref={editorRef}
                  initialContent={defaultSignature}
                  onChange={handleEditorChange}
                  className="min-h-[100px]"
                />
              </ClientOnly>
            </div>
          </FormSectionRight>
          <SubmitButtonWrapper>
            <div className="flex gap-2">
              <Button type="submit" size="lg" loading={isExecuting}>
                Save
              </Button>
              <Button
                type="button"
                size="lg"
                color="white"
                onClick={async () => {
                  const result = await executeFetchSignatures();

                  if (result?.serverError) {
                    toastError({
                      title: `Error loading signature from ${isGmail ? "Gmail" : "Outlook"}`,
                      description: result.serverError,
                    });
                    return;
                  }

                  const signatures = result?.data?.signatures || [];
                  const defaultSig =
                    signatures.find((sig) => sig.isDefault) || signatures[0];

                  if (defaultSig?.signature) {
                    editorRef.current?.appendContent(defaultSig.signature);
                    toastSuccess({
                      title: "Signature loaded",
                      description: isGmail
                        ? "Loaded from Gmail"
                        : "Extracted from recent sent emails",
                    });
                  } else {
                    toastInfo({
                      title: "No signature found",
                      description: isGmail
                        ? "No signature found in your Gmail account"
                        : "No signature found in recent sent emails",
                    });
                  }
                }}
              >
                Load from {isGmail ? "Gmail" : "Outlook"}
              </Button>
            </div>
          </SubmitButtonWrapper>
        </div>
      </FormSection>
    </form>
  );
};
