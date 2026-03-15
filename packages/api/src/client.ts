type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: string;
  searchParams?: Record<string, string | undefined>;
};

type ApiErrorPayload = {
  error?: string;
  message?: string;
};

export class ApiClient {
  private readonly config: {
    apiKey: string;
    baseUrl: string;
  };

  constructor(config: { apiKey: string; baseUrl: string }) {
    this.config = config;
  }

  async delete(pathname: string) {
    return this.request(pathname, { method: "DELETE" });
  }

  async get<T>(
    pathname: string,
    searchParams?: RequestOptions["searchParams"],
  ) {
    return this.request<T>(pathname, { method: "GET", searchParams });
  }

  async post<T>(pathname: string, body?: string) {
    return this.request<T>(pathname, { method: "POST", body });
  }

  async put<T>(pathname: string, body?: string) {
    return this.request<T>(pathname, { method: "PUT", body });
  }

  private async request<T>(pathname: string, options: RequestOptions) {
    const url = buildApiUrl(
      this.config.baseUrl,
      pathname,
      options.searchParams,
    );
    const response = await fetch(url, {
      method: options.method,
      headers: {
        Accept: "application/json",
        "API-Key": this.config.apiKey,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body,
    });

    if (!response.ok) {
      throw await createApiError(response);
    }

    if (response.status === 204) return undefined as T;

    return (await response.json()) as T;
  }
}

export function normalizeBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  const pathname = url.pathname.replace(/\/+$/, "");

  if (!pathname || pathname === "") {
    url.pathname = "/api/v1";
    return url.toString().replace(/\/$/, "");
  }

  if (pathname.endsWith("/api/v1")) {
    url.pathname = pathname;
    return url.toString();
  }

  url.pathname = `${pathname}/api/v1`;
  return url.toString().replace(/\/$/, "");
}

export function buildApiUrl(
  baseUrl: string,
  pathname: string,
  searchParams?: RequestOptions["searchParams"],
): string {
  const url = new URL(normalizeBaseUrl(baseUrl));
  url.pathname = `${url.pathname.replace(/\/$/, "")}/${pathname.replace(/^\//, "")}`;

  for (const [key, value] of Object.entries(searchParams || {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

async function createApiError(response: Response) {
  let message = `Request failed with status ${response.status}`;
  const text = await response.text().catch(() => "");

  try {
    const json = JSON.parse(text) as ApiErrorPayload;
    message = json.error || json.message || message;
  } catch {
    if (text) message = text;
  }

  return new Error(message);
}
