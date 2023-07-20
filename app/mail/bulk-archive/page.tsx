"use client";

import { useCallback } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { Container } from "@/components/Container";
import { PageHeading, SectionDescription } from "@/components/Typography";
import { Button } from "@/components/Button";
import { Select } from "@/components/Select";
import { useNotification } from "@/providers/NotificationProvider";
import { isErrorMessage } from "@/utils/error";
import { postRequest } from "@/utils/api";
import {
  BulkArchiveBody,
  BulkArchiveResponse,
} from "@/app/api/user/bulk-archive/route";

const ageOptions = [
  { label: "1 week", value: 7 },
  { label: "2 weeks", value: 14 },
  { label: "1 month", value: 30 },
  { label: "2 months", value: 60 },
  { label: "3 months", value: 90 },
];

export default function BulkArchive(props: {}) {
  return (
    <Container size="lg">
      <div className="mt-8">
        <PageHeading>Bulk Archive</PageHeading>
      </div>
      <div className="mt-4">
        <SectionDescription>
          Clean up your inbox quickly with our bulk archive tool. This is the
          quickest way to get your inbox into a manageable state. If you have a
          lot of emails in your inbox this can take a while.
        </SectionDescription>
      </div>
      <div className="mt-4">
        <BulkArchiveForm />
      </div>
    </Container>
  );
}

const BulkArchiveForm = () => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BulkArchiveBody>();
  const { showNotification } = useNotification();

  const onSubmit: SubmitHandler<BulkArchiveBody> = useCallback(
    async (data) => {
      const res = await postRequest<BulkArchiveResponse, BulkArchiveBody>(
        "/api/user/bulk-archive",
        data
      );

      if (isErrorMessage(res))
        showNotification({ type: "error", description: `` });
      else showNotification({ type: "success", description: `` });
    },
    [showNotification]
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Select
        name="daysAgo"
        label="Archive emails older than"
        options={ageOptions}
        registerProps={register("daysAgo")}
        error={errors.daysAgo}
      />
      <Button type="submit" full loading={isSubmitting}>
        Bulk Archive Emails
      </Button>
    </form>
  );
};
