import { NextResponse } from "next/server";
import { Frequency } from "@/generated/prisma/enums";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { escapeHtml, trimToNonEmptyString } from "@/utils/string";

export const GET = withError("unsubscribe", async (request) => {
  const token = getTokenFromSearchParams(request);
  if (!token) {
    return createUnsubscribeResponse(request, {
      status: 400,
      title: "Invalid unsubscribe link",
      message: "This unsubscribe link is missing the required token.",
      json: { error: "Token is required" },
    });
  }

  const emailToken = await getValidEmailToken(token);
  if (!emailToken) {
    return createUnsubscribeResponse(request, {
      status: 400,
      title: "Link unavailable",
      message:
        "This unsubscribe link is invalid or has already been used. Request a new email to try again.",
      json: {
        error:
          "Invalid unsubscribe token. You might have already unsubscribed.",
      },
    });
  }

  return new Response(renderConfirmationPage(token), {
    headers: getHtmlHeaders(),
    status: 200,
  });
});

export const POST = withError("unsubscribe", async (request) => {
  const token = await getTokenFromRequest(request);
  if (!token) {
    return createUnsubscribeResponse(request, {
      status: 400,
      title: "Invalid unsubscribe request",
      message: "This unsubscribe request is missing the required token.",
      json: { error: "Token is required" },
    });
  }

  const emailToken = await getValidEmailToken(token);
  if (!emailToken) {
    return createUnsubscribeResponse(request, {
      status: 400,
      title: "Link unavailable",
      message:
        "This unsubscribe link is invalid or has already been used. Request a new email to try again.",
      json: {
        error:
          "Invalid unsubscribe token. You might have already unsubscribed.",
      },
    });
  }

  const [userUpdate, tokenDelete] = await Promise.allSettled([
    prisma.emailAccount.update({
      where: { id: emailToken.emailAccountId },
      data: {
        summaryEmailFrequency: Frequency.NEVER,
        statsEmailFrequency: Frequency.NEVER,
      },
    }),
    prisma.emailToken.delete({ where: { id: emailToken.id } }),
  ]);

  if (userUpdate.status === "rejected") {
    request.logger.error("Error updating user preferences", {
      email: emailToken.emailAccount.email,
      error: userUpdate.reason,
    });

    return createUnsubscribeResponse(request, {
      status: 500,
      title: "Unsubscribe failed",
      message:
        "We couldn't update your email preferences right now. Visit Settings to unsubscribe manually.",
      json: {
        success: false,
        message:
          "Error unsubscribing. Visit Settings page to unsubscribe from emails.",
      },
    });
  }

  if (tokenDelete.status === "rejected") {
    request.logger.error("Error deleting token", {
      email: emailToken.emailAccountId,
      tokenId: emailToken.id,
      error: tokenDelete.reason,
    });
  }

  request.logger.info("User unsubscribed from emails", {
    email: emailToken.emailAccountId,
  });

  return createUnsubscribeResponse(request, {
    status: 200,
    title: "You're unsubscribed",
    message: "Email updates like this have been turned off for your account.",
    json: { success: true },
  });
});

async function getTokenFromRequest(request: Request) {
  const bodyToken = await getTokenFromFormBody(request);
  return bodyToken || getTokenFromSearchParams(request);
}

function getTokenFromSearchParams(request: Request) {
  const url = new URL(request.url);
  return trimToNonEmptyString(url.searchParams.get("token"));
}

async function getTokenFromFormBody(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/x-www-form-urlencoded")) return;

  const formData = await request.formData();
  return trimToNonEmptyString(formData.get("token"));
}

async function getValidEmailToken(token: string) {
  const emailToken = await prisma.emailToken.findUnique({
    where: { token },
    include: { emailAccount: true },
  });

  if (!emailToken) return null;
  if (emailToken.expiresAt < new Date()) return null;

  return emailToken;
}

function createUnsubscribeResponse(
  request: Request,
  options: {
    status: number;
    title: string;
    message: string;
    json: Record<string, string | boolean>;
  },
) {
  if (wantsHtml(request)) {
    return new Response(renderStatusPage(options.title, options.message), {
      headers: getHtmlHeaders(),
      status: options.status,
    });
  }

  return NextResponse.json(options.json, { status: options.status });
}

function wantsHtml(request: Request) {
  const acceptHeader = request.headers.get("accept") || "";
  return request.method === "GET" || acceptHeader.includes("text/html");
}

function getHtmlHeaders() {
  return {
    "Cache-Control": "no-store",
    "Content-Type": "text/html; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  };
}

function renderConfirmationPage(token: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="referrer" content="no-referrer" />
    <title>Confirm unsubscribe</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: linear-gradient(135deg, #fff7ed 0%, #ffffff 100%);
        color: #1f2937;
        font-family: ui-sans-serif, system-ui, sans-serif;
      }
      main {
        width: min(100%, 30rem);
        margin: 2rem;
        padding: 2rem;
        border-radius: 1rem;
        border: 1px solid #fed7aa;
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 24px 60px rgba(251, 146, 60, 0.12);
      }
      h1 {
        margin: 0 0 0.75rem;
        font-size: 1.75rem;
      }
      p {
        margin: 0 0 1.5rem;
        line-height: 1.6;
      }
      button {
        border: 0;
        border-radius: 999px;
        background: #ea580c;
        color: white;
        cursor: pointer;
        font: inherit;
        font-weight: 600;
        padding: 0.875rem 1.25rem;
      }
      button:hover {
        background: #c2410c;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Confirm unsubscribe</h1>
      <p>Click the button below to stop email updates like this from Inbox Zero.</p>
      <form method="POST" action="/api/unsubscribe">
        <input type="hidden" name="token" value="${escapeHtml(token)}" />
        <button type="submit">Unsubscribe</button>
      </form>
    </main>
  </body>
</html>`;
}

function renderStatusPage(title: string, message: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="referrer" content="no-referrer" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #fffaf5;
        color: #1f2937;
        font-family: ui-sans-serif, system-ui, sans-serif;
      }
      main {
        width: min(100%, 30rem);
        margin: 2rem;
        padding: 2rem;
        border-radius: 1rem;
        border: 1px solid #fed7aa;
        background: white;
        box-shadow: 0 20px 50px rgba(251, 146, 60, 0.1);
      }
      h1 {
        margin: 0 0 0.75rem;
        font-size: 1.75rem;
      }
      p {
        margin: 0;
        line-height: 1.6;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
    </main>
  </body>
</html>`;
}
