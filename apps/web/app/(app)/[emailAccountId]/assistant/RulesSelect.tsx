import { useRules } from "@/hooks/useRules";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSearchParams, useRouter } from "next/navigation";
import { ChevronDown, Tag } from "lucide-react";

export function RulesSelect() {
  const { data, isLoading, error } = useRules();
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentValue = searchParams.get("ruleId") || "all";

  const handleValueChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("ruleId", value);
    router.push(`?${params.toString()}`);
  };

  const getCurrentLabel = () => {
    if (currentValue === "all") return "All rules";
    if (currentValue === "skipped") return "No match";
    return data?.find((rule) => rule.id === currentValue)?.name || "All rules";
  };

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="h-10 w-[200px]" />}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-10 whitespace-nowrap"
          >
            <Tag className="mr-2 h-4 w-4" />
            {getCurrentLabel()}
            <ChevronDown className="ml-2 h-4 w-4 text-gray-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handleValueChange("all")}>
            All rules
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleValueChange("skipped")}>
            No match
          </DropdownMenuItem>
          {data?.map((rule) => (
            <DropdownMenuItem
              key={rule.id}
              onClick={() => handleValueChange(rule.id)}
            >
              {rule.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </LoadingContent>
  );
}
