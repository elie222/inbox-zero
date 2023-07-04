"use client";

import { SessionProvider, useSession, signIn, signOut } from "next-auth/react";
import useSWR from "swr";
import { List } from "@/components/List";
import { LoadingContent } from "@/components/LoadingContent";
import { ThreadsResponse } from "@/app/api/google/threads/route";
import { Container } from "@/components/Container";
import { LogIn } from "@/components/LogIn";

export default function Home() {
  const { data, isLoading, error, mutate } = useSWR<ThreadsResponse>(
    "/api/google/threads"
  );

  return (
    <SessionProvider>
      <h1 className="text-xl">Welcome to Inbox Zero AI</h1>

      <LogIn />

      <div className="bg-gray-900">
        <Container>
          <LoadingContent loading={isLoading} error={error}>
            {data && (
              <List
                items={
                  data.threads?.map((t) => ({
                    id: t.id || "",
                    text: t.id + ": " + t.snippet || "",
                  })) || []
                }
                refetch={mutate}
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
