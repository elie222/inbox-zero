# TipTap Rules Editor

A document-style rules editor built with TipTap that allows users to write rules and context in a natural document format. Rules are explicit node types with AI-generated metadata.

## Features

- **Custom Nodes**: Two custom TipTap nodes - RuleNode and ContextNode
- **Slash Commands**: Quick insertion with `/rule` and `/context`
- **Visual Design**: Rules have green accent, Context has blue accent
- **AI Integration**: Automatically generates rule metadata on save
- **Expand/Collapse**: View and edit rule metadata in an expandable interface
- **Toolbar**: Quick access buttons for inserting nodes
- **Responsive**: Works well on desktop and mobile

## Installation

First, install the required dependencies:

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/suggestion tippy.js
```

## Usage

```tsx
import { RulesEditor } from "@/components/rules-editor/RulesEditor";
import type { RuleMetadata } from "@/components/rules-editor/nodes/RuleNode";

// Implement your AI metadata generation
async function generateRuleMetadata(content: string): Promise<RuleMetadata> {
  // Call your AI API here
  const response = await fetch("/api/ai/generate-rule", {
    method: "POST",
    body: JSON.stringify({ content }),
  });
  return response.json();
}

// Implement your save handler
async function handleSave(title: string, content: any): Promise<void> {
  await fetch("/api/rules/save", {
    method: "POST",
    body: JSON.stringify({ title, content }),
  });
}

// Use the editor
export function MyRulesPage() {
  return (
    <RulesEditor
      initialTitle="My Email Rules"
      onSave={handleSave}
      generateRuleMetadata={generateRuleMetadata}
    />
  );
}
```

## Components Structure

```
rules-editor/
├── RulesEditor.tsx           # Main editor component
├── nodes/
│   ├── RuleNode.tsx         # Rule node definition
│   └── ContextNode.tsx      # Context node definition
├── components/
│   ├── RuleNodeView.tsx     # Rule node UI component
│   ├── ContextNodeView.tsx  # Context node UI component
│   └── SlashCommandList.tsx # Slash command menu
├── extensions/
│   └── SlashCommands.tsx    # Slash command extension
└── example-usage.tsx        # Example implementation
```

## Node Types

### RuleNode

- **Visual**: Green border/background with lightning bolt icon
- **Content**: Rule text describing when to apply the rule
- **Metadata**:
  - `name`: Rule name (AI generated or user edited)
  - `actions`: Array of actions to perform
- **Features**:
  - Expandable metadata view
  - Edit rule name and actions
  - Add/remove actions
  - Delete rule

### ContextNode

- **Visual**: Blue border/background with book icon
- **Content**: Context information about the user or system
- **Features**:
  - Simple text content
  - Delete context

## Action Types

The editor supports all standard email action types:

- `ARCHIVE`: Archive the email
- `LABEL`: Apply a label
- `DRAFT_EMAIL`: Create a draft reply
- `REPLY`: Send a reply
- `SEND_EMAIL`: Send a new email
- `FORWARD`: Forward the email
- `MARK_READ`: Mark as read
- `MARK_SPAM`: Mark as spam
- `CALL_WEBHOOK`: Call a webhook URL

## Save Flow

1. User clicks "Save & Process"
2. Editor scans all RuleNodes
3. For nodes without metadata:
   - Extracts text content
   - Calls `generateRuleMetadata()`
   - Updates node with generated metadata
4. Saves complete document with all metadata
5. Shows processing status

## Keyboard Shortcuts

- `/` - Open slash command menu
- `Mod+Alt+R` - Insert rule
- `Mod+Alt+C` - Insert context
- Arrow keys - Navigate slash menu
- Enter - Select slash command
- Escape - Close slash menu

## Customization

### Styling

The editor uses Tailwind CSS classes. Key classes:

- Rule nodes: `border-green-200 bg-green-50`
- Context nodes: `border-blue-200 bg-blue-50`
- Editor prose: `prose prose-sm`

### AI Integration

Implement the `generateRuleMetadata` function to connect to your AI service:

```tsx
async function generateRuleMetadata(content: string): Promise<RuleMetadata> {
  // Your AI logic here
  const result = await aiCreateRule(content, emailAccount);
  return {
    name: result.name,
    actions: result.actions,
  };
}
```

## Document Structure

The editor saves documents as JSON:

```json
{
  "type": "doc",
  "content": [
    {
      "type": "rule",
      "attrs": {
        "id": "rule-123",
        "content": "When I receive newsletters",
        "metadata": {
          "name": "Handle Newsletters",
          "actions": [
            { "type": "ARCHIVE" },
            { "type": "LABEL", "label": "Newsletters" }
          ]
        }
      },
      "content": [{ "type": "text", "text": "When I receive newsletters" }]
    },
    {
      "type": "context",
      "attrs": {
        "id": "context-456",
        "content": "I prefer concise responses"
      },
      "content": [{ "type": "text", "text": "I prefer concise responses" }]
    }
  ]
}
```

## Best Practices

1. **Rule Writing**: Write rules in natural language describing when they should trigger
2. **Context**: Add context about preferences, writing style, or business information
3. **Metadata Editing**: Review and customize AI-generated metadata before final save
4. **Organization**: Group related rules together in the document

## Responsive Design

The editor adapts for mobile:

- Toolbar remains accessible
- Expand/collapse works with touch
- Consider using drawers for metadata editing on small screens
