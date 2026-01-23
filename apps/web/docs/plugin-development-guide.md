# Inbox Zero Plugin Development Guide

Build plugins that extend Inbox Zero's email intelligence with custom classification, automation, and calendar integration.

## What Can Plugins Do?

Plugins let you customize Inbox Zero in four key ways:

| Category | Capabilities | Example Use Cases |
|----------|--------------|-------------------|
| **Classify & Label** | `email:classify` | Auto-tag newsletters, detect urgent emails, identify VIPs |
| **Automate Actions** | `email:modify`, `automation:rule` | Archive low-priority, apply labels, move to folders |
| **Generate Content** | `email:draft`, `email:send` | Draft replies, send follow-up reminders |
| **Integrate External** | `schedule:cron`, `calendar:*` | Sync with CRM, daily digests, meeting prep |

## Prerequisites

Before building a plugin, you should:

- **Know**: Basic TypeScript (types, async/await)
- **Have**: A local Inbox Zero development environment running
- **Understand**: The email workflow you want to automate

No backend knowledge required - plugins run within Inbox Zero's runtime.

---

## Quick Start

### 1. Create Plugin Structure

```
my-plugin/
├── plugin.json       # Plugin manifest (required)
├── index.ts          # Entry point (required)
├── README.md         # Documentation
└── LICENSE           # License file
```

### 2. Define Your Manifest (plugin.json)

The manifest is minimal - just declare what your plugin does, and data access is derived automatically:

```json
{
  "id": "my-awesome-plugin",
  "name": "My Awesome Plugin",
  "version": "1.0.0",
  "description": "A plugin that does awesome things",
  "author": "Your Name",
  "license": "MIT",

  "inboxZero": {
    "minVersion": "0.14.0"
  },

  "entry": "index.ts",

  "capabilities": [
    "email:classify",
    "email:draft"
  ]
}
```

**Note:** You no longer need to specify `permissions` - data access is automatically derived from your capabilities:

| Capability | Implied Access |
|------------|----------------|
| `email:classify`, `email:signal`, `email:trigger`, `email:modify` | Email metadata (subject, from, snippet) |
| `email:draft`, `email:send`, `automation:rule`, `followup:detect` | Full email access (including body) |
| `calendar:read`, `calendar:list` | Calendar read access |
| `calendar:write` | Calendar read + write access |

### 3. Define User Settings (settings.json) - Optional

If your plugin has configurable options, define them in a separate `settings.json`:

```json
{
  "schema": {
    "type": "object",
    "properties": {
      "enabled": {
        "type": "boolean",
        "title": "Enable Feature",
        "description": "Turn this feature on or off",
        "default": true
      },
      "llmTier": {
        "type": "string",
        "title": "AI Quality",
        "description": "Choose the AI model tier",
        "enum": ["economy", "chat", "reasoning"],
        "default": "chat"
      }
    }
  },
  "ui": {
    "sections": [
      {
        "title": "General",
        "fields": ["enabled", "llmTier"]
      }
    ]
  }
}
```

### 4. Implement Your Plugin

```typescript
import { definePlugin } from "@inbox-zero/plugin-sdk";

export default definePlugin({
  async classifyEmail(ctx) {
    // Your classification logic
    if (ctx.email.subject.toLowerCase().includes("urgent")) {
      return { label: "Urgent", confidence: 0.95 };
    }
    return null;
  },

  async draftReply(ctx) {
    const response = await ctx.llm.generateText({
      prompt: `Draft a professional reply to: ${ctx.email.snippet}`,
    });
    return { body: response, confidence: 0.85 };
  },
});
```

---

## Plugin Manifest Reference

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique plugin identifier (kebab-case) |
| `name` | string | Human-readable name |
| `version` | string | Semantic version (e.g., "1.0.0") |
| `entry` | string | Entry point file (e.g., "index.ts") |
| `capabilities` | string[] | List of capabilities the plugin uses |
| `permissions` | object | Detailed permission requirements |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Plugin description |
| `author` | string | Author name |
| `license` | string | License identifier |
| `inboxZero.minVersion` | string | Minimum Inbox Zero version required |
| `llm.tier` | string | LLM model tier: "default", "economy", or "chat" |
| `config.requiresUserConfig` | boolean | Whether plugin needs user configuration |
| `library` | object | Library listing metadata (see [Library Metadata](#library-metadata)) |

---

## Capabilities

Capabilities determine which hooks your plugin can implement:

| Capability | Hook | Description | Min Trust |
|------------|------|-------------|-----------|
| `email:classify` | `classifyEmail` | Classify/label emails | unverified |
| `email:draft` | `draftReply` | Generate draft replies | community |
| `email:signal` | `onEmailReceived` | Emit automation signals | community |
| `email:trigger` | `onTriggeredEmail` | Handle triggered emails | community |
| `email:send` | - | Send emails proactively | verified |
| `email:send_as` | - | Send from plus-tag addresses | verified |
| `email:modify` | - | Archive, label, modify emails | verified |
| `schedule:cron` | `onScheduledTrigger` | Run on schedule | community |
| `automation:rule` | `evaluateRule` | Custom rule logic | verified |
| `followup:detect` | `detectFollowup` | Detect follow-ups | community |
| `calendar:read` | `onCalendarEvent` | Read calendar | community |
| `calendar:list` | - | List available calendars | community |
| `calendar:write` | - | Modify calendar | verified |
| `commands:register` | `registerCommands` | Add commands/search to Cmd-K | community |

---

## Permissions

### Email Permissions

Declare the email access tier your plugin requires:

```json
{
  "permissions": {
    "email": "metadata"
  }
}
```

| Tier | Risk Level | Fields Included |
|------|------------|-----------------|
| `"none"` | None | No email access (default) |
| `"metadata"` | Low | subject, from, to, cc, date, snippet |
| `"full"` | Medium | All metadata + body content |

**Important**: If you don't declare email permissions, your plugin will have no access to email data.

### Calendar Permissions

```json
{
  "permissions": {
    "calendar": ["read", "write"]
  }
}
```

| Permission | Risk Level | Description |
|------------|------------|-------------|
| `read` | Medium | Read calendar events |
| `write` | High | Create/modify events |

### Action Permissions

```json
{
  "permissions": {
    "actions": ["draft_reply", "create_event", "send_email"]
  }
}
```

---

## Library Metadata

Configure how your plugin appears in the Plugin Library with the `library` field in your manifest.

### Icon

Provide a custom icon for your plugin. If omitted, a default icon is generated from your plugin name.

```json
{
  "library": {
    "icon": "./assets/icon.svg"
  }
}
```

Or specify multiple formats:

```json
{
  "library": {
    "icon": {
      "svg": "./assets/icon.svg",
      "png": "./assets/icon-512.png"
    }
  }
}
```

| Requirement | Specification |
|-------------|---------------|
| **Preferred format** | SVG (scales to any size) |
| **PNG minimum size** | 512x512 pixels (displays at 48-64px, crisp on retina) |
| **Aspect ratio** | Square (1:1) |
| **Background** | Transparent (UI applies rounding) |
| **File size** | <50KB |
| **Location** | `assets/` folder in your plugin repo |

### Category and Keywords

Help users discover your plugin:

```json
{
  "library": {
    "category": "productivity",
    "keywords": ["automation", "calendar", "scheduling"]
  }
}
```

### Screenshots

Show your plugin in action:

```json
{
  "library": {
    "screenshots": [
      "https://raw.githubusercontent.com/your-org/plugin/main/docs/screenshot-1.png",
      "https://raw.githubusercontent.com/your-org/plugin/main/docs/screenshot-2.png"
    ]
  }
}
```

Screenshots must be full URLs. For GitHub-hosted plugins, use raw.githubusercontent.com URLs.

---

## Available Hooks

### `classifyEmail(ctx: EmailContext)`

Classify incoming emails with labels and confidence scores.

```typescript
async classifyEmail(ctx) {
  // Use pattern matching
  if (ctx.email.from.includes("newsletter")) {
    return { label: "Newsletter", confidence: 0.9 };
  }

  // Or use LLM for complex classification
  const result = await ctx.llm.generateObject({
    prompt: `Classify this email: ${ctx.email.snippet}`,
    schema: z.object({
      label: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  });

  return result.object;
}
```

**Return**: `{ label: string; confidence: number }` or `null`

### `draftReply(ctx: DraftContext)`

Generate draft replies for emails.

```typescript
async draftReply(ctx) {
  const draft = await ctx.llm.generateText({
    system: "You are a professional email assistant.",
    prompt: `Draft a reply to this email:
      Subject: ${ctx.email.subject}
      From: ${ctx.email.from}
      Content: ${ctx.email.body}`,
  });

  return { body: draft, confidence: 0.85 };
}
```

**Return**: `{ body: string; confidence: number }` or `null`

### `onEmailReceived(ctx: EmailContext)`

Emit signals when emails are received for automation purposes.

```typescript
async onEmailReceived(ctx) {
  const signals: EmailSignal[] = [];

  if (ctx.email.subject.includes("[ACTION REQUIRED]")) {
    signals.push({
      type: "action-required",
      strength: 0.95,
      metadata: { deadline: "24h" },
    });
  }

  return signals;
}
```

**Return**: `EmailSignal[]`

### `onTriggeredEmail(ctx: TriggeredEmailContext)`

Handle emails that match registered triggers (plus-tags, patterns).

```typescript
async onInit(ctx) {
  // Register a trigger for emails to user+crm@example.com
  await ctx.registerTrigger({
    plusTag: "crm",
    description: "Sync emails to CRM",
  });
}

async onTriggeredEmail(ctx) {
  if (ctx.matchedValue === "crm") {
    // Sync to your CRM
    await fetch("https://api.mycrm.com/emails", {
      method: "POST",
      body: JSON.stringify(ctx.email),
    });
  }
}
```

### `onScheduledTrigger(ctx: ScheduledTriggerContext)`

Run code on a schedule (cron-based).

```typescript
async onInit(ctx) {
  await ctx.registerSchedule({
    name: "daily-summary",
    cron: "@daily",  // Simplified syntax: @daily, @hourly, @every 5m
    timezone: "America/New_York",
  });
}

async onScheduledTrigger(ctx) {
  if (ctx.scheduleName === "daily-summary") {
    const events = await ctx.calendar.listEvents({
      timeMin: new Date(),
      timeMax: addHours(new Date(), 24),
    });

    // Send summary email
    await ctx.email.send({
      to: [ctx.emailAccount.email],
      subject: "Your Daily Summary",
      body: formatSummary(events),
    });
  }
}
```

**Simplified Cron Syntax**:
- `@every 5m` - Every 5 minutes
- `@every 2h` - Every 2 hours
- `@hourly` - Every hour
- `@daily` - Once per day (midnight)
- `@weekly` - Once per week (Sunday midnight)
- Standard 5-field cron also supported: `"0 7 * * *"`

**Minimum interval**: 1 minute (system enforced)

### `evaluateRule(ctx: RuleContext)`

Implement custom rule evaluation logic.

```typescript
async evaluateRule(ctx) {
  const { ruleData, email } = ctx;

  // Custom rule logic
  if (ruleData.type === "sentiment-check") {
    const sentiment = await analyzeSentiment(email.body);
    return {
      matches: sentiment.score < ruleData.threshold,
      confidence: 0.9,
      suggestedActions: ["flag-for-review"],
    };
  }

  return null;
}
```

### `detectFollowup(ctx: EmailContext)`

Detect emails that need follow-up.

```typescript
async detectFollowup(ctx) {
  const result = await ctx.llm.generateObject({
    prompt: `Does this email require a follow-up response? ${ctx.email.snippet}`,
    schema: z.object({
      needsFollowup: z.boolean(),
      suggestedDate: z.string().optional(),
      priority: z.enum(["low", "medium", "high"]),
      reason: z.string(),
    }),
  });

  return result.object;
}
```

### `onCalendarEvent(ctx: CalendarContext)`

React to calendar events.

```typescript
async onCalendarEvent(ctx) {
  const { event } = ctx;

  // Check for pending RSVPs
  const pendingAttendees = event.attendees?.filter(
    (a) => a.responseStatus === "needsAction" && !a.self
  );

  if (pendingAttendees?.length) {
    // Send reminder
    await ctx.email.send({
      to: pendingAttendees.map((a) => a.email),
      subject: `Reminder: Please RSVP for "${event.summary}"`,
      body: `You haven't responded to this event yet.`,
    });
  }
}
```

### `registerCommands(ctx: InitContext)` (Coming Soon)

Register commands and searchable items in the Cmd-K command palette. Users can discover and execute your plugin's actions or search your plugin's data.

> **Note:** Every installed plugin automatically gets a "Go to [Plugin Name]" command in Cmd-K - no capability required. Use `commands:register` when you want to add *custom* commands or search providers.

```typescript
async registerCommands(ctx) {
  return [
    // Static command - always available
    {
      id: "create-crm-contact",
      title: "Create CRM Contact",
      subtitle: "Add a new contact to your CRM",
      icon: "user-plus",
      keywords: ["add", "new", "contact"],  // Additional search terms
      action: async () => {
        // Open your plugin's create contact UI
        ctx.openPluginPage("/create-contact");
      }
    },

    // Dynamic search provider - returns results based on query
    {
      id: "search-crm",
      title: "Search CRM",
      icon: "search",
      prefix: "crm:",  // Activate with "crm:john" or show in filtered results
      search: async (query: string) => {
        const contacts = await ctx.storage.get<Contact[]>("contacts") ?? [];

        return contacts
          .filter(c =>
            c.name.toLowerCase().includes(query.toLowerCase()) ||
            c.email.toLowerCase().includes(query.toLowerCase())
          )
          .slice(0, 10)
          .map(c => ({
            id: c.id,
            title: c.name,
            subtitle: c.email,
            icon: "user",
            action: async () => {
              window.open(c.crmProfileUrl, "_blank");
            }
          }));
      }
    }
  ];
}
```

**Types:**
```typescript
type CommandRegistration = StaticCommand | SearchProvider;

interface StaticCommand {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;              // Lucide icon name
  keywords?: string[];        // Additional search terms
  action: () => void | Promise<void>;
}

interface SearchProvider {
  id: string;
  title: string;              // Shown when no query (e.g., "Search CRM")
  icon?: string;
  prefix?: string;            // Scope with "prefix:query"
  search: (query: string) => Promise<SearchResult[]>;
}

interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  action: () => void | Promise<void>;
}
```

**Capability Required:** `commands:register` (coming in a future release)

---

## Context APIs

### `ctx.llm` - LLM Access

```typescript
// Generate text with tier selection
const text = await ctx.llm.generateText({
  prompt: "Your prompt here",
  system: "Optional system message",
  tier: "chat",  // optional: "economy" | "chat" | "reasoning"
});

// Generate structured object with reasoning tier for complex analysis
const { object } = await ctx.llm.generateObject({
  prompt: "Classify this email",
  schema: z.object({
    category: z.string(),
    priority: z.number(),
  }),
  tier: "reasoning",  // use reasoning tier for better accuracy
});
```

Select the model tier per API call:
- `"economy"` - Fastest, cheapest model for simple tasks
- `"chat"` - Balanced model for conversational tasks (default)
- `"reasoning"` - Most capable model for complex analysis

### `ctx.storage` - Plugin Storage

```typescript
// Key-value storage (per email account)
await ctx.storage.set("lastProcessed", Date.now());
const lastProcessed = await ctx.storage.get<number>("lastProcessed");
await ctx.storage.delete("lastProcessed");

// User-level settings (shared across accounts)
const userPrefs = await ctx.storage.getUserSettings<UserPrefs>();
await ctx.storage.setUserSettings({ theme: "dark" });

// Account-level settings
const accountConfig = await ctx.storage.getAccountSettings<Config>();
await ctx.storage.setAccountSettings({ enabled: true });
```

### `ctx.calendar` - Calendar Access

Requires `calendar:read` or `calendar:write` permission.

```typescript
// List calendars
const calendars = await ctx.calendar.listCalendars();

// List events
const events = await ctx.calendar.listEvents({
  calendarId: "primary",
  timeMin: new Date(),
  timeMax: addDays(new Date(), 7),
  q: "meeting",  // Optional search
  maxResults: 50,
});

// Get single event
const event = await ctx.calendar.getEvent("eventId");

// Create event (requires calendar:write)
const newEvent = await ctx.calendar.createEvent({
  summary: "Team Meeting",
  start: { dateTime: "2025-01-15T10:00:00Z" },
  end: { dateTime: "2025-01-15T11:00:00Z" },
  attendees: [{ email: "team@example.com" }],
});

// Update event
await ctx.calendar.updateEvent("eventId", {
  summary: "Updated Meeting",
});

// Delete event
await ctx.calendar.deleteEvent("eventId");
```

### `ctx.email` - Email Sending

Requires `email:send` capability (verified trust level).

```typescript
// Send new email
const result = await ctx.email.send({
  to: ["recipient@example.com"],
  cc: ["cc@example.com"],
  subject: "Hello!",
  body: "Email content here",
  bodyType: "html",  // or "text"
});

// Reply to thread
await ctx.email.reply({
  threadId: ctx.email.threadId,
  body: "Thanks for your email!",
});
```

#### Send As (Custom From Address)

Requires `email:send_as` capability in addition to `email:send`.

Plugins can send emails from plus-tag variants of the user's email address. This enables:
- **Reply routing**: Replies automatically route back to the plugin via plus-tag triggers
- **Identity clarity**: Recipients see they're communicating with an assistant
- **Collision detection**: Multiple assistants can use different plus-tags

```typescript
// Send from a plus-tag address
await ctx.email.send({
  to: ["recipient@example.com"],
  subject: "Meeting Request",
  body: "Hello, I'm Jordan's calendar assistant...",
  from: "jordan+finley@company.com",  // must be plus-tag of user's email
  replyTo: "jordan+finley@company.com",  // optional: where replies should go
});

// Reply with custom from address
await ctx.email.reply({
  threadId: ctx.email.threadId,
  body: "I'll schedule that meeting for you.",
  from: "jordan+finley@company.com",
});
```

**Security constraints:**
- `from` address must be a plus-tag variant of the user's registered email
- Format: `{localpart}+{tag}@{domain}` where `{localpart}@{domain}` is the user's email
- **Tag must be lowercase** (e.g., `finley` not `Finley`)
- Tag can only contain letters, numbers, hyphens, and underscores
- Domain comparison is case-insensitive
- Local part must match exactly (case-sensitive)
- **Gmail special handling**: Dots in local part are normalized (`john.doe` = `johndoe`)

**Example plugin.json:**
```json
{
  "capabilities": ["email:send", "email:send_as", "email:trigger"]
}
```

---

## Trust Levels

Plugins are assigned trust levels that determine available capabilities:

| Level | Description | Available Capabilities |
|-------|-------------|----------------------|
| **verified** | Code reviewed by Inbox Zero team | All capabilities |
| **community** | Community reviewed | Classification, drafting, triggers, calendar read |
| **unverified** | No review | Classification only |

To get verified status, submit your plugin for review via the plugin catalog.

---

## Publishing Your Plugin

### Requirements

1. Public GitHub repository
2. At least one GitHub Release (not just a tag)
3. Valid `plugin.json` with all required fields
4. `inbox-zero-plugin` topic on repository
5. README with usage documentation
6. LICENSE file

### Create a Release

```bash
# Tag your version
git tag v1.0.0
git push --tags

# Create a GitHub Release (required - not just a tag)
gh release create v1.0.0 --title "v1.0.0" --notes "Initial release"
```

### Submit to Catalog

1. Fork `inbox-zero/plugin-catalog`
2. Add your plugin to `plugins.json`
3. Submit a pull request
4. Wait for review and approval

---

## Best Practices

### Performance

- Return `null` early if your plugin doesn't apply
- Use `economy` LLM tier for simple tasks
- Cache expensive computations in storage
- Keep scheduled tasks lightweight

### Security

- Never log sensitive email content
- Validate all external API responses
- Use HTTPS for all external requests
- Don't store credentials in plugin code

### User Experience

- Provide clear, actionable labels
- Set realistic confidence scores
- Handle errors gracefully
- Document your plugin's behavior

### Testing

```typescript
// Test your plugin locally
import myPlugin from "./index";

const mockCtx = {
  email: {
    id: "test-123",
    subject: "Test Email",
    from: "sender@example.com",
    snippet: "This is a test email...",
  },
  llm: mockLLM,
  storage: mockStorage,
};

const result = await myPlugin.classifyEmail(mockCtx);
console.log(result);
```

---

## Example Plugins

### Newsletter Detector

```typescript
import { definePlugin } from "@inbox-zero/plugin-sdk";

export default definePlugin({
  async classifyEmail(ctx) {
    const newsletterPatterns = [
      "unsubscribe",
      "view in browser",
      "newsletter",
      "weekly digest",
    ];

    const isNewsletter = newsletterPatterns.some((pattern) =>
      ctx.email.body?.toLowerCase().includes(pattern)
    );

    if (isNewsletter) {
      return { label: "Newsletter", confidence: 0.9 };
    }

    return null;
  },
});
```

### Meeting Prep Reminder

```typescript
import { definePlugin } from "@inbox-zero/plugin-sdk";
import { subHours } from "date-fns";

export default definePlugin({
  async onInit(ctx) {
    await ctx.registerSchedule({
      name: "meeting-prep-check",
      cron: "@every 30m",
    });
  },

  async onScheduledTrigger(ctx) {
    const upcomingEvents = await ctx.calendar.listEvents({
      timeMin: new Date(),
      timeMax: addHours(new Date(), 2),
    });

    for (const event of upcomingEvents) {
      if (event.attendees?.length > 3) {
        // Store that we've seen this meeting
        const seen = await ctx.storage.get<string[]>("notified") ?? [];
        if (!seen.includes(event.id)) {
          await ctx.email.send({
            to: [ctx.emailAccount.email],
            subject: `Prep reminder: ${event.summary} in 2 hours`,
            body: `You have a meeting with ${event.attendees.length} people.`,
          });
          await ctx.storage.set("notified", [...seen, event.id]);
        }
      }
    }
  },
});
```

---

## Troubleshooting

### Plugin Not Loading

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Plugin not in list | Not installed | Run install action or check catalog |
| Plugin disabled | User disabled it | Enable in Settings → Plugins |
| Error on load | Invalid manifest | Check `plugin.json` syntax and required fields |

### Hook Not Firing

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `classifyEmail` never called | Missing capability | Add `email:classify` to `capabilities` |
| Hook called but no effect | Returning `null` | Check your conditional logic |
| Trust level error | Capability restricted | Check trust level requirements |

### Common Errors

**"Plugin capability not declared"**
```
PluginCapabilityError: Plugin attempted to use 'email:send' but capability not declared.
Add 'email:send' to your plugin.json capabilities array.
```
→ Add the missing capability to your manifest and ensure your plugin has the required trust level.

**"Send-as capability not declared"**
```
PluginSendAsCapabilityError: Plugin attempted to use custom "from" address but did not declare "email:send_as" capability.
```
→ Add `"email:send_as"` to your capabilities array to use custom from addresses.

**"Invalid from address"**
```
PluginFromAddressError: From address must include a plus-tag (e.g., user+tag@domain.com)
```
→ The `from` field must be a plus-tag variant of the user's email. Use format: `user+tag@domain.com` where `user@domain.com` is the user's primary email.

**"Plus-tag must be lowercase"**
```
PluginFromAddressError: Plus-tag must be lowercase. Got: Finley, expected: finley
```
→ The plus-tag token must be lowercase. Use `user+finley@domain.com` instead of `user+Finley@domain.com`.

**"Storage limit exceeded"**
```
Error: Storage limit exceeded (max 1MB per plugin)
```
→ Reduce stored data or implement data cleanup. Use `ctx.storage.delete()` to remove old entries.

**"LLM rate limit"**
```
Error: LLM rate limit exceeded for plugin
```
→ Add delays between LLM calls or use `economy` tier for simple tasks.

### Debugging Tips

1. **Check the console** - Plugin errors appear in browser DevTools
2. **Return early** - Add `console.log` statements to trace execution
3. **Test with mock data** - Use the testing pattern shown in Best Practices
4. **Check capabilities** - Ensure manifest capabilities match the hooks you implement

---

## Getting Help

- [Plugin SDK Reference](./plugin-sdk-reference.md)
- [API Documentation](./api-reference.md)
- [GitHub Discussions](https://github.com/inbox-zero/inbox-zero/discussions)
- [Discord Community](https://discord.gg/inbox-zero)

---

## Changelog

- **v0.14.0** - Initial plugin system release
