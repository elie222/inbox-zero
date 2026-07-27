import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const {
  createEmailProviderMock,
  getEmailAccountWithAiAndTokensMock,
  aiEnrichContactMock,
  aiResearchCompanyMock,
  aiExtractContactsMock,
} = vi.hoisted(() => ({
  createEmailProviderMock: vi.fn(),
  getEmailAccountWithAiAndTokensMock: vi.fn(),
  aiEnrichContactMock: vi.fn(),
  aiResearchCompanyMock: vi.fn(),
  aiExtractContactsMock: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: createEmailProviderMock,
}));
vi.mock("@/utils/user/get", () => ({
  getEmailAccountWithAiAndTokens: getEmailAccountWithAiAndTokensMock,
}));
vi.mock("@/utils/ai/contacts/enrich-contact", () => ({
  aiEnrichContact: aiEnrichContactMock,
}));
vi.mock("@/utils/ai/companies/research-company", () => ({
  aiResearchCompany: aiResearchCompanyMock,
}));
vi.mock("@/utils/ai/contacts/extract-contacts-from-email", () => ({
  aiExtractContactsFromEmail: aiExtractContactsMock,
}));

import {
  enrichContactAction,
  extractContactsFromEmailAction,
  researchCompanyAction,
  updateContactAction,
} from "@/utils/actions/contact";

beforeEach(() => {
  vi.clearAllMocks();

  prisma.emailAccount.findUnique.mockResolvedValue({
    email: "user@example.com",
    account: { userId: "user-1", provider: "google" },
  } as any);
  getEmailAccountWithAiAndTokensMock.mockResolvedValue({
    id: "account-1",
    email: "user@example.com",
    user: {},
  });
  prisma.contact.findUnique.mockResolvedValue(null);
  prisma.contact.upsert.mockResolvedValue({} as any);
});

describe("enrichContactAction", () => {
  it("returns suggestions and persists only the AI summary", async () => {
    createEmailProviderMock.mockResolvedValue({
      getMessagesFromSender: vi.fn().mockResolvedValue({
        messages: [
          {
            id: "m1",
            headers: { from: "jane@example.com", subject: "Re: Order" },
          },
        ],
      }),
    });
    aiEnrichContactMock.mockResolvedValue({
      name: "Jane Doe",
      title: "VP of Sales",
      company: "Example Corp",
      phones: [{ label: "Mobile", value: "+1 555 0100" }],
      summary: "Jane is the user's account manager at Example Corp.",
    });

    const result = await enrichContactAction("account-1", {
      email: "Jane@Example.com",
    });

    expect(result?.data?.suggestions).toEqual({
      name: "Jane Doe",
      title: "VP of Sales",
      company: "Example Corp",
      phones: [{ label: "Mobile", value: "+1 555 0100" }],
    });
    expect(prisma.contact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          emailAccountId_email: {
            emailAccountId: "account-1",
            email: "jane@example.com",
          },
        },
        update: {
          aiSummary: "Jane is the user's account manager at Example Corp.",
        },
      }),
    );
  });

  it("explains when there are no emails from the contact", async () => {
    createEmailProviderMock.mockResolvedValue({
      getMessagesFromSender: vi.fn().mockResolvedValue({ messages: [] }),
    });

    const result = await enrichContactAction("account-1", {
      email: "jane@example.com",
    });

    expect(result?.serverError).toContain("No emails from this contact");
    expect(aiEnrichContactMock).not.toHaveBeenCalled();
  });

  it("surfaces the underlying cause when the AI call fails", async () => {
    createEmailProviderMock.mockResolvedValue({
      getMessagesFromSender: vi.fn().mockResolvedValue({
        messages: [
          { id: "m1", headers: { from: "jane@example.com", subject: "Hi" } },
        ],
      }),
    });
    aiEnrichContactMock.mockRejectedValue(
      new Error("Your credit balance is too low"),
    );

    const result = await enrichContactAction("account-1", {
      email: "jane@example.com",
    });

    expect(result?.serverError).toContain("Your credit balance is too low");
  });
});

describe("updateContactAction company lock", () => {
  it("attaches to the domain-owning company even when another name is submitted", async () => {
    prisma.company.findFirst.mockResolvedValue({
      id: "co-1",
      name: "Vercel",
    } as any);

    const result = await updateContactAction("account-1", {
      email: "rina@vercel.com",
      companyName: "Acme",
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.contact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ companyId: "co-1" }),
      }),
    );
  });

  it("blank company at an owned domain saves fine (domain grouping takes over)", async () => {
    prisma.company.findFirst.mockResolvedValue({
      id: "co-1",
      name: "Vercel",
    } as any);

    const result = await updateContactAction("account-1", {
      email: "rina@vercel.com",
      companyName: "",
      isPersonal: true,
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.contact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ companyId: null, isPersonal: true }),
      }),
    );
  });

  it("accepts a case variant of the owning company's name", async () => {
    prisma.company.findFirst.mockResolvedValue({
      id: "co-1",
      name: "Vercel",
    } as any);

    await updateContactAction("account-1", {
      email: "rina@vercel.com",
      companyName: "vercel",
    });

    expect(prisma.contact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ companyId: "co-1" }),
      }),
    );
  });

  it("keeps the owning company when the same name is re-submitted", async () => {
    prisma.company.findFirst.mockResolvedValue({
      id: "co-1",
      name: "Vercel",
    } as any);

    await updateContactAction("account-1", {
      email: "rina@vercel.com",
      companyName: "Vercel",
    });

    expect(prisma.contact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ companyId: "co-1" }),
      }),
    );
  });

  it("still assigns unclaimed-domain contacts, teaching the company the domain", async () => {
    prisma.company.findFirst
      // No company owns acme.com yet…
      .mockResolvedValueOnce(null)
      // …and "Acme" exists but hasn't adopted the domain
      .mockResolvedValueOnce({ id: "co-2", name: "Acme", domains: [] } as any);
    prisma.company.update.mockResolvedValue({} as any);

    await updateContactAction("account-1", {
      email: "bob@acme.com",
      companyName: "Acme",
    });

    expect(prisma.contact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ companyId: "co-2" }),
      }),
    );
    // The company adopted the contact's domain, so acme.com colleagues
    // group with it from now on
    expect(prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { domains: ["acme.com"] },
      }),
    );
  });

  it("assigns public-email-domain contacts freely, without domain adoption", async () => {
    prisma.company.findFirst.mockResolvedValue(null);
    prisma.company.create.mockResolvedValue({
      id: "co-3",
      name: "Acme",
      domains: [],
    } as any);

    const result = await updateContactAction("account-1", {
      email: "mom@gmail.com",
      companyName: "Acme",
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.contact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ companyId: "co-3" }),
      }),
    );
    // gmail.com must never become a company domain
    expect(prisma.company.update).not.toHaveBeenCalled();
  });
});

describe("extractContactsFromEmailAction", () => {
  it("shows the domain-owning company instead of the name written in the email", async () => {
    aiExtractContactsMock.mockResolvedValue({
      people: [
        {
          name: "Michael McGuire",
          email: "MichaelM@dealeruplift.com",
          title: null,
          phones: [{ label: "Mobile", value: "443-391-9713" }],
          companyName: "Dealer Uplift",
        },
      ],
    });
    prisma.contact.findMany.mockResolvedValue([]);
    prisma.company.findMany.mockResolvedValue([
      { name: "Armatus (Dealer Uplift)", domains: ["dealeruplift.com"] },
    ] as any);

    const result = await extractContactsFromEmailAction("account-1", {
      from: "Dylan Elkins <dylane@dealeruplift.com>",
      subject: "Contact Info",
      content: "Michael McGuire 443-391-9713 michaelm@dealeruplift.com",
    });

    expect(result?.data?.people).toEqual([
      expect.objectContaining({
        email: "michaelm@dealeruplift.com",
        companyName: "Armatus (Dealer Uplift)",
        alreadySaved: false,
      }),
    ]);
  });

  it("keeps the email's company name when no company owns the domain", async () => {
    aiExtractContactsMock.mockResolvedValue({
      people: [
        {
          name: "Jane Doe",
          email: "jane@newvendor.com",
          title: null,
          phones: [],
          companyName: "New Vendor Inc",
        },
      ],
    });
    prisma.contact.findMany.mockResolvedValue([]);
    prisma.company.findMany.mockResolvedValue([]);

    const result = await extractContactsFromEmailAction("account-1", {
      from: "jane@newvendor.com",
      subject: "Intro",
      content: "Jane Doe jane@newvendor.com",
    });

    expect(result?.data?.people?.[0]).toMatchObject({
      companyName: "New Vendor Inc",
    });
  });
});

describe("researchCompanyAction", () => {
  beforeEach(() => {
    prisma.company.findFirst.mockResolvedValue(null);
    prisma.company.update.mockResolvedValue({} as any);
    prisma.companyLabel.findMany.mockResolvedValue([]);
    createEmailProviderMock.mockResolvedValue({
      getMessagesFromSender: vi.fn().mockResolvedValue({ messages: [] }),
    });
  });

  it("auto-renames when the AI name only fixes formatting", async () => {
    prisma.company.findFirst
      // The company being researched…
      .mockResolvedValueOnce({
        id: "co-1",
        name: "700credit",
        domains: ["700credit.com"],
      } as any)
      // …and no name clash with the AI's version
      .mockResolvedValueOnce(null);
    aiResearchCompanyMock.mockResolvedValue({
      name: "700Credit",
      summary: "700Credit provides credit and compliance tools to dealers.",
    });

    const result = await researchCompanyAction("account-1", { id: "co-1" });

    expect(result?.data).toEqual({
      summary: "700Credit provides credit and compliance tools to dealers.",
      suggestedName: "700Credit",
      renamed: true,
      suggestedLabel: null,
    });
    expect(prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: "700Credit",
          aiSummary:
            "700Credit provides credit and compliance tools to dealers.",
        },
      }),
    );
  });

  it("only suggests a genuinely different name, saving just the summary", async () => {
    prisma.company.findFirst.mockResolvedValueOnce({
      id: "co-1",
      name: "Nucar",
      domains: ["nucar.com"],
    } as any);
    aiResearchCompanyMock.mockResolvedValue({
      name: "Nucar Automotive Group",
      summary: "A dealership group in the northeastern US.",
    });

    const result = await researchCompanyAction("account-1", { id: "co-1" });

    expect(result?.data).toEqual({
      summary: "A dealership group in the northeastern US.",
      suggestedName: "Nucar Automotive Group",
      renamed: false,
      suggestedLabel: null,
    });
    expect(prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { aiSummary: "A dealership group in the northeastern US." },
      }),
    );
  });

  it("never renames into an existing company's name", async () => {
    prisma.company.findFirst
      .mockResolvedValueOnce({
        id: "co-1",
        name: "700credit",
        domains: ["700credit.com"],
      } as any)
      // Another company already holds the AI's name
      .mockResolvedValueOnce({ id: "co-2" } as any);
    aiResearchCompanyMock.mockResolvedValue({
      name: "700Credit",
      summary: "Summary.",
    });

    const result = await researchCompanyAction("account-1", { id: "co-1" });

    expect(result?.data?.renamed).toBe(false);
    expect(prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { aiSummary: "Summary." } }),
    );
  });
});

describe("researchCompanyAction label suggestions", () => {
  beforeEach(() => {
    prisma.company.update.mockResolvedValue({} as any);
    createEmailProviderMock.mockResolvedValue({
      getMessagesFromSender: vi.fn().mockResolvedValue({ messages: [] }),
    });
  });

  it("suggests an existing label without applying it", async () => {
    prisma.company.findFirst.mockResolvedValueOnce({
      id: "co-1",
      name: "Toyota",
      domains: ["toyota.com"],
      labelId: null,
    } as any);
    prisma.companyLabel.findMany.mockResolvedValue([
      { id: "lb-1", name: "Factory", parentId: null },
      { id: "lb-2", name: "Toyota Brands", parentId: "lb-1" },
    ] as any);
    aiResearchCompanyMock.mockResolvedValue({
      name: null,
      summary: "Summary.",
      label: { name: "toyota brands", parentName: "Factory" },
    });

    const result = await researchCompanyAction("account-1", { id: "co-1" });

    expect(result?.data?.suggestedLabel).toEqual({
      name: "Toyota Brands",
      parentName: "Factory",
      isNew: false,
    });
    // Manual research never applies labels on its own
    expect(prisma.company.update).toHaveBeenCalledTimes(1);
    expect(prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { aiSummary: "Summary." } }),
    );
  });

  it("marks a label the user doesn't have yet as new", async () => {
    prisma.company.findFirst.mockResolvedValueOnce({
      id: "co-1",
      name: "Stripe",
      domains: ["stripe.com"],
      labelId: null,
    } as any);
    prisma.companyLabel.findMany.mockResolvedValue([
      { id: "lb-1", name: "Factory", parentId: null },
    ] as any);
    aiResearchCompanyMock.mockResolvedValue({
      name: null,
      summary: "Summary.",
      label: { name: "Payments", parentName: "Vendors" },
    });

    const result = await researchCompanyAction("account-1", { id: "co-1" });

    expect(result?.data?.suggestedLabel).toEqual({
      name: "Payments",
      parentName: "Vendors",
      isNew: true,
    });
  });

  it("suggests nothing when the AI's pick is the current label", async () => {
    prisma.company.findFirst.mockResolvedValueOnce({
      id: "co-1",
      name: "Toyota",
      domains: ["toyota.com"],
      labelId: "lb-2",
    } as any);
    prisma.companyLabel.findMany.mockResolvedValue([
      { id: "lb-2", name: "Factory", parentId: null },
    ] as any);
    aiResearchCompanyMock.mockResolvedValue({
      name: null,
      summary: "Summary.",
      label: { name: "Factory", parentName: null },
    });

    const result = await researchCompanyAction("account-1", { id: "co-1" });

    expect(result?.data?.suggestedLabel).toBeNull();
  });
});
