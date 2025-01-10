import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationLink,
  PaginationNext,
} from "@/components/ui/pagination";

export function TablePagination({ totalPages }: { totalPages: number }) {
  const searchParams = useSearchParams();
  const page = Number.parseInt(searchParams.get("page") || "1");
  const hrefForPage = useCallback(
    (value: number) => {
      const params = new URLSearchParams(searchParams);
      params.set("page", value.toString());
      const asString = params.toString();
      return asString ? `?${asString}` : "";
    },
    [searchParams],
  );

  if (totalPages <= 1) return null;

  return (
    <div className="m-4">
      <Pagination className="justify-end">
        <PaginationContent>
          {page > 1 && (
            <PaginationItem>
              <PaginationPrevious href={hrefForPage(page - 1)} />
            </PaginationItem>
          )}
          <PaginationItem>
            <PaginationLink href={hrefForPage(page)}>{page}</PaginationLink>
          </PaginationItem>
          {page < totalPages && (
            <PaginationItem>
              <PaginationNext href={hrefForPage(page + 1)} />
            </PaginationItem>
          )}
        </PaginationContent>
      </Pagination>
    </div>
  );
}
