# Inbox Zero Documentation

Welcome to the Inbox Zero documentation! This directory contains comprehensive guides for using, deploying, and developing with Inbox Zero.

## 📚 Documentation Index

### User Documentation
- **[Product Features](./product-features.md)** - Complete overview of Inbox Zero's features and capabilities

### Technical Documentation

#### Google Pub/Sub & Email Automation
- **[Setup Guide](./google-pubsub-setup-guide.md)** - Complete walkthrough for setting up real-time email notifications
- **[Quick Reference](./google-pubsub-quick-reference.md)** - Commands and code snippets for common tasks
- **[Architecture Overview](./google-pubsub-architecture.md)** - Visual diagrams and system architecture
- **[Troubleshooting Guide](./google-pubsub-troubleshooting.md)** - Solutions for common issues

#### Deployment & Infrastructure
- **[Deployment Guide](./deployment.md)** - How to deploy Inbox Zero to production
- **[Technology Stack](./technology-stack.md)** - Overview of technologies used
- **[Docker Guide](./hosting/docker.md)** - Running Inbox Zero with Docker

### Architecture & Development
- **[Architecture Overview](../ARCHITECTURE.md)** - High-level system architecture
- **[Cursor Rules](../.cursor/)** - Development guidelines and rules

## 🚀 Quick Start

### For Users
1. Read [Product Features](./product-features.md) to understand what Inbox Zero can do
2. Sign up and follow the in-app onboarding

### For Developers
1. Clone the repository
2. Follow the [Deployment Guide](./deployment.md) for setup instructions
3. Review the [Technology Stack](./technology-stack.md)
4. Set up [Google Pub/Sub](./google-pubsub-setup-guide.md) for real-time processing

### For DevOps/Admins
1. Start with [Deployment Guide](./deployment.md)
2. Follow [Google Pub/Sub Setup Guide](./google-pubsub-setup-guide.md)
3. Use [Quick Reference](./google-pubsub-quick-reference.md) for common commands
4. Bookmark [Troubleshooting Guide](./google-pubsub-troubleshooting.md) for issues

## 🎯 Common Tasks

### Setting Up Real-Time Email Processing
→ [Google Pub/Sub Setup Guide](./google-pubsub-setup-guide.md)

### Creating Automation Rules
→ See "Automatic Email Labeling" section in [Setup Guide](./google-pubsub-setup-guide.md#step-6-setting-up-automatic-email-labeling)

### Debugging Issues
→ [Troubleshooting Guide](./google-pubsub-troubleshooting.md)

### Understanding the System
→ [Architecture Overview](./google-pubsub-architecture.md)

### Quick Command Reference
→ [Quick Reference](./google-pubsub-quick-reference.md)

## 📖 Documentation by Role

### End Users
- [Product Features](./product-features.md)

### Developers
- [Technology Stack](./technology-stack.md)
- [Architecture Overview](./google-pubsub-architecture.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)

### System Administrators
- [Deployment Guide](./deployment.md)
- [Google Pub/Sub Setup](./google-pubsub-setup-guide.md)
- [Docker Guide](./hosting/docker.md)
- [Quick Reference](./google-pubsub-quick-reference.md)

### DevOps Engineers
- [Deployment Guide](./deployment.md)
- [Architecture Overview](./google-pubsub-architecture.md)
- [Troubleshooting Guide](./google-pubsub-troubleshooting.md)

### Support Team
- [Troubleshooting Guide](./google-pubsub-troubleshooting.md)
- [Quick Reference](./google-pubsub-quick-reference.md)

## 🔧 Technical Deep Dives

### Google Pub/Sub Integration
The Pub/Sub integration enables real-time email processing:

1. **[Setup Guide](./google-pubsub-setup-guide.md)** - Step-by-step setup instructions
2. **[Architecture](./google-pubsub-architecture.md)** - How it all works together
3. **[Quick Reference](./google-pubsub-quick-reference.md)** - Commands at your fingertips
4. **[Troubleshooting](./google-pubsub-troubleshooting.md)** - Fixing common issues

### Key Features Explained

#### Real-Time Processing
When a user receives an email:
1. Gmail notifies Google Pub/Sub
2. Pub/Sub pushes to your webhook
3. System fetches email history
4. Rules are evaluated with AI
5. Actions are executed (label, archive, reply, etc.)

See [Architecture Overview](./google-pubsub-architecture.md) for detailed flow diagrams.

#### Automatic Email Labeling
Labels are applied based on:
- User-defined automation rules
- AI understanding of email content
- Static filters (sender, subject patterns)
- Sender categories and groups

See [Setup Guide](./google-pubsub-setup-guide.md#step-6-setting-up-automatic-email-labeling) for implementation details.

#### AI-Powered Rules
Rules use AI to:
- Match emails to appropriate rules
- Extract action parameters
- Generate replies
- Categorize senders

See [Architecture](./google-pubsub-architecture.md) for rule matching flow.

## 🐛 Getting Help

### First Steps
1. Check the [Troubleshooting Guide](./google-pubsub-troubleshooting.md)
2. Search existing GitHub issues
3. Review application logs

### Still Stuck?
- Create a GitHub issue with:
  - Clear problem description
  - Steps to reproduce
  - Relevant logs (without secrets)
  - What you've already tried

## 🤝 Contributing

Want to improve the documentation?

1. Fork the repository
2. Make your changes
3. Submit a pull request

All documentation should be:
- Clear and concise
- Well-organized with headings
- Include code examples where helpful
- Link to related documentation

## 📝 Documentation Standards

### File Naming
- Use kebab-case: `google-pubsub-setup-guide.md`
- Be descriptive: `troubleshooting` not `issues`
- Group related docs with prefixes: `google-pubsub-*.md`

### Structure
- Start with a clear title and purpose
- Include table of contents for long docs
- Use consistent heading levels
- Add code examples and commands
- Link to related documentation

### Code Examples
- Use syntax highlighting
- Include full context
- Explain what the code does
- Show both success and error cases

## 🔗 External Resources

- [Gmail API Documentation](https://developers.google.com/gmail/api)
- [Google Cloud Pub/Sub Docs](https://cloud.google.com/pubsub/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)

## 📊 Documentation Status

| Document | Status | Last Updated |
|----------|--------|--------------|
| Product Features | ✅ Complete | Current |
| Google Pub/Sub Setup | ✅ Complete | Current |
| Quick Reference | ✅ Complete | Current |
| Architecture | ✅ Complete | Current |
| Troubleshooting | ✅ Complete | Current |
| Deployment | ⚠️ Existing | Existing |
| Technology Stack | ⚠️ Existing | Existing |
| Docker Guide | ⚠️ Existing | Existing |

## 📮 Feedback

Have suggestions for improving the documentation? 
- Open an issue on GitHub
- Submit a pull request
- Contact the maintainers

---

*Last updated: October 2025*

