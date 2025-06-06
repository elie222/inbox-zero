import { RulesEditor, type RuleMetadata } from "@/components/rules-editor";

// Mock function to simulate AI metadata generation
async function generateRuleMetadata(ruleContent: string): Promise<RuleMetadata> {
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Generate mock metadata based on rule content
  const ruleName = ruleContent.split(' ').slice(0, 5).join(' ') + '...';
  
  const actions: RuleMetadata['actions'] = [];
  const lowerContent = ruleContent.toLowerCase();
  
  if (lowerContent.includes('archive')) {
    actions.push({ type: 'ARCHIVE' });
  }
  if (lowerContent.includes('label')) {
    actions.push({ type: 'LABEL', label: 'Important' });
  }
  if (lowerContent.includes('reply') || lowerContent.includes('respond')) {
    actions.push({ 
      type: 'DRAFT_EMAIL', 
      content: 'Thank you for your email. I will get back to you soon.' 
    });
  }
  if (lowerContent.includes('forward')) {
    actions.push({ type: 'FORWARD', to: 'team@example.com' });
  }
  
  // Default action if none found
  if (actions.length === 0) {
    actions.push({ type: 'LABEL', label: 'Processed' });
  }
  
  return {
    ruleName,
    actions,
  };
}

export default function RulesEditorPage() {
  const handleSave = async (title: string, content: any) => {
    console.log('Saving document:', { title, content });
    // Here you would save to your backend
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('Document saved successfully!');
  };

  const initialContent = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Welcome to the Rules Editor! This is a document-style editor for creating email automation rules.',
          },
        ],
      },
      {
        type: 'context',
        content: [
          {
            type: 'text',
            text: 'I receive a lot of newsletters and promotional emails that I want to automatically archive.',
          },
        ],
      },
      {
        type: 'rule',
        attrs: {
          content: '',
          metadata: null,
          expanded: false,
        },
        content: [
          {
            type: 'text',
            text: 'Archive all emails from marketing domains and label them as "Newsletters"',
          },
        ],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'You can add more rules and context using the toolbar buttons or by typing /rule or /context.',
          },
        ],
      },
    ],
  };

  return (
    <div className="h-screen flex flex-col">
      <RulesEditor
        initialTitle="Email Automation Rules"
        initialContent={initialContent}
        onSave={handleSave}
        onGenerateMetadata={generateRuleMetadata}
      />
    </div>
  );
}