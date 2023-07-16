"use client";

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { capitalCase } from "capital-case";
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
import { GmailLabels, useGmail } from "@/providers/GmailProvider";
import { createLabelAction, updateLabels } from "@/utils/actions";
import { recommendedLabels } from "@/utils/label";
import { PlusSmallIcon } from "@heroicons/react/24/outline";
import { type Label } from "@prisma/client";

type ToggleKey = `toggle-${string}`;
type DescriptionKey = `description-${string}`;

type Inputs = Record<ToggleKey, boolean | undefined | null> &
  Record<DescriptionKey, string | undefined | null>;

export function LabelsSectionForm(props: { dbLabels: Label[] }) {
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
    return Object.values(gmailLabels || {})
      .filter((l) => l.type !== "system")
      .map((l) => {
        const dbLabel = dbLabels.find((el) => el.gmailLabelId === l.id);

        return {
          ...dbLabel,
          ...l,
        };
      });
  }, [gmailLabels, dbLabels]);

  const defaultValues = Object.fromEntries(
    userLabels.flatMap((l) => {
      return [
        [`toggle-${l.id}`, l.enabled],
        [`description-${l.id}`, l.description],
      ];
    })
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
          <SectionHeader>Your Labels</SectionHeader>
          <SectionDescription>
            Labels to label your emails with. You can add a description to help
            the AI decide how to use them. Visit Gmail to add more labels.
          </SectionDescription>
          <div className="mt-2">
            <form
              action={async (formData: FormData) => {
                const formLabels = userLabels.map((l) => {
                  const toggle = getValues(`toggle-${l.id}`);
                  const description = formData.get(
                    `description-${l.id}`
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
                  <div
                    key={label.name}
                    className="grid grid-cols-4 items-center gap-x-4 gap-y-6"
                  >
                    <div className="">
                      <Tag color="white" customColors={label.color}>
                        {label?.type === "system"
                          ? capitalCase(label.name)
                          : label.name}
                      </Tag>
                    </div>

                    <div className="col-span-3 flex items-center space-x-2">
                      <Toggle
                        name={`toggle-${label.id}`}
                        enabled={!!watch(`toggle-${label.id}`)}
                        onChange={(value) =>
                          setValue(`toggle-${label.id}`, value)
                        }
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
                ))}
              </div>

              <SubmitButtonWrapper>
                <Button
                  type="submit"
                  size="sm"
                  color="black"
                  loading={isSubmitting}
                >
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
                          await createLabelAction(label);
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
