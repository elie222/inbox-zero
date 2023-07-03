// import { z } from "zod";
import { google, Auth } from "googleapis";
import { NextResponse } from "next/server";
import { client } from "../client";

// const threadsQuery = z.object({ slug: z.string() });
// export type ThreadsQuery = z.infer<typeof threadsQuery>;
export type ThreadsResponse = Awaited<ReturnType<typeof getThreads>>;

async function getThreads(auth: Auth.OAuth2Client) {
  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.threads.list({ userId: "me", labelIds: ["INBOX"] });
  const threads = res.data.threads;
  if (!threads || threads.length === 0) {
    console.log("No threads found.");
    return;
  }
  // console.log("Threads:");
  // threads.forEach((thread) => {
  //   console.log(`- ${thread.id} - ${thread.snippet}`);
  // });

  return { threads };
}

export async function GET() {
  const threads = await getThreads(client);

  return NextResponse.json(threads);
}







// import type { NextApiRequest, NextApiResponse } from 'next';
// import { z } from 'zod';
// import prisma from '@utils/prisma';
// import { ErrorMessage, notLoggedInError } from '@utils/error';
// import { withDefaultMiddleware } from '@utils/middleware';

// const projectQuery = z.object({ slug: z.string() });
// export type ProjectQuery = z.infer<typeof projectQuery>;
// export type ProjectResponse = Awaited<ReturnType<typeof getProjects>>;

// async function getProjects(options: ProjectQuery) {
//   const { slug } = options;
//   const projects = await prisma.project.findUnique({ where: { slug } });
//   return projects;
// }

// async function handler(
//   req: NextApiRequest,
//   res: NextApiResponse<ProjectResponse | null | ErrorMessage>
// ) {
//   const address = req.session?.siwe?.address;
//   if (!address) return notLoggedInError(res);

//   const query = projectQuery.parse(req.query);

//   const project = await getProjects(query);

//   return res.status(200).json(project);
// }

// export default withDefaultMiddleware('GET', handler);
