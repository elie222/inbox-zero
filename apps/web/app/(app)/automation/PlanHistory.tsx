"use client";

import useSWR from "swr";
import { LoadingContent } from "@/components/LoadingContent";
import { PlanHistoryResponse } from "@/app/api/user/planned/history/route";
import { PlanBadge } from "@/components/PlanBadge";
import { AlertBasic } from "@/components/Alert";

export function PlanHistory() {
  const { data, isLoading, error } = useSWR<PlanHistoryResponse>(
    "/api/user/planned/history",
    {
      keepPreviousData: true,
    }
  );

  return (
    <LoadingContent loading={isLoading} error={error}>
      <div className="">
        {data?.history.map((h) => {
          return (
            <div
              key={h.id}
              className="flex items-center justify-between border-b border-gray-200 px-4 py-3"
            >
              <div className="whitespace-nowrap">
                <PlanBadge
                  plan={{
                    rule: {
                      name: h.rule?.name || "",
                      actions: h.actions.map((actionType) => {
                        return { type: actionType };
                      }),
                    },
                    databaseRule: {
                      instructions: h.rule?.instructions || "",
                    },
                  }}
                />
              </div>
              {/* {JSON.stringify(h, null, 2)} */}
              <div>
                {h.actions.map((action, i) => {
                  return (
                    <div key={i} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className="font-semibold">{action}</div>
                          {/* <div className="text-gray-500">{a.args}</div> */}
                        </div>
                        {/* <div className="text-gray-500">{a.createdAt}</div> */}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="">
                {Object.entries(h.data as any).map(
                  ([key, value]: [string, any]) => {
                    return (
                      <div key={key} className="flex items-center space-x-2">
                        <div className="font-semibold">{key}</div>
                        <div className="text-gray-500">{value}</div>
                      </div>
                    );
                  }
                )}
              </div>
              <div className="">{h.automated ? "Automated" : "Manual"}</div>
            </div>
          );
        })}
      </div>
      {!data?.history?.length && (
        <div className="px-2">
          <AlertBasic
            title="No history"
            description="You have no history of AI automations yet."
          />
        </div>
      )}
    </LoadingContent>
  );
}
