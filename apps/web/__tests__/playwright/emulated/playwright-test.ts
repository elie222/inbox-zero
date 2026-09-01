import {
  test as base,
  type ConsoleMessage,
  type Request,
  type Response,
} from "@playwright/test";
import { capturePlaywrightCheckpoint } from "./playwright-evidence";
import { sanitizeBrowserDiagnosticText } from "@/utils/playwright/browser-diagnostics";

type BrowserDiagnostic = {
  kind:
    | "console-error"
    | "evidence-error"
    | "http-error"
    | "page-error"
    | "request-failed";
  location?: {
    columnNumber?: number;
    lineNumber?: number;
    url?: string;
  };
  message: string;
  method?: string;
  resourceType?: string;
  url?: string;
};

type BrowserEvidenceFixtures = {
  browserEvidence: undefined;
};

const MAX_DIAGNOSTICS_PER_KIND = 50;

export const test = base.extend<BrowserEvidenceFixtures>({
  browserEvidence: [
    async ({ page }, use, testInfo) => {
      const diagnostics: BrowserDiagnostic[] = [];
      let finalStateCaptureFailed = false;
      const onConsole = (message: ConsoleMessage) => {
        if (message.type() !== "error") return;
        addDiagnostic(diagnostics, {
          kind: "console-error",
          location: sanitizeLocation(message.location()),
          message: sanitizeBrowserDiagnosticText(message.text()),
        });
      };
      const onPageError = (error: Error) => {
        addDiagnostic(diagnostics, {
          kind: "page-error",
          message: sanitizeBrowserDiagnosticText(error.stack ?? error.message),
        });
      };
      const onRequestFailed = (request: Request) => {
        addDiagnostic(diagnostics, {
          kind: "request-failed",
          message: sanitizeBrowserDiagnosticText(
            request.failure()?.errorText ?? "Unknown failure",
          ),
          method: request.method(),
          resourceType: request.resourceType(),
          url: sanitizeUrl(request.url()),
        });
      };
      const onResponse = (response: Response) => {
        if (response.status() < 400) return;
        const request = response.request();
        addDiagnostic(diagnostics, {
          kind: "http-error",
          message: sanitizeBrowserDiagnosticText(
            `${response.status()} ${response.statusText()}`.trim(),
          ),
          method: request.method(),
          resourceType: request.resourceType(),
          url: sanitizeUrl(response.url()),
        });
      };

      page.on("console", onConsole);
      page.on("pageerror", onPageError);
      page.on("requestfailed", onRequestFailed);
      page.on("response", onResponse);

      try {
        await use(undefined);
      } finally {
        page.off("console", onConsole);
        page.off("pageerror", onPageError);
        page.off("requestfailed", onRequestFailed);
        page.off("response", onResponse);

        const pageTitle = page.isClosed()
          ? null
          : await page.title().catch(() => null);
        if (!page.isClosed() && testInfo.errors.length === 0) {
          try {
            await capturePlaywrightCheckpoint(page, testInfo, "final-state");
          } catch (error) {
            finalStateCaptureFailed = true;
            addDiagnostic(diagnostics, {
              kind: "evidence-error",
              message: sanitizeBrowserDiagnosticText(
                error instanceof Error
                  ? (error.stack ?? error.message)
                  : String(error),
              ),
            });
          }
        }

        await testInfo.attach("browser-evidence", {
          body: JSON.stringify(
            {
              diagnostics,
              page: {
                title: pageTitle
                  ? sanitizeBrowserDiagnosticText(pageTitle)
                  : null,
                url: page.isClosed() ? null : sanitizeUrl(page.url()),
              },
            },
            null,
            2,
          ),
          contentType: "application/json",
        });
      }

      const pageErrors = diagnostics.filter(
        (diagnostic) => diagnostic.kind === "page-error",
      );
      if (pageErrors.length > 0 && testInfo.errors.length === 0) {
        throw new Error(
          `Uncaught browser error${pageErrors.length === 1 ? "" : "s"}:\n${pageErrors
            .map((error) => error.message)
            .join("\n\n")}`,
        );
      }
      if (finalStateCaptureFailed && testInfo.errors.length === 0) {
        throw new Error(
          "Final-state evidence capture failed. See browser-evidence for details.",
        );
      }
    },
    { auto: true },
  ],
});

function addDiagnostic(
  diagnostics: BrowserDiagnostic[],
  diagnostic: BrowserDiagnostic,
) {
  const matchingCount = diagnostics.filter(
    (existing) => existing.kind === diagnostic.kind,
  ).length;
  if (matchingCount < MAX_DIAGNOSTICS_PER_KIND) {
    diagnostics.push(diagnostic);
  }
}

function sanitizeLocation(location: {
  columnNumber?: number;
  lineNumber?: number;
  url?: string;
}) {
  return {
    ...(location.url ? { url: sanitizeUrl(location.url) } : {}),
    ...(location.lineNumber === undefined
      ? {}
      : { lineNumber: location.lineNumber }),
    ...(location.columnNumber === undefined
      ? {}
      : { columnNumber: location.columnNumber }),
  };
}

function sanitizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value.split(/[?#]/, 1)[0] ?? "";
  }
}
