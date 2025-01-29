"use client";

import { useState } from "react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { BrainIcon, ChevronDownIcon } from "lucide-react";
import { ViewGroup } from "@/app/(app)/automation/group/ViewGroup";

export function LearnedPatterns({ groupId }: { groupId: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="overflow-hidden rounded-lg border"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between bg-gray-50 p-4 hover:bg-gray-100">
        <div className="flex items-center gap-2">
          <BrainIcon size={16} className="text-gray-600" />
          <span className="font-medium">Learned Patterns</span>
        </div>

        <div className="flex items-center gap-4">
          {/* <div className="flex items-center space-x-1.5 border-r pr-4">
            <TooltipExplanation text="Automatically detect and add new matching patterns from incoming emails." />
            <Toggle
              name="auto-learn"
              label="Auto-learn"
              enabled={autoLearn}
              onChange={(enabled) => setAutoLearn(enabled)}
            />
          </div> */}

          <ChevronDownIcon
            size={16}
            className={`transform transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <ViewGroup groupId={groupId} />
      </CollapsibleContent>
    </Collapsible>
  );
}

// export function LearnedPatterns({ groupId }: { groupId: string }) {
//   const [isOpen, setIsOpen] = useState(false);
//   const [hasOpened, setHasOpened] = useState(false);
//   const [autoLearn, setAutoLearn] = useState(false);

//   const { data, isLoading, error, mutate } = useSWR<GroupItemsResponse>(
//     hasOpened ? `/api/user/group/${groupId}/items` : null,
//   );

//   const handleOpen = useCallback((open: boolean) => {
//     setIsOpen(open);
//     if (open) setHasOpened(true);
//   }, []);

//   const handleRemovePattern = useCallback(async (patternId: string) => {
//     const result = await removePatternAction({ patternId });
//     if (isActionError(result)) {
//       toastError({
//         title: "Error removing pattern",
//         description: result.error,
//       });
//     }
//   }, []);

//   const handleAddPattern = useCallback(async (pattern: string) => {
//     const result = await addPatternAction({ pattern });
//     if (isActionError(result)) {
//       toastError({
//         title: "Error adding pattern",
//         description: result.error,
//       });
//     }
//   }, []);

//   return (
//     <Collapsible
//       open={isOpen}
//       onOpenChange={handleOpen}
//       className="overflow-hidden rounded-lg border"
//     >
//       <CollapsibleTrigger className="flex w-full items-center justify-between bg-gray-50 p-4 hover:bg-gray-100">
//         <div className="flex items-center gap-2">
//           <BrainIcon size={16} className="text-gray-600" />
//           <span className="font-medium">Learned Patterns</span>
//           {!!data?.group?.items.length && (
//             <span className="text-sm text-gray-500">
//               ({data?.group?.items.length}{" "}
//               {pluralize(data?.group?.items.length, "pattern")})
//             </span>
//           )}
//         </div>

//         <div className="flex items-center gap-4">
//           <div className="flex items-center space-x-1.5 border-r pr-4">
//             <TooltipExplanation text="Automatically detect and add new matching patterns from incoming emails." />
//             <Toggle
//               name="auto-learn"
//               label="Auto-learn"
//               enabled={autoLearn}
//               onChange={(enabled) => setAutoLearn(enabled)}
//             />
//           </div>

//           <ChevronDownIcon
//             size={16}
//             className={`transform transition-transform ${
//               isOpen ? "rotate-180" : ""
//             }`}
//           />
//         </div>
//       </CollapsibleTrigger>

//       <CollapsibleContent>
//         <div className="space-y-3 p-4">
//           <div className="mb-2 text-sm text-slate-600">
//             The AI has learned these patterns for matching emails:
//           </div>

//           <LoadingContent loading={!data && isLoading} error={error}>
//             <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border p-2">
//               {data?.group?.items.map((item) => {
//                 const isApproved = item.status === "APPROVED";

//                 return (
//                   // <GroupItemDisplay key={item.id} item={item} />
//                   <div
//                     key={item.id}
//                     className="flex items-center justify-between rounded p-2 hover:bg-gray-50"
//                   >
//                     <div className="flex items-center gap-2">
//                       <span
//                         className={
//                           isApproved ? "text-green-600" : "text-red-600"
//                         }
//                       >
//                         {isApproved ? "✓" : "✗"}
//                       </span>
//                       <span>
//                         {item.type.toLowerCase()}: {item.value}
//                       </span>
//                     </div>
//                     <Button
//                       variant="outline"
//                       size="icon"
//                       onClick={() => handleRemovePattern(item.id)}
//                     >
//                       <XIcon size={14} />
//                     </Button>
//                   </div>
//                 );
//               })}

//               {data?.group?.items.length === 0 && (
//                 <div className="p-2 text-sm text-gray-500">
//                   No patterns learned yet
//                 </div>
//               )}
//             </div>
//           </LoadingContent>

//           <Button
//             variant="outline"
//             size="sm"
//             onClick={() => {
//               const pattern = prompt("Enter pattern to add:");
//               if (pattern) handleAddPattern(pattern);
//             }}
//           >
//             Add pattern manually
//           </Button>
//         </div>
//       </CollapsibleContent>
//     </Collapsible>
//   );
// }
