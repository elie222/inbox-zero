# LLM Connections in the Codebase

This document outlines the parts of the code that connect to Large Language Models (LLMs) in the `inbox-zero` repository.

## 1. Web Application (`apps/web`)

The web application uses a centralized wrapper around the Vercel AI SDK to manage LLM interactions, logging, and error handling.

### Core Abstractions

*   **`apps/web/utils/llms/index.ts`**: This is the primary entry point. It exports `createGenerateText` and `createGenerateObject` functions. These functions wrap the Vercel AI SDK's `generateText` and `generateObject` to add:
    *   Logging (via `createScopedLogger`)
    *   Usage tracking (`saveAiUsage`)
    *   Error handling and retry logic (`withLLMRetry`, `withNetworkRetry`)
    *   Automatic model selection via `modelOptions`

*   **`apps/web/utils/llms/model.ts`**: This file is responsible for instantiating the LLM provider clients based on configuration. It supports:
    *   OpenAI (`createOpenAI`)
    *   Anthropic (`createAnthropic`)
    *   Google Gemini (`createGoogleGenerativeAI`)
    *   Amazon Bedrock (`createAmazonBedrock`)
    *   Groq (`createGroq`)
    *   OpenRouter (`createOpenRouter`)
    *   AI Gateway (`createGateway`)
    *   Ollama (`createOllama`)

    It defines the `getModel` function which returns the selected model instance.

### Usage

The `createGenerateText` and `createGenerateObject` functions are widely used in `apps/web/utils/ai/` for various features:

*   **`apps/web/utils/ai/categorize-sender/`**: Categorizing email senders.
*   **`apps/web/utils/ai/reply/`**: Drafting replies, checking if a reply is needed.
*   **`apps/web/utils/ai/summarise/`** & **`apps/web/utils/ai/digest/`**: Summarizing emails.
*   **`apps/web/utils/ai/clean/`**: Cleaning up emails/subscriptions.
*   **`apps/web/utils/ai/rule/`**: Generating and managing rules from natural language prompts.
*   **`apps/web/utils/ai/calendar/`**: Checking availability.
*   **`apps/web/utils/ai/meeting-briefs/`**: Generating meeting briefs.

### Direct Client Usage

*   **`apps/web/app/api/ai/models/route.ts`**: This API route directly imports and uses the `openai` npm package (`import OpenAI from "openai"`) to list available models for the user's API key. This bypasses the Vercel AI SDK wrapper used elsewhere.

## 2. Unsubscriber Service (`apps/unsubscriber`)

The unsubscriber service has its own lighter-weight LLM integration.

*   **`apps/unsubscriber/src/llm.ts`**: Similar to the web app's `model.ts`, this file initializes LLM providers (Google, OpenAI, Anthropic, Bedrock) and exports a `getModel` function.
*   **`apps/unsubscriber/src/main.ts`**: This file imports `generateText` directly from the `ai` package (Vercel AI SDK) and uses the model returned by `getModel` to analyze unsubscribe pages.

## Summary of Key Files

| File Path | Purpose |
| :--- | :--- |
| `apps/web/utils/llms/index.ts` | Main wrapper for LLM calls (logging, retries, usage). |
| `apps/web/utils/llms/model.ts` | Model instantiation and provider selection. |
| `apps/web/utils/ai/*` | Feature-specific logic using the LLM wrappers. |
| `apps/web/app/api/ai/models/route.ts` | Direct OpenAI client usage for listing models. |
| `apps/unsubscriber/src/llm.ts` | Model instantiation for the unsubscriber service. |
| `apps/unsubscriber/src/main.ts` | Direct `generateText` usage for page analysis. |
