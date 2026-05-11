"use client";

import { useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/Input";
import { publicCancelBookingBody } from "@/utils/actions/booking.validation";
import { getApiError } from "../../[slug]/booking-helpers";

// The token comes from the URL; the form only collects the reason.
const cancelFormSchema = publicCancelBookingBody.pick({ reason: true });
type CancelFormValues = z.infer<typeof cancelFormSchema>;

export function CancelBookingClient({
  token,
  id,
}: {
  token?: string;
  id: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CancelFormValues>({
    resolver: zodResolver(cancelFormSchema),
  });

  const onSubmit: SubmitHandler<CancelFormValues> = async (values) => {
    if (!token) return;
    setError(null);
    try {
      const response = await fetch(`/api/public/bookings/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          reason: values.reason || undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(getApiError(body));
      setDone(true);
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : "Failed to cancel booking",
      );
    }
  };

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-5">
        <h1 className="text-2xl font-medium tracking-tight text-foreground">
          Cancel booking
        </h1>
        <Card>
          <CardContent className="p-5">
            {done ? (
              <p className="text-sm text-muted-foreground">Booking canceled.</p>
            ) : token ? (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input
                  type="text"
                  autosizeTextarea
                  rows={3}
                  name="reason"
                  label="Reason"
                  registerProps={register("reason")}
                  error={errors.reason}
                />
                {error ? <p className="text-sm text-red-500">{error}</p> : null}
                <Button type="submit" loading={isSubmitting}>
                  Cancel booking
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                Cancellation token is missing.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
