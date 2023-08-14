"use client";

import { useForm } from "react-hook-form";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { saveAboutAction, type SaveAboutBody } from "@/utils/actions";
import { toastError, toastSuccess } from "@/components/Toast";
import {
  FormSection,
  FormSectionLeft,
  FormSectionRight,
  SubmitButtonWrapper,
} from "@/components/Form";

export const AboutSectionForm = (props: { about?: string }) => {
  const {
    register,
    formState: { errors, isSubmitting },
  } = useForm<SaveAboutBody>({
    defaultValues: { about: props.about },
  });

  return (
    <form
      action={async (formData: FormData) => {
        try {
          const about = formData.get("about") as string;
          await saveAboutAction({ about });
          toastSuccess({ description: "Updated profile!" });
        } catch (error) {
          console.error(error);
          toastError({
            description: "There was an error updating your profile.",
          });
        }
      }}
    >
      <FormSection>
        <FormSectionLeft
          title="Prompt Settings"
          description="Provide extra information to GPT to help it write better emails for you."
        />
        <div className="md:col-span-2">
          <FormSectionRight>
            <div className="sm:col-span-full">
              <Input
                type="text"
                as="textarea"
                rows={8}
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
            <Button type="submit" size="lg" loading={isSubmitting}>
              Save
            </Button>
          </SubmitButtonWrapper>
        </div>
      </FormSection>
    </form>
  );
};
