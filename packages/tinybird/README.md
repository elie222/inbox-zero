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

## Datasource

```sh
tb push datasources/email.datasource
```

## Pipe

```sh
tb push datasources/get_emails_by_week.pipe
```
