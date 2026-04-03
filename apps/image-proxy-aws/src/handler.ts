import { handleImageProxyRequest } from "@inboxzero/image-proxy/proxy-service";

declare const process: {
  env: Record<string, string | undefined>;
};

type LambdaEvent = {
  body?: string | null;
  headers?: Record<string, string | undefined>;
  httpMethod?: string;
  isBase64Encoded?: boolean;
  rawPath?: string;
  rawQueryString?: string;
  requestContext?: {
    domainName?: string;
    httpMethod?: string;
    http?: {
      method?: string;
    };
  };
};

type LambdaResponse = {
  body: string;
  headers: Record<string, string>;
  isBase64Encoded?: boolean;
  statusCode: number;
};

export async function handler(event: LambdaEvent): Promise<LambdaResponse> {
  const request = buildRequest(event);
  const response = await handleImageProxyRequest(request, {
    signingSecret: process.env.IMAGE_PROXY_SIGNING_SECRET,
  });

  return toLambdaResponse(response, request.method);
}

function buildRequest(event: LambdaEvent) {
  const headers = new Headers();

  for (const [key, value] of Object.entries(event.headers || {})) {
    if (typeof value === "string") headers.set(key, value);
  }

  const protocol =
    headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const host =
    headers.get("x-forwarded-host") ||
    headers.get("host") ||
    event.requestContext?.domainName ||
    "localhost";
  const path = event.rawPath || "/";
  const query = event.rawQueryString ? `?${event.rawQueryString}` : "";
  const method =
    event.requestContext?.http?.method ||
    event.httpMethod ||
    event.requestContext?.httpMethod ||
    "GET";
  const body =
    method.toUpperCase() === "GET" || method.toUpperCase() === "HEAD"
      ? undefined
      : getRequestBody(event);

  return new Request(`${protocol}://${host}${path}${query}`, {
    method,
    headers,
    body,
  });
}

async function toLambdaResponse(
  response: Response,
  method: string,
): Promise<LambdaResponse> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  if (method === "HEAD") {
    return {
      statusCode: response.status,
      headers,
      body: "",
    };
  }

  const contentType = response.headers.get("content-type") || "";
  const body = await response.arrayBuffer();

  if (contentType.startsWith("text/") || contentType.includes("json")) {
    return {
      statusCode: response.status,
      headers,
      body: new TextDecoder().decode(body),
    };
  }

  return {
    statusCode: response.status,
    headers,
    body: toBase64(body),
    isBase64Encoded: true,
  };
}

function getRequestBody(event: LambdaEvent) {
  if (!event.body) return undefined;

  if (event.isBase64Encoded) {
    return Uint8Array.from(atob(event.body), (char) => char.charCodeAt(0));
  }

  return event.body;
}

function toBase64(value: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(value);
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}
