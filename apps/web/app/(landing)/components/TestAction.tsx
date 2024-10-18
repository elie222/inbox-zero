"use client";

import { Button } from "@/components/ui/button";
import { testAction } from "./test-action";

export function TestActionButton() {
  return (
    <Button
      variant="destructive"
      onClick={async () => {
        try {
          const res = await testAction();
          console.log("🚀 ~ onClick={ ~ res:", res);
          alert(`Action completed: ${res}`);
        } catch (error) {
          console.error("🚀 ~ onClick={ ~ error:", error);
          alert(`Action failed: ${error}`);
        }
      }}
    >
      Test Action
    </Button>
  );
}
