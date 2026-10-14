import { describe, expect, it } from "vitest";
import {
  discoverICloudFolders,
  decodeICloudFolderId,
  encodeICloudFolderId,
  validateICloudFolders,
} from "./folders";

describe("iCloud folder mappings", () => {
  const folders = [
    { path: "INBOX", flags: new Set<string>(), specialUse: "\\Inbox" },
    {
      path: "Persönlich/Gesendet",
      flags: new Set<string>(),
      specialUse: "\\Sent",
    },
    { path: "Archive backups", flags: new Set<string>() },
    {
      path: "Not selectable",
      flags: new Set(["\\Noselect"]),
      specialUse: "\\Archive",
    },
  ];
  it("uses server roles rather than guessing from display names", () => {
    expect(discoverICloudFolders(folders)).toEqual({
      inbox: "INBOX",
      sent: "Persönlich/Gesendet",
    });
  });
  it("rejects mappings that could turn archive or trash into the inbox", () => {
    expect(() =>
      validateICloudFolders({ inbox: "INBOX", archive: "INBOX" }, folders),
    ).toThrow();
    expect(() =>
      validateICloudFolders({ inbox: "Not selectable" }, folders),
    ).toThrow();
    expect(() =>
      validateICloudFolders({ inbox: "missing" }, folders),
    ).toThrow();
  });
  it("accepts multiple unassigned optional roles", () => {
    expect(
      validateICloudFolders(
        { inbox: "INBOX", archive: undefined, trash: undefined },
        folders,
      ),
    ).toEqual({ inbox: "INBOX", archive: undefined, trash: undefined });
  });
  it("round-trips exact Unicode folder paths without path guessing", () => {
    const path = "Receipts/日本語 & orders";
    expect(decodeICloudFolderId(encodeICloudFolderId(path))).toBe(path);
    expect(() => decodeICloudFolderId("inbox")).toThrow();
    expect(() => decodeICloudFolderId("imap:AA")).toThrow();
  });
});
