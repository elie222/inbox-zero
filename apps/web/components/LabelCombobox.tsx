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
  value: {
    id: string | null;
    name: string | null;
  };
  onChangeValue: (value: string) => void;
  userLabels: EmailLabel[];
  isLoading: boolean;
  mutate: () => Promise<unknown>;
  emailAccountId: string;
}) {
  const [search, setSearch] = useState("");

  const selectedLabel = userLabels.find(
    (label) => label.id === value.id || label.name === value.name,
  );

  return (
    <Combobox
      options={userLabels.map((label) => ({
        value: label.id || "",
        label: label.name || "",
      }))}
      value={value.id || ""}
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
                const searchValue = search;

                toast.promise(
                  async () => {
                    const res = await createLabelAction(emailAccountId, {
                      name: searchValue,
                    });
                    if (res?.serverError) throw new Error(res.serverError);

                    await mutate();

                    setSearch("");

                    // Auto-select the newly created label
                    if (res?.data?.id) {
                      onChangeValue(res.data.id);
                    }

                    return res;
                  },
                  {
                    loading: `Creating label "${searchValue}"...`,
                    success: `Created label "${searchValue}"`,
                    error: (errorMessage) =>
                      `Error creating label "${searchValue}": ${errorMessage}`,
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
