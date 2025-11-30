# @inbox-zero/cli

CLI tool for setting up [Inbox Zero](https://www.getinboxzero.com) - an open source AI email assistant.

## Installation

### Homebrew

```bash
brew tap inbox-zero/inbox-zero https://github.com/elie222/inbox-zero.git
brew install inbox-zero
```

### Manual Installation

Download the binary for your platform from [releases](https://github.com/elie222/inbox-zero/releases) and add to your PATH.

### From source (via pnpm)

If you've cloned the repository:

```bash
pnpm setup
```

## Usage

```bash
# Clone the inbox-zero repository
git clone https://github.com/elie222/inbox-zero.git
cd inbox-zero

# Run the setup wizard
inbox-zero setup

# Or just run (defaults to setup)
inbox-zero
```

The CLI will:
1. Guide you through configuring OAuth providers (Google/Microsoft)
2. Set up database connection (Docker or custom PostgreSQL)
3. Configure Redis (Docker or Upstash)
4. Select your LLM provider
5. Generate all required secrets
6. Create the `.env` file in `apps/web/`

## Development

```bash
cd packages/cli
pnpm install
pnpm dev
```

## License

See [LICENSE](../../LICENSE) in the repository root.
