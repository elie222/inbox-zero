"use client";

import { useForm } from "react-hook-form";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { saveAboutAction } from "@/utils/actions/user";
import {
  FormSection,
  FormSectionLeft,
  FormSectionRight,
} from "@/components/Form";
import { useAccount } from "@/providers/EmailAccountProvider";
import { toastError, toastSuccess } from "@/components/Toast";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingContent } from "@/components/LoadingContent";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  type SaveAboutBody,
  saveAboutBody,
} from "@/utils/actions/user.validation";

export function AboutSection({ onSuccess }: { onSuccess?: () => void }) {
  const { data, isLoading, error, mutate } = useEmailAccountFull();

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="h-32 w-full" />}
    >
      <AboutSectionForm
        about={data?.about ?? null}
        mutate={mutate}
        onSuccess={onSuccess}
      />
    </LoadingContent>
  );
}

const AboutSectionForm = ({
  about,
  mutate,
  onSuccess,
}: {
  about: string | null;
  mutate: () => void;
  onSuccess?: () => void;
}) => {
  const {
    register,
    formState: { errors },
    handleSubmit,
  } = useForm<SaveAboutBody>({
    defaultValues: { about: about ?? "" },
    resolver: zodResolver(saveAboutBody),
  });

  const { emailAccountId } = useAccount();

  const { execute, isExecuting } = useAction(
    saveAboutAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({
          description: "Your profile has been updated!",
        });
        onSuccess?.();
      },
      onError: (error) => {
        toastError({
          description:
            error.error.serverError ??
            "An unknown error occurred while updating your profile",
        });
      },
      onSettled: () => {
        mutate();
      },
    },
  );

  return (
    <form onSubmit={handleSubmit(execute)}>
      <Input
        type="text"
        autosizeTextarea
        rows={4}
        name="about"
        label=""
        registerProps={register("about")}
        error={errors.about}
        placeholder={`My name is Alex Smith. I'm the founder of Acme.

- If I'm CC'd, it's not To Reply
- Emails from jane@accounting.com aren't Notifications`}
      />
      <Button type="submit" className="mt-8" loading={isExecuting}>
        Save
      </Button>
    </form>
  );
};
