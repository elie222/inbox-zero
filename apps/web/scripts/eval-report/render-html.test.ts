import { JSDOM, VirtualConsole } from "jsdom";
import { describe, expect, it } from "vitest";
import type { DashboardData, DashboardView, LatestTest } from "./aggregate";
import { renderDashboardHtml } from "./render-html";

const GENERATED_AT = "2026-06-11T12:00:00.000Z";

describe("renderDashboardHtml", () => {
  it("handles dashboard data with no views", () => {
    const dom = render(
      dashboardData({
        defaultViewKey: "all",
        views: [],
      }),
    );

    expect(dom.window.document.querySelector("#leaderboard")?.textContent).toBe(
      "no eval history found",
    );
  });

  it("renders close suite names without double escaping", () => {
    const dom = render(
      dashboardData({
        views: [
          view({
            models: ["Gemini 3 Flash", "GPT-5.4 Mini"],
            leaderboard: [
              leaderboardRow("Gemini 3 Flash", 2, 2),
              leaderboardRow("GPT-5.4 Mini", 1, 2),
            ],
            suites: [
              suite("billing & <routing>", [
                test("baseline passes a", "Gemini 3 Flash", true),
                test("baseline passes b", "Gemini 3 Flash", true),
                test("candidate passes a", "GPT-5.4 Mini", true),
                test("candidate misses b", "GPT-5.4 Mini", false),
              ]),
            ],
          }),
        ],
      }),
    );

    const closeSuitesCell = dom.window.document.querySelector(
      "#routing tbody tr td:last-child",
    );

    expect(closeSuitesCell?.textContent).toBe("billing & <routing>");
  });

  it("counts each parity suite once across multiple candidate models", () => {
    const dom = render(
      dashboardData({
        views: [
          view({
            models: ["Gemini 3 Flash", "GPT-5.4 Mini", "GPT-5.4 Nano"],
            leaderboard: [
              leaderboardRow("Gemini 3 Flash", 1, 1),
              leaderboardRow("GPT-5.4 Mini", 1, 1),
              leaderboardRow("GPT-5.4 Nano", 1, 1),
            ],
            suites: [
              suite("shared parity suite", [
                test("case", "Gemini 3 Flash", true),
                test("case", "GPT-5.4 Mini", true),
                test("case", "GPT-5.4 Nano", true),
              ]),
            ],
          }),
        ],
      }),
    );

    expect(
      dom.window.document.querySelector(".routing-summary")?.textContent,
    ).toContain("1 suite where");
  });

  it("keeps unranked models visible as routing candidates", () => {
    const dom = render(
      dashboardData({
        views: [
          view({
            models: ["Gemini 3 Flash", "New Model"],
            leaderboard: [
              leaderboardRow("Gemini 3 Flash", 1, 1),
              leaderboardRow("New Model", 1, 1),
            ],
            suites: [
              suite("custom model suite", [
                test("case", "Gemini 3 Flash", true),
                test("case", "New Model", true),
              ]),
            ],
          }),
        ],
      }),
    );

    const routingText =
      dom.window.document.querySelector("#routing")?.textContent;

    expect(routingText).toContain("New Model");
    expect(routingText).toContain("unranked");
  });
});

function render(data: DashboardData) {
  const errors: unknown[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => errors.push(error));

  const dom = new JSDOM(renderDashboardHtml(data), {
    runScripts: "dangerously",
    virtualConsole,
  });

  expect(errors).toEqual([]);
  return dom;
}

function dashboardData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    defaultViewKey: "commit-alpha",
    generatedAt: GENERATED_AT,
    historyDir: ".context/eval-results",
    views: [view()],
    warnings: [],
    ...overrides,
  };
}

function view(overrides: Partial<DashboardView> = {}): DashboardView {
  return {
    key: "commit-alpha",
    label: "commit-a",
    gitHead: "commit-alpha",
    lastRunAt: GENERATED_AT,
    runCount: 1,
    models: ["Gemini 3 Flash"],
    suites: [],
    leaderboard: [leaderboardRow("Gemini 3 Flash", 0, 0)],
    cost: {
      byModel: [],
      totalCalls: 0,
      totalEstimatedCost: 0,
      totalReportedCost: null,
      totalTokens: 0,
    },
    ...overrides,
  };
}

function suite(
  name: string,
  latestTests: LatestTest[],
): DashboardView["suites"][number] {
  return {
    name,
    latestTests,
    runs: [],
  };
}

function test(testName: string, model: string, pass: boolean): LatestTest {
  return {
    createdAt: GENERATED_AT,
    gitHead: "commit-alpha",
    model,
    pass,
    testName,
  };
}

function leaderboardRow(
  model: string,
  passed: number,
  total: number,
): DashboardView["leaderboard"][number] {
  return {
    avgDurationMs: null,
    lastRunAt: GENERATED_AT,
    model,
    passed,
    suiteCount: total > 0 ? 1 : 0,
    total,
  };
}
