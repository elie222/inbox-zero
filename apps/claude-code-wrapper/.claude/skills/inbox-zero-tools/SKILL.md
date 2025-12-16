---
name: inbox-zero-tools
description: Manage email rules, learned patterns, about info, and knowledge base for Inbox Zero. Use when the user asks to create rules, update rule conditions or actions, add patterns to rules, update their profile/about info, or add content to the knowledge base.
allowed-tools: Bash, Read
---

# Inbox Zero Tool Invocation

This skill provides access to email and rule management tools via the Inbox Zero LLM Tool Proxy API.

## When to Use This Skill

Use this skill when the user asks to:
- Create, update, or view email rules
- Add or modify learned patterns for a rule
- Update their about/profile information
- Add content to the knowledge base
- View their current rules and settings

## Environment Variables

These environment variables must be set for tool invocation to work:

- `INBOX_ZERO_API_URL` - Base URL of the Inbox Zero web app (e.g., `http://web:3000`)
- `LLM_TOOL_PROXY_TOKEN` - Authentication token for the proxy endpoint
- `INBOX_ZERO_USER_EMAIL` - The user's email address to identify the account

## API Endpoint

All tools are invoked via a single endpoint:

```
POST ${INBOX_ZERO_API_URL}/api/llm-tools/invoke
```

### Request Format

```json
{
  "tool": "<tool_name>",
  "input": { <tool_specific_input> },
  "userEmail": "<INBOX_ZERO_USER_EMAIL>"
}
```

### Headers

```
Authorization: Bearer <LLM_TOOL_PROXY_TOKEN>
Content-Type: application/json
```

### Response Format

**Success:**
```json
{
  "success": true,
  "result": { <tool_specific_result> }
}
```

**Error:**
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

---

## Available Tools

### 1. getUserRulesAndSettings

Retrieves all existing rules and user settings (about information).

**Input:** None required

**Example:**
```bash
curl -s -X POST "$INBOX_ZERO_API_URL/api/llm-tools/invoke" \
  -H "Authorization: Bearer $LLM_TOOL_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "getUserRulesAndSettings",
    "input": {},
    "userEmail": "'"$INBOX_ZERO_USER_EMAIL"'"
  }'
```

**Response:**
```json
{
  "success": true,
  "result": {
    "about": "User's about information",
    "rules": [
      {
        "name": "Newsletters",
        "conditions": {
          "aiInstructions": "Newsletter emails",
          "static": { "from": "@newsletter.com" },
          "conditionalOperator": "OR"
        },
        "actions": [
          { "type": "ARCHIVE", "fields": {} },
          { "type": "LABEL", "fields": { "label": "Newsletter" } }
        ],
        "enabled": true,
        "runOnThreads": true
      }
    ]
  }
}
```

---

### 2. getLearnedPatterns

Retrieves learned patterns for a specific rule.

**Input:**
- `ruleName` (string, required): The exact name of the rule

**Example:**
```bash
curl -s -X POST "$INBOX_ZERO_API_URL/api/llm-tools/invoke" \
  -H "Authorization: Bearer $LLM_TOOL_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "getLearnedPatterns",
    "input": { "ruleName": "Newsletters" },
    "userEmail": "'"$INBOX_ZERO_USER_EMAIL"'"
  }'
```

**Response:**
```json
{
  "success": true,
  "result": {
    "patterns": [
      { "type": "FROM", "value": "news@company.com", "exclude": false },
      { "type": "SUBJECT", "value": "Weekly Update", "exclude": false }
    ]
  }
}
```

---

### 3. createRule

Creates a new email rule with conditions and actions.

**Input:**
- `name` (string, required): Short, concise rule name (e.g., "Newsletters", "Urgent")
- `condition` (object, required):
  - `aiInstructions` (string, optional): AI condition for matching emails
  - `static` (object, optional): Static conditions
    - `from` (string): Email pattern (e.g., "@company.com")
    - `to` (string): Recipient pattern
    - `subject` (string): Subject pattern
  - `conditionalOperator` ("AND" | "OR", optional): Logic for combining conditions
- `actions` (array, required): List of actions to perform
  - `type`: One of ARCHIVE, LABEL, DRAFT_EMAIL, FORWARD, REPLY, SEND_EMAIL, MARK_READ, MARK_SPAM, CALL_WEBHOOK, DIGEST
  - `fields`: Type-specific fields (label, content, to, cc, bcc, subject, webhookUrl)

**Example:**
```bash
curl -s -X POST "$INBOX_ZERO_API_URL/api/llm-tools/invoke" \
  -H "Authorization: Bearer $LLM_TOOL_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "createRule",
    "input": {
      "name": "Marketing",
      "condition": {
        "aiInstructions": "Marketing and promotional emails"
      },
      "actions": [
        { "type": "ARCHIVE", "fields": {} },
        { "type": "LABEL", "fields": { "label": "Marketing" } }
      ]
    },
    "userEmail": "'"$INBOX_ZERO_USER_EMAIL"'"
  }'
```

**Response:**
```json
{
  "success": true,
  "result": { "success": true, "ruleId": "rule_abc123" }
}
```

---

### 4. updateRuleConditions

Updates the conditions of an existing rule.

**Input:**
- `ruleName` (string, required): The exact name of the rule to update
- `condition` (object, required): New conditions (same structure as createRule)

**Example:**
```bash
curl -s -X POST "$INBOX_ZERO_API_URL/api/llm-tools/invoke" \
  -H "Authorization: Bearer $LLM_TOOL_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "updateRuleConditions",
    "input": {
      "ruleName": "Marketing",
      "condition": {
        "aiInstructions": "Marketing, promotional, and sales emails",
        "conditionalOperator": "OR"
      }
    },
    "userEmail": "'"$INBOX_ZERO_USER_EMAIL"'"
  }'
```

**Response:**
```json
{
  "success": true,
  "result": {
    "success": true,
    "ruleId": "rule_abc123",
    "originalConditions": { "aiInstructions": "Marketing and promotional emails" },
    "updatedConditions": { "aiInstructions": "Marketing, promotional, and sales emails" }
  }
}
```

---

### 5. updateRuleActions

Updates the actions of an existing rule. This replaces all existing actions.

**Input:**
- `ruleName` (string, required): The exact name of the rule
- `actions` (array, required): New list of actions

**Example:**
```bash
curl -s -X POST "$INBOX_ZERO_API_URL/api/llm-tools/invoke" \
  -H "Authorization: Bearer $LLM_TOOL_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "updateRuleActions",
    "input": {
      "ruleName": "Marketing",
      "actions": [
        { "type": "ARCHIVE", "fields": {} },
        { "type": "LABEL", "fields": { "label": "Marketing" } },
        { "type": "MARK_READ", "fields": {} }
      ]
    },
    "userEmail": "'"$INBOX_ZERO_USER_EMAIL"'"
  }'
```

---

### 6. updateLearnedPatterns

Updates learned patterns for a rule. Patterns override conditional logic.

**Input:**
- `ruleName` (string, required): The rule name
- `learnedPatterns` (array, required): Patterns to add
  - `include` (object, optional): Patterns to match
    - `from` (string): Email address or domain
    - `subject` (string): Subject pattern
  - `exclude` (object, optional): Patterns to exclude
    - `from` (string): Email address or domain to exclude
    - `subject` (string): Subject pattern to exclude

**Example:**
```bash
curl -s -X POST "$INBOX_ZERO_API_URL/api/llm-tools/invoke" \
  -H "Authorization: Bearer $LLM_TOOL_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "updateLearnedPatterns",
    "input": {
      "ruleName": "To Reply",
      "learnedPatterns": [
        { "exclude": { "from": "@github.com" } },
        { "include": { "from": "boss@company.com" } }
      ]
    },
    "userEmail": "'"$INBOX_ZERO_USER_EMAIL"'"
  }'
```

---

### 7. updateAbout

Updates the user's about information. This replaces existing content.

**Input:**
- `about` (string, required): New about information

**Example:**
```bash
curl -s -X POST "$INBOX_ZERO_API_URL/api/llm-tools/invoke" \
  -H "Authorization: Bearer $LLM_TOOL_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "updateAbout",
    "input": {
      "about": "I am a software engineer. My calendar link is https://cal.com/me. Write concise, professional replies."
    },
    "userEmail": "'"$INBOX_ZERO_USER_EMAIL"'"
  }'
```

---

### 8. addToKnowledgeBase

Adds content to the knowledge base for reply drafting.

**Input:**
- `title` (string, required): Title for the knowledge entry
- `content` (string, required): Content to store

**Example:**
```bash
curl -s -X POST "$INBOX_ZERO_API_URL/api/llm-tools/invoke" \
  -H "Authorization: Bearer $LLM_TOOL_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "addToKnowledgeBase",
    "input": {
      "title": "Company Pricing",
      "content": "Our pricing starts at $99/month for the Basic plan, $199/month for Pro, and custom pricing for Enterprise."
    },
    "userEmail": "'"$INBOX_ZERO_USER_EMAIL"'"
  }'
```

---

## Best Practices

1. **Always list rules first** before making updates to ensure you have the correct rule names
2. **Use short, concise rule names** (e.g., "Marketing", "Urgent", "Team")
3. **Prefer AI instructions** over static conditions when possible
4. **Use `exclude` patterns** when a rule is incorrectly matching emails
5. **Check for duplicate rules** before creating new ones
6. **Read about info first** before updating to avoid losing existing content

## Error Handling

Common error codes:
- `UNAUTHORIZED` - Invalid or missing token
- `VALIDATION_ERROR` - Invalid request body or input
- `EMAIL_NOT_FOUND` - Email address not found in the system
- `EXECUTION_ERROR` - Tool execution failed

Always check the `success` field in responses and handle errors appropriately.
