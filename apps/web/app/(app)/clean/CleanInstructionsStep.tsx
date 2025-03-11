"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryState, parseAsString } from "nuqs";
import { type SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { SectionDescription, TypographyH3 } from "@/components/Typography";
import { Input } from "@/components/Input";
import { useStep } from "@/app/(app)/clean/useStep";

const schema = z.object({ instructions: z.string().optional() });

type Inputs = z.infer<typeof schema>;

export function CleanInstructionsStep() {
  const { onNext } = useStep();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
  });
  const [_, setInstructions] = useQueryState("instructions", parseAsString);

  const onSubmit: SubmitHandler<Inputs> = (data) => {
    setInstructions(data.instructions || "");
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

      <form onSubmit={handleSubmit(onSubmit)} className="mt-2">
        <Input
          type="text"
          autosizeTextarea
          rows={3}
          name="instructions"
          registerProps={register("instructions")}
          placeholder="Optional"
          error={errors.instructions}
        />

        <div className="mt-6 flex justify-center">
          <Button type="submit">Continue</Button>
        </div>
      </form>
    </div>
  );
}
