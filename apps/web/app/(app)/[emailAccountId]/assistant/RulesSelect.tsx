import { useRules } from "@/hooks/useRules";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingContent } from "@/components/LoadingContent";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function RulesSelect() {
  const { data, isLoading, error } = useRules();

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="h-10 w-full" />}
    >
      <Tabs defaultValue="all" searchParam="ruleId" className="overflow-x-auto">
        <TabsList>
          <TabsTrigger value="all">All rules</TabsTrigger>
          <TabsTrigger value="skipped">No match</TabsTrigger>
          {data?.map((rule) => (
            <TabsTrigger key={rule.id} value={rule.id}>
              {rule.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </LoadingContent>
  );
}
