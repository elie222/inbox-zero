import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPluginStorage, PluginStorageError } from "./storage-context";
import prisma from "@/utils/__mocks__/prisma";

// Run with: pnpm test lib/plugin-runtime/storage-context.test.ts

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/logger", () => ({
  createScopedLogger: () => ({
    trace: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("PluginStorage", () => {
  const pluginId = "test-plugin";
  const userId = "user-123";
  const emailAccountId = "account-456";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Basic KV Operations", () => {
    describe("get", () => {
      it("should return null when no record exists", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        const result = await storage.get("nonexistent-key");

        expect(result).toBeNull();
        expect(prisma.pluginAccountSettings.findUnique).toHaveBeenCalledWith({
          where: {
            pluginId_emailAccountId: {
              pluginId,
              emailAccountId,
            },
          },
          select: { settings: true },
        });
      });

      it("should return null when settings is null", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue({
          settings: null,
        } as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        const result = await storage.get("some-key");

        expect(result).toBeNull();
      });

      it("should return null when key does not exist in settings", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue({
          settings: {
            "_kv:other-key": "other-value",
          },
        } as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        const result = await storage.get("nonexistent");

        expect(result).toBeNull();
      });

      it("should return stored value with correct type", async () => {
        const storedData = { name: "test", count: 42 };
        prisma.pluginAccountSettings.findUnique.mockResolvedValue({
          settings: {
            "_kv:my-key": storedData,
            _ttl_metadata: {},
          },
        } as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        const result = await storage.get<{ name: string; count: number }>(
          "my-key",
        );

        expect(result).toEqual(storedData);
      });

      it("should return string values", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue({
          settings: {
            "_kv:string-key": "hello world",
            _ttl_metadata: {},
          },
        } as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        const result = await storage.get<string>("string-key");

        expect(result).toBe("hello world");
      });

      it("should return array values", async () => {
        const arrayValue = [1, 2, 3, "test"];
        prisma.pluginAccountSettings.findUnique.mockResolvedValue({
          settings: {
            "_kv:array-key": arrayValue,
            _ttl_metadata: {},
          },
        } as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        const result = await storage.get<(number | string)[]>("array-key");

        expect(result).toEqual(arrayValue);
      });

      it("should throw PluginStorageError on database error", async () => {
        prisma.pluginAccountSettings.findUnique.mockRejectedValue(
          new Error("Database connection failed"),
        );

        const storage = createPluginStorage(pluginId, userId, emailAccountId);

        await expect(storage.get("any-key")).rejects.toThrow(
          PluginStorageError,
        );
        await expect(storage.get("any-key")).rejects.toThrow(
          'Failed to get storage value for key "any-key"',
        );
      });
    });

    describe("set", () => {
      it("should create new record when none exists", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);
        prisma.pluginAccountSettings.upsert.mockResolvedValue({} as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await storage.set("new-key", "new-value");

        expect(prisma.pluginAccountSettings.upsert).toHaveBeenCalledWith({
          where: {
            pluginId_emailAccountId: {
              pluginId,
              emailAccountId,
            },
          },
          create: {
            pluginId,
            emailAccountId,
            settings: {
              "_kv:new-key": "new-value",
              _ttl_metadata: {},
            },
          },
          update: {
            settings: {
              "_kv:new-key": "new-value",
              _ttl_metadata: {},
            },
          },
        });
      });

      it("should merge with existing settings", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue({
          settings: {
            "_kv:existing-key": "existing-value",
            _ttl_metadata: {},
          },
        } as any);
        prisma.pluginAccountSettings.upsert.mockResolvedValue({} as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await storage.set("new-key", "new-value");

        expect(prisma.pluginAccountSettings.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            create: expect.objectContaining({
              settings: {
                "_kv:existing-key": "existing-value",
                "_kv:new-key": "new-value",
                _ttl_metadata: {},
              },
            }),
            update: expect.objectContaining({
              settings: {
                "_kv:existing-key": "existing-value",
                "_kv:new-key": "new-value",
                _ttl_metadata: {},
              },
            }),
          }),
        );
      });

      it("should update existing key", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue({
          settings: {
            "_kv:my-key": "old-value",
            _ttl_metadata: {},
          },
        } as any);
        prisma.pluginAccountSettings.upsert.mockResolvedValue({} as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await storage.set("my-key", "updated-value");

        expect(prisma.pluginAccountSettings.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            update: expect.objectContaining({
              settings: expect.objectContaining({
                "_kv:my-key": "updated-value",
              }),
            }),
          }),
        );
      });

      it("should store complex objects", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);
        prisma.pluginAccountSettings.upsert.mockResolvedValue({} as any);

        const complexData = {
          nested: { deep: { value: 123 } },
          array: [1, "two", { three: 3 }],
          boolean: true,
          nullValue: null,
        };

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await storage.set("complex-key", complexData);

        expect(prisma.pluginAccountSettings.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            create: expect.objectContaining({
              settings: expect.objectContaining({
                "_kv:complex-key": complexData,
              }),
            }),
          }),
        );
      });

      it("should throw PluginStorageError on database error", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);
        prisma.pluginAccountSettings.upsert.mockRejectedValue(
          new Error("Database write failed"),
        );

        const storage = createPluginStorage(pluginId, userId, emailAccountId);

        await expect(storage.set("key", "value")).rejects.toThrow(
          PluginStorageError,
        );
        await expect(storage.set("key", "value")).rejects.toThrow(
          'Failed to set storage value for key "key"',
        );
      });
    });

    describe("delete", () => {
      it("should do nothing when no record exists", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await storage.delete("nonexistent-key");

        expect(prisma.pluginAccountSettings.update).not.toHaveBeenCalled();
      });

      it("should do nothing when settings is null", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue({
          settings: null,
        } as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await storage.delete("any-key");

        expect(prisma.pluginAccountSettings.update).not.toHaveBeenCalled();
      });

      it("should remove key from settings", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue({
          settings: {
            "_kv:key-to-delete": "value",
            "_kv:other-key": "keep-me",
            _ttl_metadata: {
              "key-to-delete": 1_705_320_000_000,
            },
          },
        } as any);
        prisma.pluginAccountSettings.update.mockResolvedValue({} as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await storage.delete("key-to-delete");

        expect(prisma.pluginAccountSettings.update).toHaveBeenCalledWith({
          where: {
            pluginId_emailAccountId: {
              pluginId,
              emailAccountId,
            },
          },
          data: {
            settings: {
              "_kv:other-key": "keep-me",
              _ttl_metadata: {},
            },
          },
        });
      });

      it("should also remove TTL metadata for deleted key", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue({
          settings: {
            "_kv:my-key": "my-value",
            _ttl_metadata: {
              "my-key": 1_705_320_000_000,
              "other-key": 1_705_400_000_000,
            },
          },
        } as any);
        prisma.pluginAccountSettings.update.mockResolvedValue({} as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await storage.delete("my-key");

        expect(prisma.pluginAccountSettings.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: {
              settings: {
                _ttl_metadata: {
                  "other-key": 1_705_400_000_000,
                },
              },
            },
          }),
        );
      });

      it("should throw PluginStorageError on database error", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue({
          settings: { "_kv:key": "value", _ttl_metadata: {} },
        } as any);
        prisma.pluginAccountSettings.update.mockRejectedValue(
          new Error("Database error"),
        );

        const storage = createPluginStorage(pluginId, userId, emailAccountId);

        await expect(storage.delete("key")).rejects.toThrow(PluginStorageError);
        await expect(storage.delete("key")).rejects.toThrow(
          'Failed to delete storage value for key "key"',
        );
      });
    });
  });

  describe("TTL Expiration Behavior", () => {
    it("should set TTL metadata when ttl is provided", async () => {
      prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);
      prisma.pluginAccountSettings.upsert.mockResolvedValue({} as any);

      const storage = createPluginStorage(pluginId, userId, emailAccountId);
      await storage.set("ttl-key", "ttl-value", 3600); // 1 hour TTL

      const expectedExpiration = Date.now() + 3600 * 1000;
      expect(prisma.pluginAccountSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            settings: expect.objectContaining({
              "_kv:ttl-key": "ttl-value",
              _ttl_metadata: {
                "ttl-key": expectedExpiration,
              },
            }),
          }),
        }),
      );
    });

    it("should preserve existing TTL metadata when adding new key", async () => {
      prisma.pluginAccountSettings.findUnique.mockResolvedValue({
        settings: {
          "_kv:existing-key": "existing-value",
          _ttl_metadata: {
            "existing-key": 1_705_400_000_000,
          },
        },
      } as any);
      prisma.pluginAccountSettings.upsert.mockResolvedValue({} as any);

      const storage = createPluginStorage(pluginId, userId, emailAccountId);
      await storage.set("new-key", "new-value", 7200);

      expect(prisma.pluginAccountSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            settings: expect.objectContaining({
              _ttl_metadata: {
                "existing-key": 1_705_400_000_000,
                "new-key": Date.now() + 7200 * 1000,
              },
            }),
          }),
        }),
      );
    });

    it("should remove TTL when setting value without ttl", async () => {
      prisma.pluginAccountSettings.findUnique.mockResolvedValue({
        settings: {
          "_kv:my-key": "old-value",
          _ttl_metadata: {
            "my-key": 1_705_400_000_000,
          },
        },
      } as any);
      prisma.pluginAccountSettings.upsert.mockResolvedValue({} as any);

      const storage = createPluginStorage(pluginId, userId, emailAccountId);
      await storage.set("my-key", "new-value"); // no TTL

      expect(prisma.pluginAccountSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            settings: expect.objectContaining({
              "_kv:my-key": "new-value",
              _ttl_metadata: {}, // my-key removed from TTL
            }),
          }),
        }),
      );
    });

    it("should return null for expired keys", async () => {
      const expiredTimestamp = Date.now() - 1000; // 1 second ago
      prisma.pluginAccountSettings.findUnique.mockResolvedValue({
        settings: {
          "_kv:expired-key": "expired-value",
          _ttl_metadata: {
            "expired-key": expiredTimestamp,
          },
        },
      } as any);
      // mock the delete call that happens asynchronously
      prisma.pluginAccountSettings.update.mockResolvedValue({} as any);

      const storage = createPluginStorage(pluginId, userId, emailAccountId);
      const result = await storage.get("expired-key");

      expect(result).toBeNull();
    });

    it("should return value for non-expired keys", async () => {
      const futureTimestamp = Date.now() + 3_600_000; // 1 hour from now
      prisma.pluginAccountSettings.findUnique.mockResolvedValue({
        settings: {
          "_kv:valid-key": "valid-value",
          _ttl_metadata: {
            "valid-key": futureTimestamp,
          },
        },
      } as any);

      const storage = createPluginStorage(pluginId, userId, emailAccountId);
      const result = await storage.get("valid-key");

      expect(result).toBe("valid-value");
    });

    it("should return value when no TTL metadata exists for key", async () => {
      prisma.pluginAccountSettings.findUnique.mockResolvedValue({
        settings: {
          "_kv:no-ttl-key": "persistent-value",
          _ttl_metadata: {},
        },
      } as any);

      const storage = createPluginStorage(pluginId, userId, emailAccountId);
      const result = await storage.get("no-ttl-key");

      expect(result).toBe("persistent-value");
    });

    it("should handle zero TTL by not setting expiration", async () => {
      prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);
      prisma.pluginAccountSettings.upsert.mockResolvedValue({} as any);

      const storage = createPluginStorage(pluginId, userId, emailAccountId);
      await storage.set("key", "value", 0);

      expect(prisma.pluginAccountSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            settings: expect.objectContaining({
              _ttl_metadata: {},
            }),
          }),
        }),
      );
    });

    it("should handle negative TTL by not setting expiration", async () => {
      prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);
      prisma.pluginAccountSettings.upsert.mockResolvedValue({} as any);

      const storage = createPluginStorage(pluginId, userId, emailAccountId);
      await storage.set("key", "value", -100);

      expect(prisma.pluginAccountSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            settings: expect.objectContaining({
              _ttl_metadata: {},
            }),
          }),
        }),
      );
    });
  });

  describe("Size Limit Enforcement", () => {
    describe("Individual value size limit (16KB)", () => {
      it("should accept values under 16KB", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);
        prisma.pluginAccountSettings.upsert.mockResolvedValue({} as any);

        const smallValue = "x".repeat(1000); // 1KB string

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await expect(storage.set("key", smallValue)).resolves.not.toThrow();
      });

      it("should accept values at exactly 16KB", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);
        prisma.pluginAccountSettings.upsert.mockResolvedValue({} as any);

        // JSON.stringify adds quotes, so we need slightly less than 16KB raw
        const maxValue = "x".repeat(16 * 1024 - 2);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await expect(storage.set("key", maxValue)).resolves.not.toThrow();
      });

      it("should throw error for values exceeding 16KB", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);

        const largeValue = "x".repeat(17 * 1024); // 17KB string

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await expect(storage.set("key", largeValue)).rejects.toThrow(
          /Value exceeds maximum size of 16384 bytes/,
        );
      });

      it("should enforce limit on serialized size, not raw size", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);

        // Object that serializes to > 16KB
        const largeObject = {
          data: "x".repeat(16 * 1024),
        };

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await expect(storage.set("key", largeObject)).rejects.toThrow(
          /Value exceeds maximum size of 16384 bytes/,
        );
      });
    });

    describe("Total KV storage size limit (256KB)", () => {
      it("should accept total storage under 256KB", async () => {
        // Existing ~100KB of data
        const existingData: Record<string, unknown> = {
          _ttl_metadata: {},
        };
        for (let i = 0; i < 10; i++) {
          existingData[`_kv:key${i}`] = "x".repeat(10_000); // 10KB each = 100KB total
        }

        prisma.pluginAccountSettings.findUnique.mockResolvedValue({
          settings: existingData,
        } as any);
        prisma.pluginAccountSettings.upsert.mockResolvedValue({} as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await expect(
          storage.set("new-key", "x".repeat(10_000)),
        ).resolves.not.toThrow();
      });

      it("should throw error when total storage exceeds 256KB", async () => {
        // Create existing data that approaches 256KB
        // The size calculation is: key.length + JSON.stringify(value).length
        // For a string value, JSON.stringify adds 2 bytes for quotes
        // _kv:keyXX is 9-10 chars, value 'x'.repeat(10000) serializes to 10002 bytes
        // So each entry is roughly 10012 bytes
        // 256KB = 262144 bytes, so ~26 entries should exceed it
        const existingData: Record<string, unknown> = {
          _ttl_metadata: {},
        };
        for (let i = 0; i < 26; i++) {
          existingData[`_kv:key${i.toString().padStart(2, "0")}`] = "x".repeat(
            10_000,
          );
        }

        prisma.pluginAccountSettings.findUnique.mockResolvedValue({
          settings: existingData,
        } as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        // Adding another 10KB value should push us over 256KB
        // The error is thrown before prisma.upsert and wrapped in PluginStorageError
        try {
          await storage.set("new-key", "x".repeat(10_000));
          expect.fail("Should have thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(PluginStorageError);
          expect((error as PluginStorageError).cause).toBeInstanceOf(Error);
          expect(
            ((error as PluginStorageError).cause as Error).message,
          ).toMatch(/Total key-value storage exceeds maximum of 262144 bytes/);
        }
      });
    });

    describe("Settings size limit (64KB)", () => {
      it("should accept user settings under 64KB", async () => {
        prisma.pluginUserSettings.findUnique.mockResolvedValue(null);
        prisma.pluginUserSettings.upsert.mockResolvedValue({} as any);

        const smallSettings = { data: "x".repeat(1000) };

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await expect(
          storage.setUserSettings(smallSettings),
        ).resolves.not.toThrow();
      });

      it("should throw error for user settings exceeding 64KB", async () => {
        const largeSettings = { data: "x".repeat(65 * 1024) };

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await expect(storage.setUserSettings(largeSettings)).rejects.toThrow(
          /Settings exceed maximum size of 65536 bytes/,
        );
      });

      it("should accept account settings under 64KB", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);
        prisma.pluginAccountSettings.upsert.mockResolvedValue({} as any);

        const smallSettings = { data: "x".repeat(1000) };

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await expect(
          storage.setAccountSettings(smallSettings),
        ).resolves.not.toThrow();
      });

      it("should throw error for account settings exceeding 64KB", async () => {
        const largeSettings = { data: "x".repeat(65 * 1024) };

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await expect(storage.setAccountSettings(largeSettings)).rejects.toThrow(
          /Settings exceed maximum size of 65536 bytes/,
        );
      });
    });
  });

  describe("Isolation Between Plugins", () => {
    it("should query with correct pluginId scope", async () => {
      prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);

      const storagePluginA = createPluginStorage(
        "plugin-a",
        userId,
        emailAccountId,
      );
      const storagePluginB = createPluginStorage(
        "plugin-b",
        userId,
        emailAccountId,
      );

      await storagePluginA.get("shared-key-name");
      await storagePluginB.get("shared-key-name");

      expect(prisma.pluginAccountSettings.findUnique).toHaveBeenCalledWith({
        where: {
          pluginId_emailAccountId: {
            pluginId: "plugin-a",
            emailAccountId,
          },
        },
        select: { settings: true },
      });

      expect(prisma.pluginAccountSettings.findUnique).toHaveBeenCalledWith({
        where: {
          pluginId_emailAccountId: {
            pluginId: "plugin-b",
            emailAccountId,
          },
        },
        select: { settings: true },
      });
    });

    it("should write to correct pluginId scope", async () => {
      prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);
      prisma.pluginAccountSettings.upsert.mockResolvedValue({} as any);

      const storagePluginA = createPluginStorage(
        "plugin-a",
        userId,
        emailAccountId,
      );
      await storagePluginA.set("my-key", "plugin-a-value");

      expect(prisma.pluginAccountSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            pluginId_emailAccountId: {
              pluginId: "plugin-a",
              emailAccountId,
            },
          },
          create: expect.objectContaining({
            pluginId: "plugin-a",
          }),
        }),
      );
    });

    it("should delete from correct pluginId scope", async () => {
      prisma.pluginAccountSettings.findUnique.mockResolvedValue({
        settings: { "_kv:key": "value", _ttl_metadata: {} },
      } as any);
      prisma.pluginAccountSettings.update.mockResolvedValue({} as any);

      const storage = createPluginStorage(
        "specific-plugin",
        userId,
        emailAccountId,
      );
      await storage.delete("key");

      expect(prisma.pluginAccountSettings.update).toHaveBeenCalledWith({
        where: {
          pluginId_emailAccountId: {
            pluginId: "specific-plugin",
            emailAccountId,
          },
        },
        data: expect.any(Object),
      });
    });

    it("should isolate user settings by pluginId", async () => {
      prisma.pluginUserSettings.findUnique.mockResolvedValue(null);
      prisma.pluginUserSettings.upsert.mockResolvedValue({} as any);

      const storagePluginA = createPluginStorage(
        "plugin-a",
        userId,
        emailAccountId,
      );
      await storagePluginA.setUserSettings({ theme: "dark" });

      expect(prisma.pluginUserSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            pluginId_userId: {
              pluginId: "plugin-a",
              userId,
            },
          },
          create: expect.objectContaining({
            pluginId: "plugin-a",
            userId,
          }),
        }),
      );
    });
  });

  describe("User vs Account Settings Separation", () => {
    describe("getUserSettings", () => {
      it("should return null when no settings exist", async () => {
        prisma.pluginUserSettings.findUnique.mockResolvedValue(null);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        const result = await storage.getUserSettings();

        expect(result).toBeNull();
      });

      it("should return null when settings is null", async () => {
        prisma.pluginUserSettings.findUnique.mockResolvedValue({
          settings: null,
        } as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        const result = await storage.getUserSettings();

        expect(result).toBeNull();
      });

      it("should return user settings", async () => {
        prisma.pluginUserSettings.findUnique.mockResolvedValue({
          settings: {
            theme: "dark",
            notifications: true,
          },
        } as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        const result = await storage.getUserSettings<{
          theme: string;
          notifications: boolean;
        }>();

        expect(result).toEqual({
          theme: "dark",
          notifications: true,
        });
      });

      it("should filter out internal keys (prefixed with _)", async () => {
        prisma.pluginUserSettings.findUnique.mockResolvedValue({
          settings: {
            publicSetting: "visible",
            _internalKey: "hidden",
            _anotherInternal: "also hidden",
          },
        } as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        const result = await storage.getUserSettings();

        expect(result).toEqual({
          publicSetting: "visible",
        });
      });

      it("should return null when only internal keys exist", async () => {
        prisma.pluginUserSettings.findUnique.mockResolvedValue({
          settings: {
            _internalKey: "hidden",
          },
        } as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        const result = await storage.getUserSettings();

        expect(result).toBeNull();
      });

      it("should query with correct userId scope", async () => {
        prisma.pluginUserSettings.findUnique.mockResolvedValue(null);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await storage.getUserSettings();

        expect(prisma.pluginUserSettings.findUnique).toHaveBeenCalledWith({
          where: {
            pluginId_userId: {
              pluginId,
              userId,
            },
          },
          select: { settings: true },
        });
      });

      it("should throw PluginStorageError on database error", async () => {
        prisma.pluginUserSettings.findUnique.mockRejectedValue(
          new Error("Database error"),
        );

        const storage = createPluginStorage(pluginId, userId, emailAccountId);

        await expect(storage.getUserSettings()).rejects.toThrow(
          PluginStorageError,
        );
        await expect(storage.getUserSettings()).rejects.toThrow(
          "Failed to get user settings",
        );
      });
    });

    describe("setUserSettings", () => {
      it("should create new user settings when none exist", async () => {
        prisma.pluginUserSettings.findUnique.mockResolvedValue(null);
        prisma.pluginUserSettings.upsert.mockResolvedValue({} as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await storage.setUserSettings({ theme: "light" });

        expect(prisma.pluginUserSettings.upsert).toHaveBeenCalledWith({
          where: {
            pluginId_userId: {
              pluginId,
              userId,
            },
          },
          create: {
            pluginId,
            userId,
            settings: { theme: "light" },
          },
          update: {
            settings: { theme: "light" },
          },
        });
      });

      it("should preserve internal keys when updating user settings", async () => {
        prisma.pluginUserSettings.findUnique.mockResolvedValue({
          settings: {
            oldSetting: "will be replaced",
            _internalKey: "preserve me",
          },
        } as any);
        prisma.pluginUserSettings.upsert.mockResolvedValue({} as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await storage.setUserSettings({ newSetting: "new value" });

        expect(prisma.pluginUserSettings.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            update: {
              settings: {
                _internalKey: "preserve me",
                newSetting: "new value",
              },
            },
          }),
        );
      });

      it("should throw PluginStorageError on database error", async () => {
        prisma.pluginUserSettings.findUnique.mockResolvedValue(null);
        prisma.pluginUserSettings.upsert.mockRejectedValue(
          new Error("Database error"),
        );

        const storage = createPluginStorage(pluginId, userId, emailAccountId);

        await expect(storage.setUserSettings({ key: "value" })).rejects.toThrow(
          PluginStorageError,
        );
        await expect(storage.setUserSettings({ key: "value" })).rejects.toThrow(
          "Failed to set user settings",
        );
      });
    });

    describe("getAccountSettings", () => {
      it("should return null when no settings exist", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        const result = await storage.getAccountSettings();

        expect(result).toBeNull();
      });

      it("should return account settings", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue({
          settings: {
            syncEnabled: true,
            lastSync: "2024-01-15",
          },
        } as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        const result = await storage.getAccountSettings<{
          syncEnabled: boolean;
          lastSync: string;
        }>();

        expect(result).toEqual({
          syncEnabled: true,
          lastSync: "2024-01-15",
        });
      });

      it("should filter out KV storage keys (prefixed with _kv:)", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue({
          settings: {
            accountSetting: "visible",
            "_kv:some-key": "hidden",
            "_kv:another-key": "also hidden",
          },
        } as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        const result = await storage.getAccountSettings();

        expect(result).toEqual({
          accountSetting: "visible",
        });
      });

      it("should filter out internal keys (prefixed with _)", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue({
          settings: {
            accountSetting: "visible",
            _ttl_metadata: { key: 123 },
            _internalKey: "hidden",
          },
        } as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        const result = await storage.getAccountSettings();

        expect(result).toEqual({
          accountSetting: "visible",
        });
      });

      it("should return null when only KV and internal keys exist", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue({
          settings: {
            "_kv:key": "value",
            _ttl_metadata: {},
          },
        } as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        const result = await storage.getAccountSettings();

        expect(result).toBeNull();
      });

      it("should query with correct emailAccountId scope", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await storage.getAccountSettings();

        expect(prisma.pluginAccountSettings.findUnique).toHaveBeenCalledWith({
          where: {
            pluginId_emailAccountId: {
              pluginId,
              emailAccountId,
            },
          },
          select: { settings: true },
        });
      });

      it("should throw PluginStorageError on database error", async () => {
        prisma.pluginAccountSettings.findUnique.mockRejectedValue(
          new Error("Database error"),
        );

        const storage = createPluginStorage(pluginId, userId, emailAccountId);

        await expect(storage.getAccountSettings()).rejects.toThrow(
          PluginStorageError,
        );
        await expect(storage.getAccountSettings()).rejects.toThrow(
          "Failed to get account settings",
        );
      });
    });

    describe("setAccountSettings", () => {
      it("should create new account settings when none exist", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);
        prisma.pluginAccountSettings.upsert.mockResolvedValue({} as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await storage.setAccountSettings({ syncEnabled: true });

        expect(prisma.pluginAccountSettings.upsert).toHaveBeenCalledWith({
          where: {
            pluginId_emailAccountId: {
              pluginId,
              emailAccountId,
            },
          },
          create: {
            pluginId,
            emailAccountId,
            settings: { syncEnabled: true },
          },
          update: {
            settings: { syncEnabled: true },
          },
        });
      });

      it("should preserve KV storage keys when updating account settings", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue({
          settings: {
            oldSetting: "will be replaced",
            "_kv:cached-data": "preserve me",
            _ttl_metadata: { "cached-data": 123_456_789 },
          },
        } as any);
        prisma.pluginAccountSettings.upsert.mockResolvedValue({} as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await storage.setAccountSettings({ newSetting: "new value" });

        expect(prisma.pluginAccountSettings.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            update: {
              settings: {
                "_kv:cached-data": "preserve me",
                _ttl_metadata: { "cached-data": 123_456_789 },
                newSetting: "new value",
              },
            },
          }),
        );
      });

      it("should throw PluginStorageError on database error", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);
        prisma.pluginAccountSettings.upsert.mockRejectedValue(
          new Error("Database error"),
        );

        const storage = createPluginStorage(pluginId, userId, emailAccountId);

        await expect(
          storage.setAccountSettings({ key: "value" }),
        ).rejects.toThrow(PluginStorageError);
        await expect(
          storage.setAccountSettings({ key: "value" }),
        ).rejects.toThrow("Failed to set account settings");
      });
    });

    describe("User settings vs Account settings independence", () => {
      it("should use different tables for user and account settings", async () => {
        prisma.pluginUserSettings.findUnique.mockResolvedValue(null);
        prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await storage.getUserSettings();
        await storage.getAccountSettings();

        expect(prisma.pluginUserSettings.findUnique).toHaveBeenCalledTimes(1);
        expect(prisma.pluginAccountSettings.findUnique).toHaveBeenCalledTimes(
          1,
        );
      });

      it("should allow same setting names in user and account settings", async () => {
        prisma.pluginUserSettings.findUnique.mockResolvedValue({
          settings: { theme: "dark" },
        } as any);
        prisma.pluginAccountSettings.findUnique.mockResolvedValue({
          settings: { theme: "light" },
        } as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        const userSettings = await storage.getUserSettings<{ theme: string }>();
        const accountSettings = await storage.getAccountSettings<{
          theme: string;
        }>();

        expect(userSettings?.theme).toBe("dark");
        expect(accountSettings?.theme).toBe("light");
      });
    });
  });

  describe("Edge Cases", () => {
    describe("Null values", () => {
      it("should store null values", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);
        prisma.pluginAccountSettings.upsert.mockResolvedValue({} as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await storage.set("null-key", null);

        expect(prisma.pluginAccountSettings.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            create: expect.objectContaining({
              settings: expect.objectContaining({
                "_kv:null-key": null,
              }),
            }),
          }),
        );
      });

      it("should retrieve null values", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue({
          settings: {
            "_kv:null-key": null,
            _ttl_metadata: {},
          },
        } as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        const result = await storage.get("null-key");

        // null stored value should be returned as null (not undefined converted to null)
        expect(result).toBeNull();
      });
    });

    describe("Empty strings", () => {
      it("should store empty string values", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);
        prisma.pluginAccountSettings.upsert.mockResolvedValue({} as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await storage.set("empty-key", "");

        expect(prisma.pluginAccountSettings.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            create: expect.objectContaining({
              settings: expect.objectContaining({
                "_kv:empty-key": "",
              }),
            }),
          }),
        );
      });

      it("should retrieve empty string values", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue({
          settings: {
            "_kv:empty-key": "",
            _ttl_metadata: {},
          },
        } as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        const result = await storage.get<string>("empty-key");

        expect(result).toBe("");
      });
    });

    describe("Special characters in keys", () => {
      it("should handle keys with dots", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);
        prisma.pluginAccountSettings.upsert.mockResolvedValue({} as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await storage.set("config.setting.nested", "value");

        expect(prisma.pluginAccountSettings.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            create: expect.objectContaining({
              settings: expect.objectContaining({
                "_kv:config.setting.nested": "value",
              }),
            }),
          }),
        );
      });

      it("should handle keys with colons", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);
        prisma.pluginAccountSettings.upsert.mockResolvedValue({} as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await storage.set("namespace:category:key", "value");

        expect(prisma.pluginAccountSettings.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            create: expect.objectContaining({
              settings: expect.objectContaining({
                "_kv:namespace:category:key": "value",
              }),
            }),
          }),
        );
      });

      it("should handle keys with slashes", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);
        prisma.pluginAccountSettings.upsert.mockResolvedValue({} as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await storage.set("path/to/key", "value");

        expect(prisma.pluginAccountSettings.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            create: expect.objectContaining({
              settings: expect.objectContaining({
                "_kv:path/to/key": "value",
              }),
            }),
          }),
        );
      });

      it("should handle keys with special unicode characters", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);
        prisma.pluginAccountSettings.upsert.mockResolvedValue({} as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await storage.set("emoji-key-test", "value");

        expect(prisma.pluginAccountSettings.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            create: expect.objectContaining({
              settings: expect.objectContaining({
                "_kv:emoji-key-test": "value",
              }),
            }),
          }),
        );
      });

      it("should handle keys with spaces", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);
        prisma.pluginAccountSettings.upsert.mockResolvedValue({} as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await storage.set("key with spaces", "value");

        expect(prisma.pluginAccountSettings.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            create: expect.objectContaining({
              settings: expect.objectContaining({
                "_kv:key with spaces": "value",
              }),
            }),
          }),
        );
      });

      it("should handle empty key", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue(null);
        prisma.pluginAccountSettings.upsert.mockResolvedValue({} as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        await storage.set("", "value-for-empty-key");

        expect(prisma.pluginAccountSettings.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            create: expect.objectContaining({
              settings: expect.objectContaining({
                "_kv:": "value-for-empty-key",
              }),
            }),
          }),
        );
      });
    });

    describe("Boolean and number values", () => {
      it("should store and retrieve boolean true", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue({
          settings: {
            "_kv:bool-key": true,
            _ttl_metadata: {},
          },
        } as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        const result = await storage.get<boolean>("bool-key");

        expect(result).toBe(true);
      });

      it("should store and retrieve boolean false", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue({
          settings: {
            "_kv:bool-key": false,
            _ttl_metadata: {},
          },
        } as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        const result = await storage.get<boolean>("bool-key");

        expect(result).toBe(false);
      });

      it("should store and retrieve zero", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue({
          settings: {
            "_kv:num-key": 0,
            _ttl_metadata: {},
          },
        } as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        const result = await storage.get<number>("num-key");

        expect(result).toBe(0);
      });

      it("should store and retrieve negative numbers", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue({
          settings: {
            "_kv:num-key": -42,
            _ttl_metadata: {},
          },
        } as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        const result = await storage.get<number>("num-key");

        expect(result).toBe(-42);
      });
    });

    describe("Undefined handling", () => {
      it("should return null for undefined values in storage", async () => {
        prisma.pluginAccountSettings.findUnique.mockResolvedValue({
          settings: {
            "_kv:other-key": "exists",
            _ttl_metadata: {},
          },
        } as any);

        const storage = createPluginStorage(pluginId, userId, emailAccountId);
        const result = await storage.get("nonexistent");

        expect(result).toBeNull();
      });
    });
  });

  describe("PluginStorageError", () => {
    it("should have correct error properties", async () => {
      prisma.pluginAccountSettings.findUnique.mockRejectedValue(
        new Error("Original error"),
      );

      const storage = createPluginStorage(pluginId, userId, emailAccountId);

      try {
        await storage.get("key");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PluginStorageError);
        expect((error as PluginStorageError).name).toBe("PluginStorageError");
        expect((error as PluginStorageError).code).toBe("plugin-storage-error");
        expect((error as PluginStorageError).cause).toBeInstanceOf(Error);
      }
    });
  });
});
