"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { SectionDescription, TypographyH3 } from "@/components/Typography";
import { Input } from "@/components/Input";
import { useStep } from "@/app/(app)/clean/useStep";

// Define the schema for the label input
const labelInputSchema = z.object({
  labelInstructions: z.string().optional(),
});

type LabelInputs = z.infer<typeof labelInputSchema>;

export function CleanInstructionsStep() {
  const { onNext } = useStep();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LabelInputs>({
    resolver: zodResolver(labelInputSchema),
  });

  const onLabelSubmit: SubmitHandler<LabelInputs> = (data) => {
    // onSubmit(data.labelInstructions || "");
    onNext();
  };

  return (
    <div className="text-center">
      <TypographyH3>Any emails you want to be skipped?</TypographyH3>

      <SectionDescription className="mt-4 max-w-prose text-left">
        <strong>Example:</strong>
        <br />I work as a freelance designer. Label clients emails as
        "Freelance".
        <br />
        Don't archive emails needing a reply.
      </SectionDescription>

      <form onSubmit={handleSubmit(onLabelSubmit)} className="mt-2">
        <Input
          type="text"
          autosizeTextarea
          rows={3}
          name="labelInstructions"
          registerProps={register("labelInstructions")}
          error={errors.labelInstructions}
        />

        <div className="mt-6 flex justify-center">
          <Button type="submit">Continue</Button>
        </div>
      </form>
    </div>
  );
}
