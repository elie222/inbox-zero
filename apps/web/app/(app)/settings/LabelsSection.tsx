"use client";

import { useCallback, useMemo } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import useSwr, { useSWRConfig } from "swr";
import { capitalCase } from "capital-case";
import sortBy from "lodash/sortBy";
import { Button } from "@/components/Button";
import {
  FormSection,
  FormSectionLeft,
  SubmitButtonWrapper,
} from "@/components/Form";
import { Input } from "@/components/Input";
import { LoadingContent } from "@/components/LoadingContent";
import { Tag } from "@/components/Tag";
import { toastError, toastSuccess } from "@/components/Toast";
import { Toggle } from "@/components/Toggle";
import { SectionDescription, SectionHeader } from "@/components/Typography";
import {
  GmailLabel,
  GmailLabels,
  GmailProvider,
  useGmail,
} from "@/providers/GmailProvider";
import { createLabelAction, updateLabels } from "@/utils/actions";
import { PlusSmallIcon } from "@heroicons/react/24/outline";
import { useModal, Modal } from "@/components/Modal";
import { type Label } from "@prisma/client";
import { postRequest } from "@/utils/api";
import {
  CreateLabelBody,
  CreateLabelResponse,
} from "@/app/api/google/labels/create/controller";
import { UserLabelsResponse } from "@/app/api/user/labels/route";

const recommendedLabels = ["Newsletter", "Receipt", "Calendar"];

type ToggleKey = `toggle-${string}`;
type DescriptionKey = `description-${string}`;

type Inputs = Record<ToggleKey, boolean | undefined | null> &
  Record<DescriptionKey, string | undefined | null>;

export const LabelsSection = () => {
  const { data, isLoading, error } =
    useSwr<UserLabelsResponse>("/api/user/labels");

  return (
    <GmailProvider>
      <LoadingContent loading={isLoading} error={error}>
        {data && <LabelsSectionForm dbLabels={data} />}
      </LoadingContent>
    </GmailProvider>
  );
};

function LabelsSectionForm(props: { dbLabels: Label[] }) {
  const { labels, labelsIsLoading } = useGmail();

  return (
    <LoadingContent loading={labelsIsLoading}>
      {labels && (
        <LabelsSectionFormInner
          gmailLabels={labels}
          dbLabels={props.dbLabels}
        />
      )}
    </LoadingContent>
  );
}

function LabelsSectionFormInner(props: {
  gmailLabels: GmailLabels;
  dbLabels: Label[];
}) {
  const { gmailLabels, dbLabels } = props;

  const userLabels = useMemo(() => {
    return sortBy(
      Object.values(gmailLabels || {})
        .filter((l) => l.type !== "system")
        .map((l) => {
          const dbLabel = dbLabels.find((el) => el.gmailLabelId === l.id);

          return {
            ...dbLabel,
            ...l,
          };
        }),
      (l) => (l.enabled ? 0 : 1),
    );
  }, [gmailLabels, dbLabels]);

  const defaultValues = Object.fromEntries(
    userLabels.flatMap((l) => {
      return [
        [`toggle-${l.id}`, l.enabled],
        [`description-${l.id}`, l.description],
      ];
    }),
  );

  const {
    register,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Inputs>({
    defaultValues,
  });

  const recommendedLabelsToCreate = recommendedLabels.filter(
    (label) =>
      !Object.values(gmailLabels || {})
        .map((l) => l.name.toLowerCase())
        .find((l) => l.indexOf(label.toLowerCase()) > -1),
  );

  return (
    <FormSection>
      <FormSectionLeft
        title="Labels"
        description="The labels in your inbox help you organize your emails."
      />

      <div className="flex items-start md:col-span-2">
        <div className="w-full">
          <SectionHeader>Your Labels</SectionHeader>
          <SectionDescription>
            Labels help our AI properly categorize your emails. You can add a
            description to help the AI decide how to make use of each one. We
            will only make use of enabled labels. Visit Gmail to delete labels.
          </SectionDescription>
          <div className="mt-2">
            <AddLabelModal />

            <form
              className="mt-4"
              action={async (formData: FormData) => {
                const formLabels = userLabels.map((l) => {
                  const toggle = getValues(`toggle-${l.id}`);
                  const description = formData.get(
                    `description-${l.id}`,
                  ) as string;

                  return {
                    ...l,
                    enabled: !!toggle,
                    description,
                    gmailLabelId: l.id,
                  };
                });

                try {
                  await updateLabels(formLabels);
                  toastSuccess({ description: "Updated labels!" });
                } catch (error) {
                  console.error(error);
                  toastError({
                    description: "There was an error updating your labels.",
                  });
                }
              }}
            >
              <div className="space-y-2">
                {userLabels.map((label) => (
                  <LabelItem
                    key={label.id}
                    label={label}
                    register={register}
                    watch={watch}
                    setValue={setValue}
                    errors={errors}
                  />
                ))}
              </div>

              <SubmitButtonWrapper>
                <Button type="submit" size="lg" loading={isSubmitting}>
                  Save
                </Button>
              </SubmitButtonWrapper>
            </form>
          </div>

          {/* <>
            <SectionHeader>Your Gmail Labels</SectionHeader>
            <SectionDescription>
              These are all your existing labels.
            </SectionDescription>

            <div className="mt-2">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {Object.values(labels || {}).map((label) => (
                  <Tag key={label.name} customColors={label.color}>
                    {label?.type === "system"
                      ? capitalCase(label.name)
                      : label.name}
                  </Tag>
                ))}
              </div>
            </div>
          </> */}

          {!!recommendedLabelsToCreate.length && (
            <div className="mt-8">
              <SectionHeader>Suggested Labels</SectionHeader>
              <SectionDescription>
                Labels we suggest adding to organise your emails. Click a label
                to add it.
              </SectionDescription>
              <div className="mt-2">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {recommendedLabelsToCreate.map((label) => (
                    <button
                      key={label}
                      className="group"
                      onClick={async () => {
                        try {
                          await createLabelAction({ name: label });
                          toastSuccess({
                            description: `Label "${label}" created!`,
                          });
                        } catch (error) {
                          toastError({
                            description: `Failed to create label "${label}"`,
                          });
                        }
                      }}
                    >
                      <Tag>
                        <div className="relative flex w-full items-center justify-center">
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

export function LabelItem(props: {
  label: GmailLabel;
  register: any;
  watch: any;
  setValue: any;
  errors: any;
}) {
  const { label, register, watch, setValue, errors } = props;

  return (
    <div className="grid grid-cols-4 items-center gap-x-4 gap-y-6">
      <div className="">
        <Tag color="white" customColors={label.color}>
          {label?.type === "system" ? capitalCase(label.name) : label.name}
        </Tag>
      </div>

      <div className="col-span-3 flex items-center space-x-2">
        <Toggle
          name={`toggle-${label.id}`}
          enabled={!!watch(`toggle-${label.id}`)}
          onChange={(value) => setValue(`toggle-${label.id}`, value)}
          error={errors[`toggle-${label.id}`]}
        />

        <div className="flex-1">
          <Input
            type="text"
            as="textarea"
            rows={2}
            name={`description-${label.id}`}
            label=""
            registerProps={register(`description-${label.id}`)}
            error={errors[`description-${label.id}`]}
          />
        </div>
      </div>
    </div>
  );
}

// server actions was fun to try out but cba to waste time battling with it
function AddLabelModal() {
  const { isModalOpen, openModal, closeModal } = useModal();

  const { mutate } = useSWRConfig();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ name: string; description: string }>();

  const onSubmit: SubmitHandler<{ name: string; description: string }> =
    useCallback(
      async (data) => {
        const { name, description } = data;
        try {
          await postRequest<CreateLabelResponse, CreateLabelBody>(
            "/api/google/labels/create",
            {
              name,
              description,
            },
          );

          toastSuccess({
            description: `Label "${name}" created!`,
          });

          // TODO this doesn't work properly. still needs a page refresh
          // the problem is further up in this file where we're using useGmail
          // refetch labels
          mutate("/api/google/labels");
          mutate("/api/user/labels");

          closeModal();
        } catch (error) {
          console.error(`Failed to create label "${name}": ${error}`);
          toastError({
            description: `Failed to create label "${name}"`,
          });
        }
      },
      [closeModal, mutate],
    );

  return (
    <>
      <Button onClick={() => openModal()}>Add Label</Button>
      <Modal isOpen={isModalOpen} hideModal={closeModal} title="Add Label">
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4">
            <Input
              type="text"
              name="name"
              label="Name"
              placeholder="e.g. Newsletter"
              registerProps={register("name")}
              error={errors.name}
            />

            <Input
              type="text"
              as="textarea"
              rows={2}
              name="description"
              label="Description"
              placeholder="e.g. Emails from newsletters"
              registerProps={register("description")}
              error={errors.description}
            />

            <SubmitButtonWrapper>
              <Button type="submit" size="lg" loading={isSubmitting}>
                Create
              </Button>
            </SubmitButtonWrapper>
          </div>
        </form>
      </Modal>
    </>
  );
}
