import { useState } from "react";
import { FilterIcon } from "lucide-react";
import { DetailedStatsFilter } from "@/app/(app)/[emailAccountId]/stats/DetailedStatsFilter";

export function useEmailsToIncludeFilter() {
  const [types, setTypes] = useState<
    Record<"read" | "unread" | "archived" | "unarchived", boolean>
  >({
    read: true,
    unread: true,
    archived: true,
    unarchived: true,
  });

  return {
    types,
    typesArray: Object.entries(types)
      .filter(([, selected]) => selected)
      .map(([key]) => key) as ("read" | "unread" | "archived" | "unarchived")[],
    setTypes,
  };
}

export function EmailsToIncludeFilter(props: {
  types: Record<"read" | "unread" | "archived" | "unarchived", boolean>;
  setTypes: React.Dispatch<
    React.SetStateAction<
      Record<"read" | "unread" | "archived" | "unarchived", boolean>
    >
  >;
}) {
  const { types, setTypes } = props;

  return (
    <DetailedStatsFilter
      label="Emails to include"
      icon={<FilterIcon className="mr-2 h-4 w-4" />}
      keepOpenOnSelect
      columns={[
        {
          label: "Read",
          checked: types.read,
          setChecked: () => setTypes({ ...types, read: !types.read }),
        },
        {
          label: "Unread",
          checked: types.unread,
          setChecked: () => setTypes({ ...types, unread: !types.unread }),
        },
        {
          label: "Unarchived",
          checked: types.unarchived,
          setChecked: () =>
            setTypes({ ...types, unarchived: !types.unarchived }),
        },
        {
          label: "Archived",
          checked: types.archived,
          setChecked: () => setTypes({ ...types, archived: !types.archived }),
        },
      ]}
    />
  );
}
