# Docker Build & Publish Guide

This guide is for maintainers who need to build and publish the Docker image to GitHub Container Registry (GHCR).

## Prerequisites

- Docker installed and running
- GitHub account with write access to the repository
- GitHub Personal Access Token (PAT) with `write:packages` scope

## Building the Image

Build the production image:

```bash
docker build -f docker/Dockerfile.prod -t inbox-zero:latest .
```

## Publishing to GHCR

### 1. Authenticate with GHCR

```bash
# Login to GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
```

Replace `$GITHUB_TOKEN` with your Personal Access Token and `USERNAME` with your GitHub username.

### 2. Tag the Image

```bash
# Tag for GHCR
docker tag inbox-zero:latest ghcr.io/elie222/inbox-zero:latest

# Optional: also tag with version
docker tag inbox-zero:latest ghcr.io/elie222/inbox-zero:v1.0.0
```

### 3. Push to GHCR

```bash
# Push latest
docker push ghcr.io/elie222/inbox-zero:latest

# Push version tag (if created)
docker push ghcr.io/elie222/inbox-zero:v1.0.0
```

## Automated Publishing with GitHub Actions

For automated builds on every release, add this workflow to `.github/workflows/docker-publish.yml`:

```yaml
name: Build and Push Docker Image

on:
  release:
    types: [published]
  workflow_dispatch:

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./docker/Dockerfile.prod
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
```

## Verifying the Published Image

Test the published image:

```bash
# Pull the image
docker pull ghcr.io/elie222/inbox-zero:latest

# Run it
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_BASE_URL=http://localhost:3000 \
  -e DATABASE_URL=postgresql://... \
  ghcr.io/elie222/inbox-zero:latest
```

## Making the Package Public

By default, packages are private. To make it public:

1. Go to https://github.com/users/elie222/packages/container/inbox-zero/settings
2. Scroll to "Danger Zone"
3. Click "Change visibility"
4. Select "Public"

