"use client";

import { useCallback } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { useNotification } from "@/providers/NotificationProvider";

export default function Settings() {
  return (
    <FormWrapper>
      <SettingsForm />
      <DeleteSection />
    </FormWrapper>
  );
}

type Inputs = { background: string };

const SettingsForm = () => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Inputs>({
    defaultValues: {
      background: `I am the CEO of a company called ShareMint. We're a web3 affiliate marketing platform.

Some rules to follow:
* Be friendly, concise, and professional, but not overly formal.
* Draft responses of 1-3 sentences when necessary.
* Add the newsletter label to emails that are newsletters.
* Draft responses to snoozed emails that I haven't received a response to yet.`,
    },
  });
  const { showNotification } = useNotification();

  const onSubmit: SubmitHandler<Inputs> = useCallback(
    async (data) => {
      // const res = await updateProfile(data);
      // if (isErrorMessage(res))
      //   showNotification({ type: "error", description: `` });
      // else showNotification({ type: "success", description: `` });
    },
    [showNotification]
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
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
                name="background"
                label="About you"
                registerProps={register("background", { required: true })}
                error={errors.background}
              />
            </div>
          </FormSectionRight>
          <div className="mt-8 flex">
            <Button
              type="submit"
              size="sm"
              color="black"
              loading={isSubmitting}
            >
              Save
            </Button>
          </div>
        </div>
      </FormSection>
    </form>
  );
};

function DeleteSection() {
  return (
    <FormSection>
      <FormSectionLeft
        title="Delete account"
        description="No longer want to use our service? You can delete your account here. This action is not reversible. All information related to this account will be deleted permanently."
      />

      <form className="flex items-start md:col-span-2">
        <Button color="red" type="submit">
          Yes, delete my account
        </Button>
      </form>
    </FormSection>
  );
}

function FormWrapper(props: { children: React.ReactNode }) {
  return <div className="divide-y divide-black/5">{props.children}</div>;
}

function FormSection(props: { children: React.ReactNode }) {
  return (
    <div className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
      {props.children}
    </div>
  );
}

function FormSectionLeft(props: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold leading-7">{props.title}</h2>
      <p className="mt-1 text-sm leading-6 text-gray-700">
        {props.description}
      </p>
    </div>
  );
}

function FormSectionRight(props: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:max-w-xl sm:grid-cols-6">
      {props.children}
    </div>
  );
}
