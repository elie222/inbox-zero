"use client";

import { useCallback } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { PlusSmallIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { useNotification } from "@/providers/NotificationProvider";
import { useGmail } from "@/providers/GmailProvider";
import { Tag } from "@/components/Tag";
import { capitalCase } from "capital-case";
import { SectionDescription, SectionHeader } from "@/components/Typography";
import { recommendedLabels } from "@/utils/label";
import { createLabelAction } from "@/utils/actions";

export default function Settings() {
  return (
    <FormWrapper>
      <SettingsForm />
      <LabelsSection />
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

function LabelsSection() {
  const { labels } = useGmail();
  const { showNotification } = useNotification();

  const recommendedLabelsToCreate = recommendedLabels.filter(
    (label) =>
      !Object.values(labels || {})
        .map((l) => l.name.toLowerCase())
        .find((l) => l.indexOf(label.toLowerCase()) > -1)
  );

  return (
    <FormSection>
      <FormSectionLeft
        title="Labels"
        description="The labels in your inbox help you organize your emails. You can create new labels, edit existing ones, or delete them."
      />

      <div className="flex items-start md:col-span-2">
        <div className="w-full">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {Object.values(labels || {}).map((label) => (
              <Tag key={label.name} customColors={label.color}>
                {label?.type === "system"
                  ? capitalCase(label.name)
                  : label.name}
              </Tag>
            ))}
          </div>

          {!!recommendedLabelsToCreate.length && (
            <div className="mt-8">
              <SectionHeader>Suggested Labels</SectionHeader>
              <SectionDescription>
                Labels we suggest adding to organise your emails.
              </SectionDescription>
              <div className="mt-2">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {recommendedLabelsToCreate.map((label) => (
                    <button
                      key={label}
                      className="group"
                      onClick={async () => {
                        try {
                          await createLabelAction(label);
                          showNotification({
                            type: "success",
                            description: `Label "${label}" created!`,
                          });
                        } catch (error) {
                          showNotification({
                            type: "error",
                            description: `Failed to create label "${label}"`,
                          });
                        }
                      }}
                    >
                      <Tag>
                        <div className="relative flex items-center justify-center w-full">
                          {label}
                          <span className="absolute right-0 hidden group-hover:block">
                            <PlusSmallIcon className="h-4 w-4 text-gray-500" />
                          </span>
                        </div>
                      </Tag>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </FormSection>
  );
}

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
      <SectionHeader>{props.title}</SectionHeader>
      <SectionDescription>{props.description}</SectionDescription>
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
