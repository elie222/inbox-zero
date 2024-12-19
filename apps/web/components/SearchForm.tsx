"use client";

import { useCallback } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  type MessageQuery,
  messageQuerySchema,
} from "@/app/api/google/messages/validation";

export function SearchForm({
  onSearch,
}: {
  onSearch: (query: string) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MessageQuery>({
    resolver: zodResolver(messageQuerySchema),
  });

  const onSubmit: SubmitHandler<MessageQuery> = useCallback(
    async (data) => {
      onSearch(data.q || "");
    },
    [onSearch],
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input
        type="text"
        name="search"
        placeholder="Search emails..."
        registerProps={register("q")}
        error={errors.q}
        className="flex-1"
      />
      {/* <Button type="submit" variant="ghost" loading={isSubmitting}>
        <SearchIcon className="mr-2 h-4 w-4" />
        Search
      </Button> */}
    </form>
  );
}
