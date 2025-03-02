import { zodResolver } from "@hookform/resolvers/zod";
import { type SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { TypographyH3 } from "@/components/Typography";
import { SectionDescription } from "@/components/Typography";
import { Input } from "@/components/Input";

// Define the schema for the label input
const labelInputSchema = z.object({
  labelInstructions: z.string().optional(),
});

type LabelInputs = z.infer<typeof labelInputSchema>;

interface LabelOptionsStepProps {
  onSubmit: (labelInstructions: string) => void;
}

export function LabelOptionsStep({ onSubmit }: LabelOptionsStepProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LabelInputs>({
    resolver: zodResolver(labelInputSchema),
  });

  const onLabelSubmit: SubmitHandler<LabelInputs> = (data) => {
    onSubmit(data.labelInstructions || "");
  };

  return (
    <div className="text-center">
      <TypographyH3 className="mb-4">
        Any emails you want labeled a certain way?
      </TypographyH3>

      <SectionDescription className="mx-auto mb-6 max-w-prose">
        For example, you might want to label work emails as "Work" and not
        archive them, or label emails that need a reply as "Reply Needed".
      </SectionDescription>

      <form onSubmit={handleSubmit(onLabelSubmit)} className="mx-auto max-w-md">
        <Input
          type="text"
          autosizeTextarea
          rows={3}
          name="labelInstructions"
          placeholder="E.g., Label work emails as 'Work' and don't archive them. Label emails that need a reply as 'Reply Needed'."
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
