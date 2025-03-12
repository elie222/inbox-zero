"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryState, parseAsString, parseAsBoolean } from "nuqs";
import { type SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { TypographyH3 } from "@/components/Typography";
import { Input } from "@/components/Input";
import { useStep } from "@/app/(app)/clean/useStep";
import { Toggle } from "@/components/Toggle";

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
  const [showCustom, setShowCustom] = useState(false);
  const [skipReply, setSkipReply] = useQueryState(
    "skipReply",
    parseAsBoolean.withDefault(true),
  );
  const [skipCalendar, setSkipCalendar] = useQueryState(
    "skipCalendar",
    parseAsBoolean.withDefault(true),
  );
  const [skipReceipt, setSkipReceipt] = useQueryState(
    "skipReceipt",
    parseAsBoolean.withDefault(false),
  );
  const [skipAttachment, setSkipAttachment] = useQueryState(
    "skipAttachment",
    parseAsBoolean.withDefault(false),
  );

  const onSubmit: SubmitHandler<Inputs> = (data) => {
    setInstructions(data.instructions || "");
    onNext();
  };

  return (
    <div className="text-center">
      <TypographyH3>Any emails you want us to skip?</TypographyH3>

      <div className="mt-4 grid gap-4">
        <Toggle
          name="reply"
          enabled={skipReply}
          onChange={setSkipReply}
          labelRight="Skip emails needing replies"
        />
        <Toggle
          name="calendar"
          enabled={skipCalendar}
          onChange={setSkipCalendar}
          labelRight="Skip future events"
        />
        <Toggle
          name="receipt"
          enabled={skipReceipt}
          onChange={setSkipReceipt}
          labelRight="Skip receipts"
        />
        <Toggle
          name="attachment"
          enabled={skipAttachment}
          onChange={setSkipAttachment}
          labelRight="Skip anything with an attachment"
        />
      </div>

      <div className="mt-4">
        <Button variant="secondary" onClick={() => setShowCustom(!showCustom)}>
          Set Custom Instructions
        </Button>
      </div>

      {showCustom && (
        <form onSubmit={handleSubmit(onSubmit)} className="mt-4">
          <Input
            type="text"
            autosizeTextarea
            rows={3}
            name="instructions"
            registerProps={register("instructions")}
            placeholder={`Example:

I work as a freelance designer. Label emails from clients as "Freelance".
Don't archive emails needing a reply.`}
            error={errors.instructions}
          />
        </form>
      )}

      <div className="mt-6 flex justify-center">
        <Button onClick={onNext}>Continue</Button>
      </div>
    </div>
  );
}
