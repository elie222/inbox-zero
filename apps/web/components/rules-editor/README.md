# TipTap Rules Editor

A document-style rules editor built with TipTap that allows users to write rules and context in a natural document format. Rules and context are explicit node types with visual styling and metadata management.

## Features

### Custom Nodes
- **RuleNode**: Green-styled blocks for rules with AI-generated metadata
- **ContextNode**: Blue-styled blocks for context information

### Metadata Management
- AI generates rule names and actions on first save
- Metadata is preserved after generation
- Users can manually edit metadata through expandable UI

### User Interface
- Slash commands (`/rule`, `/context`) for quick insertion
- Toolbar buttons for inserting nodes
- Hover states with expand/delete buttons
- Expandable metadata view for rules
- Visual indicators (icons, colors) for different node types

### Save Process
- Processes new rules without metadata
- Generates metadata using AI
- Shows processing status
- Preserves user customizations

## Usage

```tsx
import { RulesEditor } from "@/components/rules-editor";

function MyPage() {
  const handleSave = async (title: string, content: any) => {
    // Save to your backend
  };

  const generateMetadata = async (ruleContent: string) => {
    // Call your AI service to generate metadata
    return {
      ruleName: "Generated rule name",
      actions: [
        { type: "LABEL", label: "Important" }
      ]
    };
  };

  return (
    <RulesEditor
      initialTitle="My Rules"
      initialContent={null}
      onSave={handleSave}
      generateRuleMetadata={generateMetadata}
    />
  );
}
```

## Components

### RuleNode
- Stores rule content and metadata
- Green accent styling with lightning icon
- Expandable metadata section
- Editable rule name and actions

### ContextNode
- Stores context information
- Blue accent styling with book icon
- Simple text content

### RulesEditor
- Main editor component
- Document title editing
- Save & Process functionality
- Toolbar with node insertion buttons
- Processing status indicator

## Demo

Visit `/[emailAccountId]/assistant/rules-editor` to see a working demo with mock AI metadata generation.