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
  } = useForm<SaveAboutBody>({
    defaultValues: { about: about ?? "" },
  });

  return (
    <form
      action={async (formData: FormData) => {
        const about = formData.get("about") as string;
        const result = await saveAboutAction({ about });
        handleActionResult(result, "Updated profile!");
      }}
    >
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
                rows={3}
                name="about"
                label="About you"
                registerProps={register("about", { required: true })}
                error={errors.about}
                placeholder={`Some rules to follow:
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
