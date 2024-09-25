"use client";

import { Button } from "@/components/ui/button";

export function TestErrorButton() {
  return (
    <Button
      variant="destructive"
      onClick={() => {
        throw new Error("Sentry Frontend Error");
      }}
    >
      Throw error
    </Button>
  );
}
