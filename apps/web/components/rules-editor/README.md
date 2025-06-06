# TipTap Rules Editor

A document-style rules editor built with TipTap that allows users to create rules and context blocks with AI-powered metadata generation.

## Features

- **Custom Nodes**: Two custom TipTap nodes - RuleNode and ContextNode
- **Visual Design**: 
  - RuleNode: Green accent with lightning bolt icon
  - ContextNode: Blue accent with book icon
- **Slash Commands**: Type `/rule` or `/context` to quickly insert nodes
- **AI Metadata Generation**: Automatically generates rule names and actions on save
- **Expand/Collapse**: View and edit rule metadata in an expandable interface
- **User Control**: Once metadata is generated, users can freely edit it

## Usage

```tsx
import { RulesEditor, type RuleMetadata } from "@/components/rules-editor";

function MyComponent() {
  const handleSave = async (title: string, content: any) => {
    // Save the document to your backend
    await saveDocument({ title, content });
  };

  const generateMetadata = async (ruleContent: string): Promise<RuleMetadata> => {
    // Call your AI service to generate metadata
    const response = await callAI(ruleContent);
    return {
      ruleName: response.name,
      actions: response.actions,
    };
  };

  return (
    <RulesEditor
      initialTitle="My Rules Document"
      initialContent={existingContent}
      onSave={handleSave}
      onGenerateMetadata={generateMetadata}
    />
  );
}
```

## Node Structure

### RuleNode
- **Attributes**:
  - `content`: The rule text content
  - `metadata`: AI-generated metadata (rule name and actions)
  - `expanded`: Whether the metadata view is expanded
- **Metadata Structure**:
  ```typescript
  interface RuleMetadata {
    ruleName: string;
    actions: Array<{
      type: string;
      label?: string;
      subject?: string;
      content?: string;
      to?: string;
      cc?: string;
      bcc?: string;
      url?: string;
    }>;
  }
  ```

### ContextNode
- **Attributes**:
  - `content`: The context text content

## Keyboard Shortcuts

- **Enter**: Exit the current node and create a new paragraph
- **/rule**: Insert a new rule node
- **/context**: Insert a new context node

## Styling

The component uses Tailwind CSS classes and integrates with your existing UI components from `@/components/ui/`.

## Save Logic

When the user clicks "Save & Process":
1. The editor scans all RuleNodes
2. For nodes without metadata, it calls `onGenerateMetadata`
3. The generated metadata is stored in the node attributes
4. The complete document is passed to `onSave`
5. Subsequent saves preserve user edits to the metadata