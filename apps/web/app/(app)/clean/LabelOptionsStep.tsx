"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { TypographyH3 } from "@/components/Typography";
import { Input } from "@/components/Input";
import { useStep } from "@/app/(app)/clean/useStep";

// Define the schema for the label input
const labelInputSchema = z.object({
  labelInstructions: z.string().optional(),
});

type LabelInputs = z.infer<typeof labelInputSchema>;

export function LabelOptionsStep() {
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
      <TypographyH3>Any emails you want labeled a certain way?</TypographyH3>

      {/* <SectionDescription className="mt-4">
        For example, you might want to label work emails as "Work" and not
        archive them, or label emails that need a reply as "Reply Needed".
      </SectionDescription> */}

      <form onSubmit={handleSubmit(onLabelSubmit)} className="mt-6">
        <Input
          type="text"
          autosizeTextarea
          rows={3}
          name="labelInstructions"
          placeholder={`E.g.,
I work as a freelance designer. Don't archive emails from my clients. Label them: 'Freelance'.
Skip emails that need a reply and label them: 'Reply Needed'.`}
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
