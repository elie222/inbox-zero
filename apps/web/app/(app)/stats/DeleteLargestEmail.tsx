"use client";

import { Button, ButtonLoader } from "@/components/ui/button";
import { onTrashMessage } from "@/utils/actions-client";
import { Trash2Icon } from "lucide-react";
import { useState } from "react";

export function DeleteLargestEmail(props: {
  itemId: string;
  mutate: () => Promise<any>;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const { itemId } = props;
  return (
    <>
      <Button
        key={itemId}
        disabled={isDeleting}
        variant="secondary"
        size="sm"
        onClick={async () => {
          if (itemId) {
            setIsDeleting(true);
            await onTrashMessage(itemId!);
            await props.mutate();
          }
        }}
      >
        {isDeleting ? (
          <>
            <ButtonLoader />
            Deleting...
          </>
        ) : (
          <>
            <Trash2Icon className="mr-2 h-4 w-4" />
            Delete
          </>
        )}
      </Button>
    </>
  );
}
