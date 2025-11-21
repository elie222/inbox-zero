"use client";

import { useCallback } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { useAction } from "next-safe-action/hooks";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/Input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toastSuccess, toastError } from "@/components/Toast";
import { adminConvertGmailUrlAction } from "@/utils/actions/admin";
import {
  convertGmailUrlBody,
  type ConvertGmailUrlBody,
} from "@/utils/actions/admin.validation";

export function GmailUrlConverter() {
  const {
    execute: convertUrl,
    isExecuting,
    result,
  } = useAction(adminConvertGmailUrlAction, {
    onSuccess: () => {
      toastSuccess({ description: "Message found!" });
    },
    onError: ({ error }) => {
      toastError({
        title: "Error looking up message",
        description: error.serverError || "An error occurred",
      });
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConvertGmailUrlBody>({
    resolver: zodResolver(convertGmailUrlBody),
  });

  const onSubmit: SubmitHandler<ConvertGmailUrlBody> = useCallback(
    (data) => {
      convertUrl(data);
    },
    [convertUrl],
  );

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Email Message Lookup</CardTitle>
        <CardDescription>
          Find thread/message IDs using RFC822 Message-ID from email headers
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <Input
            type="text"
            name="rfc822MessageId"
            label="RFC822 Message-ID"
            placeholder="<abc123@email.example.com>"
            registerProps={register("rfc822MessageId")}
            error={errors.rfc822MessageId}
          />
          <Input
            type="email"
            name="email"
            label="Email Address"
            placeholder="user@example.com"
            registerProps={register("email")}
            error={errors.email}
          />
          <Button type="submit" loading={isExecuting}>
            Lookup
          </Button>
        </form>

        {result.data && (
          <div className="space-y-2">
            <div>
              <span className="text-sm font-medium">Thread ID: </span>
              <code className="text-sm">{result.data.threadId}</code>
            </div>
            <div>
              <span className="text-sm font-medium">Message IDs: </span>
              <code className="text-sm">
                {result.data.messageIds.join(", ")}
              </code>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
