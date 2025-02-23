"use client";

import { useCallback } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { toastSuccess, toastError } from "@/components/Toast";
import { isErrorMessage } from "@/utils/error";
import { Toggle } from "@/components/Toggle";

type Inputs = {
  instructions: string;
  autoDraftReply: boolean;
  draftReplyInstructions: string;
};

export const ReplyTrackerSettings = () => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = useForm<Inputs>();

  const onSubmit: SubmitHandler<Inputs> = useCallback(async (data) => {
    // const res = await updateProfile(data);
    // if (isErrorMessage(res)) toastError({ description: `` });
    // else toastSuccess({ description: `` });
  }, []);

  const autoDraftReply = watch("autoDraftReply");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        type="text"
        as="textarea"
        rows={5}
        name="instructions"
        label="When to reply"
        registerProps={register("instructions", { required: true })}
        error={errors.instructions}
      />
      <Toggle
        name="auto-draft"
        label="Draft replies"
        enabled={autoDraftReply}
        onChange={(checked) => setValue("autoDraftReply", checked)}
      />

      {autoDraftReply && (
        <Input
          type="text"
          as="textarea"
          rows={5}
          name="draftReplyInstructions"
          label="How to draft the reply"
          registerProps={register("draftReplyInstructions", { required: true })}
          error={errors.draftReplyInstructions}
        />
      )}

      <Button type="submit" loading={isSubmitting}>
        Save
      </Button>
    </form>
  );
};
