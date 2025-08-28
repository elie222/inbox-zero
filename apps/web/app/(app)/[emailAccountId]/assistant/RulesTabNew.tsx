import { Rules } from "@/app/(app)/[emailAccountId]/assistant/Rules";
import { RulesPromptFormat } from "@/app/(app)/[emailAccountId]/assistant/RulesPromptFormat";
import { RulesPrompt } from "@/app/(app)/[emailAccountId]/assistant/RulesPromptNew";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function RulesTab() {
  return (
    <div>
      <RulesPrompt />

      <Tabs defaultValue="list" searchParam="format">
        <div className="flex justify-between items-center mt-8 mb-2">
          <h3 className="font-cal text-xl leading-7">Rules</h3>

          <TabsList>
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="prompt">Prompt</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="list">
          <Rules showAddRuleButton={false} />
        </TabsContent>

        <TabsContent value="prompt">
          <RulesPromptFormat />
        </TabsContent>
      </Tabs>
    </div>
  );
}
