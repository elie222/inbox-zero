"use client";

import { useRef } from "react";
import { useForm } from "react-hook-form";
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
import { handleActionResult } from "@/utils/server-action";
import { Tiptap, type TiptapHandle } from "@/components/editor/Tiptap";
import { isActionError } from "@/utils/error";
import { toastError, toastInfo } from "@/components/Toast";

export const SignatureSectionForm = (props: { signature?: string }) => {
  const {
    register,
    formState: { errors, isSubmitting },
  } = useForm<SaveSignatureBody>({
    defaultValues: { signature: props.signature },
  });

  const editorRef = useRef<TiptapHandle>(null);

  return (
    <form
      action={async (formData: FormData) => {
        const signature = formData.get("signature") as string;
        const result = await saveSignatureAction({ signature });
        handleActionResult(result, "Updated signature!");
      }}
    >
      <FormSection>
        <FormSectionLeft
          title="Signature"
          description="Appended at the end of all outgoing messages."
        />
        <div className="md:col-span-2">
          <FormSectionRight>
            <div className="sm:col-span-full">
              <Tiptap
                ref={editorRef}
                initialContent={props.signature}
                onChange={(html) =>
                  register("signature").onChange({ target: { value: html } })
                }
                className="min-h-[100px]"
              />
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
