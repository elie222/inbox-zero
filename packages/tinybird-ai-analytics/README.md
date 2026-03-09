## Getting Started

First time:

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install tinybird-cli
tb auth
```

More notes: [Quickstart](https://www.tinybird.co/docs/quick-start-cli.html)

Thereafter:

```sh
source .venv/bin/activate
```

### Docker

You can also use the Docker image. This worked a lot better for me.

Run the following from this directory:

```sh
docker run -v .:/mnt/data -it tinybirdco/tinybird-cli-docker
```

Then within Docker:

```sh
cd mnt/data
tb push datasources
tb push pipes
```

## AI Cost Fields

- `cost`: platform-billed estimated cost (user API key traffic is `0`)
- `estimatedCost`: estimated cost regardless of who paid
- `isUserApiKey`: `1` for user-provided API keys, `0` for platform keys
- Legacy rows (before this schema change) have `NULL` for `estimatedCost` and `isUserApiKey`
