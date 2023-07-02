'use client';

import { SessionProvider } from "next-auth/react"
import { useSession, signIn, signOut } from "next-auth/react"

export default function Home() {
  return (
    <SessionProvider>
      <h1 className="text-xl">
        Welcome to Inbox Zero AI
      </h1>

      <Auth />
    </SessionProvider>
  )
}

function Auth() {
  const { data: session } = useSession()
  if (session) {
    return (
      <>
        Signed in as {session.user?.email} <br />
        <button onClick={() => signOut()}>Sign out</button>
      </>
    )
  }
  return (
    <>
      Not signed in <br />
      <button onClick={() => signIn()}>Sign in</button>
    </>
  )
}