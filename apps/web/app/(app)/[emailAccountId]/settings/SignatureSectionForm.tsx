"use client";

import { useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/Button";
import {
  saveSignatureAction,
  type SaveSignatureBody,
  loadSignatureFromGmailAction,
} from "@/utils/actions/user";
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

  const { emailAccountId } = useAccount();
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
  const { executeAsync: executeLoadSignatureFromGmail } = useAction(
    loadSignatureFromGmailAction.bind(null, emailAccountId),
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
                  const result = await executeLoadSignatureFromGmail();

                  if (result?.serverError) {
                    toastError({
                      title: "Error loading signature from Gmail",
                      description: result.serverError,
                    });
                    return;
                  } else if (result?.data?.signature) {
                    editorRef.current?.appendContent(result.data.signature);
                  } else {
                    toastInfo({
                      title: "Load completed",
                      description: "No signature found in Gmail",
                    });
                  }
                }}
              >
                Load from Gmail
              </Button>
            </div>
          </SubmitButtonWrapper>
        </div>
      </FormSection>
    </form>
  );
};
