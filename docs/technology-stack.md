# Technology Stack & Vendor Overview

This document provides a comprehensive overview of all software vendors and services used to power the Inbox Zero application.

## Core Infrastructure

### **Vercel**
*Next.js hosting and deployment platform*
- Hosts the main Next.js web application with automatic deployments
- Provides global CDN, serverless functions, and edge computing
- Handles build optimization with Turbo integration and memory management

### **Supabase**
*PostgreSQL database and backend services*
- **User Management**: User profiles, authentication, onboarding data, survey responses, referral system
- **Email Accounts**: Email account configurations, OAuth tokens, provider settings, sync status
- **Rules & Automation**: AI rules, executed rules, scheduled actions, action history
- **Email Data**: Labels, categories, groups, newsletters, cold emails, thread trackers
- **Premium & Billing**: Subscription data, payment records, premium tiers, usage credits
- **Organizations**: Multi-user organizations, member management, SSO providers
- **AI Integration**: MCP connections, chat messages, digests, knowledge base
- **System Data**: API keys, cleanup jobs, email tokens, calendar connections

## Cloud Services & APIs

### **Google Cloud Platform (GCP)**
*Cloud infrastructure and APIs*
- **Gmail API**: Core email integration for reading, sending, and managing emails
- **Google Calendar API**: Calendar integration for scheduling and availability
- **Google People API**: Contact management and user profile data
- **Google Pub/Sub**: Real-time email notifications and webhook processing
- **Google AI/Gemini**: AI model provider for email processing and automation

### **Microsoft Graph API**
*Microsoft 365 integration*
- **Outlook API**: Email integration for Microsoft/Outlook accounts
- **Calendar API**: Microsoft Calendar integration
- **Webhook support**: Real-time notifications for Outlook email changes

## AI & Machine Learning

### **Anthropic**
*AI model provider*
- Claude models for email categorization, summarization, and automation
- Primary AI provider for intelligent email processing and rule generation

### **OpenAI**
*AI model provider*
- GPT models for email analysis, content generation, and automation
- Alternative AI provider with different model capabilities

### **OpenRouter**
*AI model aggregation service*
- Provides access to multiple AI models from various providers
- Cost-effective alternative for AI processing with model switching capabilities

### **Groq**
*High-performance AI inference*
- Fast AI model inference for real-time email processing
- Optimized for speed and efficiency in AI operations

### **Amazon Bedrock**
*AWS AI service*
- Managed AI service for enterprise-grade AI model access
- Provides Claude and other models through AWS infrastructure

### **Ollama**
*Local AI model hosting*
- Self-hosted AI models for development and testing
- Enables local AI processing without external API dependencies

## Analytics & Monitoring

### **Tinybird**
*Real-time analytics platform*
- **Email Analytics**: Stores email metadata (sender, recipient, subject, timestamps, read status, unsubscribe links)
- **Email Actions**: Tracks user actions (archive, delete, label) with timestamps and sources
- **AI Usage Analytics**: Monitors AI model usage, token consumption, costs, and performance metrics
- **Real-time Processing**: Custom data sources and pipes for email activity analysis and reporting

### **PostHog**
*Product analytics and feature flags*
- User analytics, event tracking, and product insights
- Feature flag management for A/B testing and gradual rollouts
- User behavior analysis and conversion tracking

### **Sentry**
*Error tracking and performance monitoring*
- Application error tracking and performance monitoring
- Real-time alerts for application issues and performance degradation
- Stack trace analysis and error grouping

### **Vercel Analytics**
*Built-in performance analytics*
- Web vitals and performance metrics
- User experience monitoring and optimization insights

### **Axiom**
*Logging and observability*
- Application logging and log analysis
- Performance monitoring and debugging support

## Payment Processing

### **Lemon Squeezy**
*Payment processing and subscription management*
- Primary payment processor for subscription billing
- Handles subscription plans, billing cycles, and payment processing
- Webhook integration for payment events and subscription changes

### **Stripe**
*Payment processing platform*
- Alternative payment processor for business customers
- Advanced payment features and international payment support
- Webhook integration for payment events and dispute handling

## Email Services

### **Resend**
*Transactional email service*
- Sends transactional emails (notifications, summaries, updates)
- Email templates and delivery tracking
- Integration with React Email for template management

### **Loops**
*Marketing email automation*
- Marketing email campaigns and user onboarding sequences
- Email list management and segmentation
- Automated email workflows and drip campaigns

## Caching & Data Storage

### **Upstash Redis**
*Serverless Redis caching*
- **Session Storage**: User sessions and authentication state
- **AI Usage Tracking**: Token usage, API call counts, costs per user
- **Email Processing Cache**: Cached email summaries, replies, and processing status
- **Categorization Progress**: Real-time progress tracking for bulk email categorization
- **Cleanup Operations**: Thread processing state and job progress
- **Account Validation**: Cached email account validation results
- **Reply Tracking**: Cached AI-generated replies and analysis status
- **Label Caching**: Frequently accessed Gmail/Outlook labels

### **QStash**
*Message queue and background jobs*
- Reliable message queuing for background processing
- Cron job scheduling and webhook delivery
- Background task processing and retry mechanisms

## Development & Build Tools

### **Turbo**
*Build system and monorepo management*
- Monorepo build orchestration and caching
- Parallel task execution and dependency management
- Build optimization and incremental builds

### **pnpm**
*Package manager*
- Fast, disk space efficient package management
- Workspace management for monorepo structure
- Dependency resolution and lockfile management

## Content Management

### **Sanity**
*Headless CMS*
- Content management for blog posts and marketing content
- Structured content editing and API-driven content delivery
- Integration with Next.js for static site generation

## Browser Automation

### **Playwright**
*Browser automation framework*
- Automated browser interactions for unsubscribe functionality
- Email unsubscribe page analysis and automation
- Cross-browser testing and automation capabilities

## Third-Party Integrations

### **Notion**
*Productivity and documentation platform*
- Integration via Model Context Protocol (MCP)
- Document search and content retrieval
- Productivity tool integration for email management

### **Monday.com**
*Project management platform*
- Task and project management integration
- Workflow automation and team collaboration tools

### **Stripe (MCP)**
*Payment data integration*
- Customer, invoice, and subscription data access
- Payment analytics and financial reporting integration

## Customer Support & Communication

### **Crisp**
*Customer support chat*
- Live chat support and customer communication
- Support ticket management and user assistance

### **Dub**
*Link management and analytics*
- URL shortening and link analytics
- Referral tracking and link performance monitoring

## Development Infrastructure

### **GitHub**
*Version control and CI/CD*
- Source code repository and version control
- GitHub Actions for CI/CD pipelines
- Private repository access for marketing content

### **Docker**
*Containerization*
- Application containerization for deployment
- Local development environment setup
- Production deployment containerization

## Authentication & Security

### **Better Auth**
*Authentication framework*
- User authentication and session management
- OAuth integration with Google and Microsoft
- Secure session handling and user management

---

## Data Architecture Overview

### **Data Storage Strategy**

The application uses a **multi-tier data architecture** optimized for different use cases:

#### **Supabase (PostgreSQL) - Primary Database**
- **Transactional Data**: User accounts, email configurations, rules, billing
- **Relational Data**: Complex relationships between users, organizations, email accounts
- **ACID Compliance**: Critical for financial transactions and user data integrity
- **Real-time Features**: Live updates for collaborative features

#### **Tinybird - Analytics Warehouse**
- **Time-Series Data**: Email activity, user actions, AI usage metrics
- **Aggregated Analytics**: Pre-computed statistics and reporting data
- **High-Volume Ingestion**: Optimized for rapid data insertion from email processing
- **Real-time Queries**: Fast analytics queries for dashboards and insights

#### **Redis - Performance Cache**
- **Session Data**: User authentication and temporary state
- **Processing State**: Real-time progress tracking for long-running operations
- **Computed Results**: Cached AI responses, email summaries, and expensive calculations
- **Rate Limiting**: Temporary data for API throttling and usage tracking

### **Data Flow Patterns**

1. **Email Processing Pipeline**:
   - Gmail/Outlook APIs → Supabase (email metadata) → Tinybird (analytics) → Redis (processing state)

2. **AI Operations**:
   - User Request → Redis (cache check) → AI Provider → Redis (result cache) → Supabase (persistent data)

3. **Analytics Generation**:
   - Tinybird (raw data) → Tinybird Pipes (aggregation) → Web UI (visualization)

4. **Real-time Features**:
   - User Action → Supabase (persistent) → Redis (cache update) → WebSocket (live update)

---

## Architecture Summary

The Inbox Zero application leverages a modern, cloud-native architecture with:

- **Frontend**: Next.js 15 with React 19, deployed on Vercel
- **Backend**: Serverless functions on Vercel with Supabase PostgreSQL
- **AI Processing**: Multiple AI providers for redundancy and cost optimization
- **Real-time Features**: WebSocket connections and webhook processing
- **Analytics**: Comprehensive monitoring and user behavior tracking
- **Email Integration**: Gmail and Outlook APIs with real-time notifications
- **Payment Processing**: Dual payment processors for flexibility
- **Caching**: Redis for performance optimization and session management

This technology stack provides a robust, scalable foundation for email management and automation while maintaining high performance and reliability.
