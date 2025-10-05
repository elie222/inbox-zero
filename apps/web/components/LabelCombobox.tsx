"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/Combobox";
import { createLabelAction } from "@/utils/actions/mail";
import type { EmailLabel } from "@/providers/EmailProvider";

export function LabelCombobox({
  value,
  onChangeValue,
  userLabels,
  isLoading,
  mutate,
  emailAccountId,
}: {
  value: string;
  onChangeValue: (value: string) => void;
  userLabels: EmailLabel[];
  isLoading: boolean;
  mutate: () => void;
  emailAccountId: string;
}) {
  const [search, setSearch] = useState("");

  const selectedLabel = userLabels.find((label) => label.id === value);

  return (
    <Combobox
      options={userLabels.map((label) => ({
        value: label.id || "",
        label: label.name || "",
      }))}
      value={value}
      onChangeValue={onChangeValue}
      search={search}
      onSearch={setSearch}
      placeholder={selectedLabel?.name || "Select a label"}
      emptyText={
        <div>
          <div>No labels</div>
          {search && (
            <Button
              className="mt-2"
              variant="outline"
              onClick={() => {
                toast.promise(
                  async () => {
                    const res = await createLabelAction(emailAccountId, {
                      name: search,
                    });
                    mutate();
                    if (res?.serverError) throw new Error(res.serverError);
                  },
                  {
                    loading: `Creating label "${search}"...`,
                    success: `Created label "${search}"`,
                    error: (errorMessage) =>
                      `Error creating label "${search}": ${errorMessage}`,
                  },
                );
              }}
            >
              {`Create "${search}" label`}
            </Button>
          )}
        </div>
      }
      loading={isLoading}
    />
  );
}
