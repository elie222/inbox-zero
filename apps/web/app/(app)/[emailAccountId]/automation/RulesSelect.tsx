import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRules } from "@/hooks/useRules";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingContent } from "@/components/LoadingContent";

export function RulesSelect({
  ruleId,
  setRuleId,
}: {
  ruleId: string;
  setRuleId: (ruleId: string) => void;
}) {
  const {
    data: rules,
    isLoading: rulesLoading,
    error: rulesError,
  } = useRules();

  return (
    <LoadingContent
      loading={rulesLoading}
      error={rulesError}
      loadingComponent={<Skeleton className="h-10 w-32" />}
    >
      <div>
        <Select defaultValue={ruleId} onValueChange={setRuleId}>
          <SelectTrigger>
            <SelectValue placeholder="Filter by rule" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All rules</SelectItem>
            <SelectItem value="skipped">
              Processed rules with no match
            </SelectItem>
            {rules?.map((rule) => (
              <SelectItem key={rule.id} value={rule.id}>
                {rule.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </LoadingContent>
  );
}
