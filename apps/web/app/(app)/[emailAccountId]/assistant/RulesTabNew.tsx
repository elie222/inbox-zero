import { Rules } from "@/app/(app)/[emailAccountId]/assistant/Rules";
import { RulesPromptFormat } from "@/app/(app)/[emailAccountId]/assistant/RulesPromptFormat";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddRuleDialog } from "@/app/(app)/[emailAccountId]/assistant/AddRuleDialog";

export function RulesTab() {
  return (
    <Tabs defaultValue="list" searchParam="format">
      <div className="flex items-center mb-2">
        <h3 className="font-cal text-xl leading-7 flex-1">Your inbox rules</h3>

        <TabsList className="mr-2">
          <TabsTrigger value="list">List</TabsTrigger>
          <TabsTrigger value="prompt">Prompt</TabsTrigger>
        </TabsList>

        <AddRuleDialog />
      </div>

      <TabsContent value="list">
        <Rules showAddRuleButton={false} />
      </TabsContent>

      <TabsContent value="prompt">
        <RulesPromptFormat />
      </TabsContent>
    </Tabs>
  );
}
