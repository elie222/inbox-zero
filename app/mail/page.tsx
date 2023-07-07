"use client";

import useSWR from "swr";
import { List } from "@/components/ListNew";
import { LoadingContent } from "@/components/LoadingContent";
import { ThreadsResponse } from "@/app/api/google/threads/route";

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
        {/* <List
          emails={
            data?.threads?.map((t) => ({
              id: t.id || "",
              subject: t.snippet || "",
              snippet: t.snippet || "",
              from: "Elie",
              date: "Today",
            })) || []
          }
          refetch={mutate}
        /> */}

        <LoadingContent loading={isLoading} error={error}>
          {data && <List emails={data?.threads || []} refetch={mutate} />}
        </LoadingContent>
      </div>
    </>
  );
}
