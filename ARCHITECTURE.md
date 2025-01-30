# Inbox Zero Architecture

The initial version of this document was created by Google Gemini 2.0 Flash Thinking Experimental 01-21.

The Inbox Zero repository is structured as a monorepo, consisting of two main applications (`apps/web`, `apps/unsubscriber`) and several packages (`packages/*`). Only the `apps/web` is currently in use in production.

```txt
├── apps/
│ ├── unsubscriber/ // Unsubscribe Automation Service (Fastify, Playwright)
│ └── web/ // Main Next.js Web Application (Frontend and Backend)
├── packages/ // Reusable libraries and configurations
│ ├── eslint-config/
│ ├── loops/
│ ├── resend/
│ ├── tinybird/
│ ├── tinybird-ai-analytics/
│ └── tsconfig/
├── prisma/ // Database schema and migrations
├── sanity/ // Sanity CMS configuration
├── store/ // Jotai-based state management and queues
├── utils/ // Utility functions, server actions, and AI logic
├── docker/ // Docker configurations
└── ... // Other configuration and documentation files
```

### 1. `apps/web` - Main Web Application

- **Framework:** Next.js (App Router)
- **Purpose:** The primary user-facing application. Handles frontend rendering, user authentication, API routes for backend logic, and integration with external services.
- **Key Directories:**
  - `app/`: Next.js App Router structure, containing frontend components, pages, layouts, and API routes.
  - `components/`: React components, including UI elements and feature-specific components.
  - `utils/actions/`: Next.js Server Actions for data mutations and backend logic.
  - `styles/`: Global CSS and styling configurations (Tailwind CSS).
  - `providers/`: React Context providers for state management and service integration.
  - `store/`: Jotai atoms for application-wide state management and queue handling.
  - `sanity/`: Integration with Sanity CMS for blog and content management.
- **Key Functionalities:**
  - User interface for all features (AI assistant, unsubscriber, analytics, settings).
  - User authentication and session management (NextAuth.js).
  - API endpoints for interacting with Gmail API, AI models, and other services.
  - Server-side rendering and data fetching.
  - Integration with payment processing (Lemon Squeezy) and analytics (Tinybird, PostHog).

### 2. `apps/unsubscriber` - Unsubscribe Automation Service

- **Framework:** Fastify (Node.js), Playwright
- **Purpose:** A separate, lightweight service dedicated to handling automated unsubscription from emails. This service uses Playwright for browser automation and AI for analyzing unsubscribe pages.
- **Key Files:**
  - `src/server.ts`: Fastify server setup and API endpoint definition.
  - `src/main.ts`: Core logic for analyzing unsubscribe pages and performing actions using Playwright and AI.
  - `src/llm.ts`: Integration with different LLM providers (Google AI, OpenAI, Anthropic, Bedrock).
- **Key Functionalities:**
  - Exposes a REST API (`/unsubscribe` endpoint) to trigger the unsubscribe process.
  - Utilizes Playwright to automate browser interactions for unsubscribing.
  - Employs AI (Google Gemini by default) to analyze unsubscribe pages and determine the necessary actions.
  - Handles fallback strategies for unsubscribing when AI analysis is insufficient.

### 3. `packages` - Reusable Packages

- **Purpose:** Contains reusable libraries, configurations, and utilities shared between the `web` and `unsubscriber` apps.
- **Key Packages:**
  - `eslint-config`: ESLint configurations for consistent code linting.
  - `loops`: Related to marketing email automation.
  - `resend`: Integration with Resend for transactional email sending.
  - `tinybird`: Integration with Tinybird for real-time analytics.
  - `tinybird-ai-analytics`: Integration with Tinybird for AI usage analytics.
  - `tsconfig`: Shared TypeScript configurations.

### 4. `prisma` - Database Layer

- **Purpose:** Manages the PostgreSQL database schema and migrations.
- **Key Files:**
  - `schema.prisma`: Defines the database schema using Prisma Schema Language.
  - `migrations/`: Contains database migration files for schema updates.

### 5. `sanity` - Content Management System

- **Purpose:** Integrates Sanity.io as a headless CMS for managing blog posts and potentially other content.
- **Key Files:**
  - `sanity.config.ts`: Sanity Studio configuration.
  - `schemaTypes/`: Defines the schema types for Sanity content.
  - `lib/`: Contains utility functions for interacting with the Sanity API.

### 6. `store` - State Management and Queues

- **Purpose:** Implements client-side state management using Jotai and defines queues for background task processing.
- **Key Files:**
  - `index.ts`: Jotai store initialization.
  - `ai-queue.ts`: Queue for AI-related tasks.
  - `archive-queue.ts`: Queue for email archiving tasks.
  - `archive-sender-queue.ts`: Queue for bulk sender archiving.
  - `ai-categorize-sender-queue.ts`: Queue for AI-based sender categorization.

### 7. `utils` - Utilities and Core Logic

- **Purpose:** Houses utility functions, shared logic, and server actions.
- **Key Directories:**
  - `actions/`: Next.js Server Actions for various features (admin, ai-rule, api-key, auth, categorize, cold-email, group, mail, premium, rule, unsubscriber, user, webhook, whitelist).
  - `ai/`: AI-related logic, including rule choosing, argument generation, prompt engineering, and integration with LLM providers.
  - `gmail/`: Gmail API client and utility functions for interacting with Gmail (mail, threads, labels, filters, etc.).
  - `queue/`: Queue management utilities.
  - `redis/`: Redis integration and utilities for caching and data storage.
  - `rule/`: Rule-related utilities (prompt file parsing, rule fixing, etc.).
  - `scripts/`: Scripts for database migrations, data manipulation, and other maintenance tasks.

### 8. `docker` - Docker Configuration

- **Purpose:** Contains Dockerfile for containerizing the web application.
- **Key Files:**
  - `Dockerfile.web`: Dockerfile for building the Next.js web application image.
  - `docker-compose.yml`: Docker Compose file for setting up local development environment with PostgreSQL, Redis, and the web application.

## API Endpoints

The application exposes the following API endpoints under `apps/web/app/api/`:

- `/api/ai/*`: AI-related endpoints (categorization, summarization, autocomplete, models).
- `/api/auth/*`: Authentication endpoints (NextAuth.js).
- `/api/google/*`: Gmail API proxy endpoints (messages, threads, labels, drafts, contacts, webhook, watch).
- `/api/lemon-squeezy/*`: Lemon Squeezy webhook and API integration endpoints.
- `/api/resend/*`: Resend API integration endpoints (email sending, summary emails, all emails).
- `/api/user/*`: User-specific data and actions endpoints (planned rules, history, settings, categories, groups, cold emails, bulk archive, usage, me).
- `/api/v1/*`: Versioned API endpoints, for external integrations (group emails, OpenAPI documentation).

## Key Data Flows

1.  **Email Processing and AI Automation:**

    - Gmail webhook receives email notifications.
    - Webhook handler (`/api/google/webhook`) fetches email details from Gmail API.
    - Email data is passed to AI rule engine (`utils/ai/choose-rule`) to find matching rules.
    - Matching rules are executed, potentially involving AI-generated actions (`utils/ai/actions`).
    - Actions (archive, label, reply, etc.) are performed via Gmail API.
    - Executed rules and actions are stored in the database (Prisma).

2.  **Bulk Unsubscriber:**

    - User initiates bulk unsubscribe process from the web UI (`apps/web/app/(app)/bulk-unsubscribe`).
    - Frontend fetches list of newsletters and senders from Tinybird analytics data (`packages/tinybird`).
    - User selects newsletters to unsubscribe from.
    - Backend service (`apps/unsubscriber`) uses Playwright to automate unsubscribe process.
    - Unsubscribe status is updated in the database.

3.  **Email Analytics:**
    - Tinybird data sources and pipes (`packages/tinybird`) collect email activity data.
    - Web UI (`apps/web/app/(app)/stats`) fetches analytics data from Tinybird API and displays charts and summaries.

## Environment Variables

The project extensively uses environment variables for configuration. These variables configure:

- API keys for OpenAI, Google AI, Anthropic, Bedrock, Groq, Ollama, Tinybird, Lemon Squeezy, Resend, PostHog, Axiom, Crisp.
- OAuth client IDs and secrets for Google authentication.
- Database connection URLs (PostgreSQL, Upstash Redis).
- Google Cloud Pub/Sub topic name and verification token.
- Sentry DSN for error tracking.
- Feature flags (PostHog).
- License keys and payment links (Lemon Squeezy).
- Admin email addresses.
- Webhook URLs and API keys for internal communication.

## Conclusion

Inbox Zero exhibits a well-structured and modular architecture, leveraging a monorepo approach and modern technologies like Next.js, Prisma, and serverless functions. The architecture is designed for scalability, maintainability, and extensibility, with clear separation of concerns between the frontend, backend, and supporting services. The use of queues and background processing ensures efficient handling of asynchronous tasks like AI processing and email actions. The extensive use of environment variables promotes configuration flexibility and security. This architecture is well-suited for a complex SaaS application like Inbox Zero, providing a solid foundation for future development and feature enhancements.
