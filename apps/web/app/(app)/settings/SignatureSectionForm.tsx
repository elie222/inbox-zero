"use client";

import { useCallback, useRef } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
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
import { isActionError } from "@/utils/error";
import { toastError, toastInfo, toastSuccess } from "@/components/Toast";
import { ClientOnly } from "@/components/ClientOnly";

export const SignatureSectionForm = ({
  signature,
}: {
  signature: string | null;
}) => {
  const defaultSignature = signature ?? "";

  const {
    handleSubmit,
    setValue,
    formState: { isSubmitting },
  } = useForm<SaveSignatureBody>({
    defaultValues: { signature: defaultSignature },
  });

  const editorRef = useRef<TiptapHandle>(null);

  const onSubmit: SubmitHandler<SaveSignatureBody> = useCallback(
    async (data) => {
      const res = await saveSignatureAction(data);
      if (isActionError(res)) toastError({ description: res.error });
      else toastSuccess({ description: "Signature saved" });
    },
    [],
  );

  const handleEditorChange = useCallback(
    (html: string) => {
      setValue("signature", html);
    },
    [setValue],
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
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
              <Button type="submit" size="lg" loading={isSubmitting}>
                Save
              </Button>
              <Button
                type="button"
                size="lg"
                color="white"
                onClick={async () => {
                  const result = await loadSignatureFromGmailAction();

                  if (isActionError(result)) {
                    toastError({
                      title: "Error loading signature from Gmail",
                      description: result.error,
                    });
                    return;
                  } else if (result.signature) {
                    editorRef.current?.appendContent(result.signature);
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
