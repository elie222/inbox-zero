"use client";

import { PlusSmallIcon } from "@heroicons/react/24/outline";
import { useGmail } from "@/providers/GmailProvider";
import { Tag } from "@/components/Tag";
import { capitalCase } from "capital-case";
import { SectionDescription, SectionHeader } from "@/components/Typography";
import { recommendedLabels } from "@/utils/label";
import { createLabelAction } from "@/utils/actions";
import { toastError, toastSuccess } from "@/components/Toast";
import { FormSection, FormSectionLeft } from "@/components/Form";

export function LabelsSection() {
  const { labels } = useGmail();

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
