"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/Input";
import { getApiError, PublicShell } from "../../[slug]/BookingPageClient";

export function CancelBookingClient({
  token,
  uid,
}: {
  token?: string;
  uid: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;

    const formData = new FormData(event.currentTarget);
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/public/bookings/${uid}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          reason: formData.get("reason") || undefined,
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
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PublicShell title="Cancel booking">
      <Card>
        <CardContent className="p-5">
          {done ? (
            <p className="text-sm text-muted-foreground">Booking canceled.</p>
          ) : token ? (
            <form onSubmit={submit} className="space-y-4">
              <Input
                type="text"
                autosizeTextarea
                rows={3}
                name="reason"
                label="Reason"
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
    </PublicShell>
  );
}
