import useSWR from "swr";
import type { UserCategoriesResponse } from "@/app/api/user/categories/route";

export function useCategories() {
  const { data, isLoading, error, mutate } = useSWR<UserCategoriesResponse>(
    "/api/user/categories",
  );

  return { categories: data?.result || [], isLoading, error, mutate };
}
