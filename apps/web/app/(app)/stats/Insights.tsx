import { useState } from "react";
import { CheckCircleIcon } from "@heroicons/react/20/solid";
import useSWR from "swr";
import { InsightsResponse } from "@/app/api/user/stats/insights/route";

export function Insights() {
  const { data, isLoading, error } = useSWR<
    InsightsResponse,
    { error: string }
  >(`/api/user/stats/insights`);
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible || isLoading || error || !data?.result.lowReadEmails.length)
    return null;

  return (
    <div className="mt-4 rounded-md bg-green-50 p-4">
      <div className="flex">
        <div className="flex-shrink-0">
          <CheckCircleIcon
            className="h-5 w-5 text-green-400"
            aria-hidden="true"
          />
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-green-800">Insights</h3>
          <div className="mt-2 text-sm text-green-700">
            <p>
              In the last month these are the emails you got and do not read.
              Consider unsubscribing from these emails or auto archiving them.
              Emails:{" "}
              {data.result.lowReadEmails
                .slice(0, 5)
                .map((d) => d.from)
                .join(", ")}
            </p>
          </div>
          <div className="mt-4">
            <div className="-mx-2 -my-1.5 flex">
              <button
                type="button"
                className="rounded-md bg-green-50 px-2 py-1.5 text-sm font-medium text-green-800 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2 focus:ring-offset-green-50"
                onClick={() => setIsVisible(false)}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
