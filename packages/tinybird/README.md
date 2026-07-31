# Tinybird

The [`project`](project) directory is the canonical Tinybird Forward project
for the `InboxZero` workspace. It contains all analytics resources, including
the AI analytics resources consumed by `@inboxzero/tinybird-ai-analytics`.

## CLI setup

Run the current Forward CLI without conflicting with a Classic CLI already on
your `PATH`:

```sh
uvx --from tinybird@latest tb --version
```

Authenticate and select the production workspace:

```sh
cd packages/tinybird/project
uvx --from tinybird@latest tb login --host https://api.us-east.tinybird.co --workspace InboxZero
```

## Development workflow

Pull the current cloud definitions:

```sh
uvx --from tinybird@latest tb --cloud pull
```

Start Tinybird Local and validate the project locally:

```sh
uvx --from tinybird@latest tb local start
uvx --from tinybird@latest tb build
uvx --from tinybird@latest tb test run
```

Validate and deploy the project to Tinybird Cloud:

```sh
uvx --from tinybird@latest tb --cloud deploy --check
```

Tinybird Forward deployments replace the Classic `tb push` workflow. Keep
resource definitions and `TOKEN` directives in `packages/tinybird/project` so
deployments remain reproducible from Git.
