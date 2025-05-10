"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSimpleProgress } from "@/app/(app)/[emailAccountId]/simple/SimpleProgressProvider";

export function calculateTimePassed(endTime: Date, startTime: Date) {
  return Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
}

export function SimpleProgress() {
  const { handled, toHandleLater, startTime } = useSimpleProgress();

  const emailsHandled = Object.keys(handled).length;
  const emailsToHandleLater = Object.keys(toHandleLater).length;

  // to force a re-render every second
  const [_index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const timePassed = calculateTimePassed(new Date(), startTime);

  return (
    <div className="bottom-8 right-8 m-4 lg:fixed lg:m-0">
      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
        </CardHeader>

        <CardContent className="grid gap-2">
          <Badge variant="outline">
            {Math.floor(timePassed / 60)}:
            {String(timePassed % 60).padStart(2, "0")}
          </Badge>
          <Badge variant="outline">{emailsHandled} handled</Badge>
          <Badge variant="outline">{emailsToHandleLater} to handle later</Badge>
        </CardContent>
      </Card>
    </div>
  );
}

export function SimpleProgressCompleted() {
  const { handled, toHandleLater, startTime, endTime, onCompleted } =
    useSimpleProgress();

  useEffect(() => {
    onCompleted();
  }, [onCompleted]);

  const emailsHandled = Object.keys(handled).length;
  const emailsToHandleLater = Object.keys(toHandleLater).length;

  return (
    <p>
      You handled {emailsHandled} emails and set aside {emailsToHandleLater}{" "}
      emails!{" "}
      {endTime && (
        <>
          It took you {formatTime(calculateTimePassed(endTime, startTime))}{" "}
          minutes.
        </>
      )}
    </p>
  );
}

export function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
