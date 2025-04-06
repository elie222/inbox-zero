"use client";

import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { saveAboutAction, type SaveAboutBody } from "@/utils/actions/user";
import {
  FormSection,
  FormSectionLeft,
  FormSectionRight,
  SubmitButtonWrapper,
} from "@/components/Form";
import { handleActionResult } from "@/utils/server-action";

export const AboutSectionForm = ({ about }: { about: string | null }) => {
  const {
    register,
    formState: { errors, isSubmitting },
    handleSubmit,
  } = useForm<SaveAboutBody>({
    defaultValues: { about: about ?? "" },
  });

  const onSubmit = async (data: SaveAboutBody) => {
    const result = await saveAboutAction(data);
    handleActionResult(result, "Updated profile!");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormSection>
        <FormSectionLeft
          title="About you"
          description="Provide extra information that will help our AI better understand how to process your emails."
        />
        <div className="md:col-span-2">
          <FormSectionRight>
            <div className="sm:col-span-full">
              <Input
                type="text"
                autosizeTextarea
                rows={4}
                name="about"
                label="About you"
                registerProps={register("about")}
                error={errors.about}
                placeholder={`My name is John Doe. I'm the founder of a startup called Doe.
Some rules to follow:
* Be friendly, concise, and professional, but not overly formal.
* Keep responses short and to the point.`}
              />
            </div>
          </FormSectionRight>
          <SubmitButtonWrapper>
            <Button type="submit" loading={isSubmitting}>
              Save
            </Button>
          </SubmitButtonWrapper>
        </div>
      </FormSection>
    </form>
  );
};
