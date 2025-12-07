"use client";

import { z } from "zod";
import { SearchIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import throttle from "lodash/throttle";
import { Input } from "@/components/Input";
import { Button } from "@/components/ui/button";

const searchSchema = z.object({ search: z.string() });

export function SearchBar({
  onSearch,
}: {
  onSearch: (search: string) => void;
}) {
  const [showSearch, setShowSearch] = useState(false);

  const {
    register,
    formState: { errors },
    watch,
  } = useForm<z.infer<typeof searchSchema>>({
    resolver: zodResolver(searchSchema),
    defaultValues: { search: "" },
  });

  const throttledSearch = useCallback(
    throttle((value: string) => {
      onSearch(value.trim());
    }, 300),
    [],
  );

  watch((data) => {
    if (data.search !== undefined) {
      throttledSearch(data.search);
    }
  });
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setShowSearch(!showSearch)}
      >
        <SearchIcon className="size-5" />
      </Button>
      {showSearch && (
        <form onSubmit={(e) => e.preventDefault()}>
          <Input
            type="text"
            name="search"
            placeholder="Search"
            registerProps={register("search", { required: true })}
            error={errors.search}
          />
        </form>
      )}
    </>
  );
}
