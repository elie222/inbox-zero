"use client";

import { useCallback, useMemo, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
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
  type GmailLabel,
  type GmailLabels,
  GmailProvider,
  useGmail,
} from "@/providers/GmailProvider";
import { createLabelAction, updateLabelsAction } from "@/utils/actions/mail";
import type { Label } from "@prisma/client";
import type { UserLabelsResponse } from "@/app/api/user/labels/route";
import { PlusIcon } from "lucide-react";
import { isErrorMessage } from "@/utils/error";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAccount } from "@/providers/EmailAccountProvider";

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
  const { userLabels, labelsIsLoading } = useGmail();

  return (
    <LoadingContent loading={labelsIsLoading}>
      {userLabels && (
        <LabelsSectionFormInner
          gmailLabels={userLabels}
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

  const { emailAccountId } = useAccount();

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
                  await updateLabelsAction(emailAccountId, {
                    labels: formLabels,
                  });
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
                Labels we suggest adding to organize your emails. Click a label
                to add it.
              </SectionDescription>
              <div className="mt-2">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {recommendedLabelsToCreate.map((label) => (
                    <button
                      key={label}
                      type="button"
                      className="group"
                      onClick={async () => {
                        const res = await createLabelAction(emailAccountId, {
                          name: label,
                        });
                        if (isErrorMessage(res)) {
                          toastError({
                            title: `Failed to create label "${label}"`,
                            description: res.error,
                          });
                        } else {
                          toastSuccess({
                            description: `Label "${label}" created!`,
                          });
                        }
                      }}
                    >
                      <Tag>
                        <div className="relative flex w-full items-center justify-center">
                          {label}
                          <span className="absolute right-0 hidden group-hover:block">
                            <PlusIcon className="h-4 w-4 text-muted-foreground" />
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
        <Tag variant="white" customColors={label.color}>
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
            autosizeTextarea
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

function AddLabelModal() {
  const [isOpen, setIsOpen] = useState(false);

  const { emailAccountId } = useAccount();

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
          await createLabelAction(emailAccountId, { name, description });

          toastSuccess({
            description: `Label "${name}" created!`,
          });

          // TODO this doesn't work properly. still needs a page refresh
          // the problem is further up in this file where we're using useGmail
          // refetch labels
          mutate("/api/labels");
          mutate("/api/user/labels");

          setIsOpen(false);
        } catch (error) {
          console.error(`Failed to create label "${name}": ${error}`);
          toastError({
            description: `Failed to create label "${name}"`,
          });
        }
      },
      [mutate, emailAccountId],
    );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>Add Label</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Label</DialogTitle>
        </DialogHeader>
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
              autosizeTextarea
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
      </DialogContent>
    </Dialog>
  );
}
