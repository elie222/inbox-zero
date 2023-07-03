"use client";

import { SessionProvider, useSession, signIn, signOut } from "next-auth/react";
import useSWR from "swr";
import { List } from "@/components/List";
import { LoadingContent } from "@/components/LoadingContent";
import { ThreadsResponse } from "@/app/api/google/threads/route";
import { Container } from "@/components/Container";
import { ArchiveBody } from "@/app/api/google/threads/archive/route";
import { useNotification } from "@/components/NotificationProvider";
import { postRequest } from "@/utils/api";

export default function Home() {
  const { data, isLoading, error } = useSWR<ThreadsResponse>(
    "/api/google/threads"
  );

  const { showNotification } = useNotification();

  return (
    <SessionProvider>
      <h1 className="text-xl">Welcome to Inbox Zero AI</h1>

      <div className="bg-gray-900">
        <Container>
          <LoadingContent loading={isLoading} error={error}>
            {data && (
              <List
                items={data.threads.map((t) => ({
                  id: t.id || "",
                  text: t.snippet || "",
                }))}
                onArchive={async (id) => {
                  const body: ArchiveBody = { id };

                  try {
                    await postRequest("/api/google/threads/archive", body);
                    const response = await fetch("/api/google/threads/archive", {
                      method: "POST",
                      body: JSON.stringify(body),
                    });
                    console.log("🚀 ~ file: page.tsx:42 ~ onArchive={ ~ response:", response)
                  } catch (error) {
                    return showNotification({
                      type: "error",
                      title: "Error archiving thread",
                      description: "There was an error archiving the thread.",
                    });
                  }

                  showNotification({
                    type: "success",
                    title: "Success",
                    description: "The thread was archived.",
                  });
                }}
              />
            )}
          </LoadingContent>
        </Container>
      </div>

      <Auth />
    </SessionProvider>
  );
}

function Auth() {
  const { data: session } = useSession();
  if (session) {
    return (
      <>
        Signed in as {session.user?.email} <br />
        <button onClick={() => signOut()}>Sign out</button>
      </>
    );
  }
  return (
    <>
      Not signed in <br />
      <button onClick={() => signIn()}>Sign in</button>
    </>
  );
}
