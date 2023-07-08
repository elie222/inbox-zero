"use client";

import useSWR from "swr";
import { List } from "@/components/ListNew";
import { LoadingContent } from "@/components/LoadingContent";
import { ThreadsResponse } from "@/app/api/google/threads/route";
import { getFilterFunction } from "@/utils/filters";
import { ActionButtons } from "@/components/ActionButtons";

export default function Home() {
  const { data, isLoading, error, mutate } = useSWR<ThreadsResponse>(
    "/api/google/threads"
  );

  return (
    <>
      {/* <EmailList /> */}

      {/* <div className="flex justify-between">
        <div className=""></div>
        <Button size='xs' onClick={() => {}}>Plan AI</Button>
      </div> */}

      <div className="">
        <LoadingContent loading={isLoading} error={error}>
          {data && (
            <List
              emails={data?.threads || []}
              // filter={getFilterFunction("label")}
              // filterArgs={{ label: "newsletter" }}
              refetch={mutate}
            />
          )}
        </LoadingContent>
      </div>
    </>
  );
}
