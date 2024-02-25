"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SimpleProgress(props: {
  emailsHandled: number;
  emailsToHandleLater: number;
}) {
  const [timePassed, setTimePassed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTimePassed((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

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
          <Badge variant="outline">{props.emailsHandled} handled</Badge>
          <Badge variant="outline">
            {props.emailsToHandleLater} to handle later
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}
