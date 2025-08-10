"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export function StepLabels() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const suggested = useMemo(() => ["Leads", "Clients", "Transactions"], []);
  const basics = useMemo(() => ["To Reply", "Newsletter", "Marketing"], []);

  const [enabled, setEnabled] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-6">
      <div className="rounded-md border p-4">
        <div className="font-semibold">Labels suggested for you</div>
        <div className="mt-3 space-y-2">
          {suggested.map((name) => {
            const id = `suggested-${name.replace(/\s+/g, "-").toLowerCase()}`;
            return (
              <div key={name} className="flex items-center gap-3 text-sm">
                <Checkbox
                  id={id}
                  checked={!!enabled[name]}
                  onCheckedChange={(v) =>
                    setEnabled((s) => ({ ...s, [name]: Boolean(v) }))
                  }
                />
                <label htmlFor={id}>{name}</label>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-md border p-4">
        <div className="font-semibold">Basic labels</div>
        <div className="mt-3 space-y-2">
          {basics.map((name) => {
            const id = `basic-${name.replace(/\s+/g, "-").toLowerCase()}`;
            return (
              <div key={name} className="flex items-center gap-3 text-sm">
                <Checkbox
                  id={id}
                  checked={!!enabled[name]}
                  onCheckedChange={(v) =>
                    setEnabled((s) => ({ ...s, [name]: Boolean(v) }))
                  }
                />
                <label htmlFor={id}>{name}</label>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Button
          variant="secondary"
          onClick={() => router.push("/welcome-v2?step=2")}
        >
          Back
        </Button>
        <Button
          onClick={() =>
            startTransition(() => {
              // Persist will be wired later using updateLabelsAction
              router.push("/");
            })
          }
          disabled={isPending}
        >
          Finish
        </Button>
      </div>
    </div>
  );
}
