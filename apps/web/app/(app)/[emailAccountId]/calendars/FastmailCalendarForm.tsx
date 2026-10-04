"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useCalendars } from "@/hooks/useCalendars";
import { connectFastmailCalendarAction } from "@/utils/actions/calendar";
import { connectFastmailCalendarBody } from "@/utils/actions/calendar.validation";
import { getActionErrorMessage } from "@/utils/error";
import { toastError, toastSuccess } from "@/components/Toast";

export function FastmailCalendarForm() {
  const [open, setOpen] = useState(false);
  const { emailAccountId, userEmail } = useAccount();
  const { mutate } = useCalendars();
  const form = useForm<z.infer<typeof connectFastmailCalendarBody>>({
    resolver: zodResolver(connectFastmailCalendarBody),
    defaultValues: { email: userEmail, appPassword: "" },
  });
  const { execute, isExecuting } = useAction(
    connectFastmailCalendarAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        form.reset({ email: form.getValues("email"), appPassword: "" });
        setOpen(false);
        mutate();
        toastSuccess({ description: "Fastmail calendar connected." });
      },
      onError: ({ error }) =>
        toastError({
          description:
            getActionErrorMessage(error) ?? "Could not connect your calendar.",
        }),
    },
  );
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Add Fastmail Calendar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Fastmail Calendar</DialogTitle>
            <DialogDescription>
              Create a separate app password with calendar access in Fastmail
              Settings → Privacy &amp; Security. Your mail API token cannot
              access calendars.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={form.handleSubmit(execute)}>
            <Input
              name="email"
              type="email"
              label="Fastmail email"
              registerProps={form.register("email")}
              error={form.formState.errors.email}
            />
            <Input
              name="appPassword"
              type="password"
              label="Calendar app password"
              registerProps={{
                ...form.register("appPassword"),
                autoComplete: "new-password",
              }}
              error={form.formState.errors.appPassword}
            />
            <Button type="submit" loading={isExecuting}>
              Connect Calendar
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
