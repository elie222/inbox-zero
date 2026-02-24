import type { gmail_v1 } from "@googleapis/gmail";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLabel } from "./label";

describe("createLabel conflict handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing nested label when conflict differs by slash spacing", async () => {
    const list = vi.fn().mockResolvedValue(
      labelsResponse([
        { id: "parent", name: "Reference", type: "user" },
        {
          id: "existing",
          name: "Reference / Political activism",
          type: "user",
        },
      ]),
    );
    const create = vi
      .fn()
      .mockRejectedValue(new Error("Label name exists or conflicts"));
    const gmail = gmailClient({ create, list });

    const label = await createLabel({
      gmail,
      name: "Reference/Political activism",
    });

    expect(label.id).toBe("existing");
    expect(create).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("returns existing nested label when slash uses unicode variant", async () => {
    const list = vi.fn().mockResolvedValue(
      labelsResponse([
        { id: "parent", name: "Reference", type: "user" },
        { id: "existing", name: "Reference∕Political activism", type: "user" },
      ]),
    );
    const create = vi
      .fn()
      .mockRejectedValue(new Error("Label name exists or conflicts"));
    const gmail = gmailClient({ create, list });

    const label = await createLabel({
      gmail,
      name: "Reference/Political activism",
    });

    expect(label.id).toBe("existing");
    expect(create).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("throws when conflict label still cannot be found", async () => {
    const list = vi.fn().mockResolvedValue(
      labelsResponse([
        { id: "parent", name: "Reference", type: "user" },
        { id: "other", name: "Reference/Other", type: "user" },
      ]),
    );
    const create = vi
      .fn()
      .mockRejectedValue(new Error("Label name exists or conflicts"));
    const gmail = gmailClient({ create, list });

    await expect(
      createLabel({
        gmail,
        name: "Reference/Political activism",
      }),
    ).rejects.toThrow(
      "Label conflict but not found: Reference/Political activism",
    );
  });
});

function gmailClient({
  create,
  list,
}: {
  create: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
}) {
  return {
    users: {
      labels: {
        create,
        list,
      },
    },
  } as unknown as gmail_v1.Gmail;
}

function labelsResponse(labels: gmail_v1.Schema$Label[]) {
  return {
    data: {
      labels,
    },
  };
}
