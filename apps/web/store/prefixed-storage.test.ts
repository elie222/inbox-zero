import { describe, expect, it } from "vitest";
import { removePrefixedStorageKeys } from "./prefixed-storage";

describe("removePrefixedStorageKeys", () => {
  it("collects matching keys before removing so later indexes are not skipped", () => {
    const store: Record<string, string> = {
      "keep:one": "1",
      "drop:a": "a",
      "drop:b": "b",
      "keep:two": "2",
    };
    const storage = {
      get length() {
        return Object.keys(store).length;
      },
      key(index: number) {
        return Object.keys(store)[index] ?? null;
      },
      getItem(key: string) {
        return Object.hasOwn(store, key) ? store[key] : null;
      },
      setItem(key: string, value: string) {
        store[key] = value;
      },
      removeItem(key: string) {
        delete store[key];
      },
      clear() {
        for (const key of Object.keys(store)) delete store[key];
      },
    } satisfies Storage;

    removePrefixedStorageKeys(storage, "drop:");

    expect(Object.keys(store).sort()).toEqual(["keep:one", "keep:two"]);
  });
});
