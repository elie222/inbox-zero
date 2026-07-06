{ stdenv
, lib
, nodejs
, pnpm
, fetchPnpmDeps
, pnpmConfigHook
, openssl
, python3
, pkg-config
, gcc
, writableTmpDirAsHomeHook
, esbuild
, prisma
, prisma-engines
, srcPath ? null
, ...
}:

let
  webDir = "apps/web";
  prismaDir = "${webDir}/prisma";

  defaultBuildEnv = {
    NODE_ENV = "production";
    # Not a docker build — this app flag only selects Next's standalone output
    # (next.config.ts), which the Nix package needs for a self-contained server.
    DOCKER_BUILD = "true";

    DATABASE_URL = "postgresql://dummy:dummy@dummy:5432/dummy?schema=public";
    DIRECT_URL = "postgresql://dummy:dummy@dummy:5432/dummy?schema=public";
    AUTH_SECRET = "dummy_secret_for_build_only_32chars!";
    BETTER_AUTH_SECRET = "dummy_secret_for_build_only_32chars!";
    GOOGLE_CLIENT_ID = "dummy_id_for_build_only";
    GOOGLE_CLIENT_SECRET = "dummy_secret_for_build_only";
    EMAIL_ENCRYPT_SECRET = "dummy_encrypt_secret_for_build_only";
    EMAIL_ENCRYPT_SALT = "dummy_encrypt_salt_for_build_only";
    GOOGLE_PUBSUB_TOPIC_NAME = "dummy_topic_for_build_only";
    GOOGLE_PUBSUB_VERIFICATION_TOKEN = "dummy_pubsub_token_for_build";
    DEFAULT_LLMS = "anthropic:claude-sonnet-4-6";
    INTERNAL_API_KEY = "dummy_apikey_for_build_only";
    API_KEY_SALT = "dummy_salt_for_build_only";
    UPSTASH_REDIS_URL = "http://dummy-redis-for-build:6379";
    UPSTASH_REDIS_TOKEN = "dummy_redis_token_for_build";
    REDIS_URL = "redis://dummy:dummy@dummy:6379";
    QSTASH_TOKEN = "dummy_qstash_token_for_build";
    QSTASH_CURRENT_SIGNING_KEY = "dummy_qstash_curr_key_for_build";
    QSTASH_NEXT_SIGNING_KEY = "dummy_qstash_next_key_for_build";

    NEXT_PUBLIC_BASE_URL = "http://localhost:3000";
    NEXT_PUBLIC_EMAIL_SEND_ENABLED = "true";
    NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS = "true";

    PRISMA_SKIP_POSTINSTALL_GENERATE = "true";
    PRISMA_SCHEMA_ENGINE_BINARY = "${prisma-engines}/bin/schema-engine";
    CI = "true";
    NEXT_TELEMETRY_DISABLED = "1";
  };
in
stdenv.mkDerivation (finalAttrs: {
  pname = "inbox-zero";
  version = "0.0.0";

  src = null; # flake overlay override

  dontUnpack = true;

  nativeBuildInputs = [
    nodejs
    pnpm
    pnpmConfigHook
    prisma
    openssl
    python3
    pkg-config
    gcc
    esbuild
    writableTmpDirAsHomeHook
  ];

  pnpmDeps = fetchPnpmDeps {
    pname = "${finalAttrs.pname}-pnpm-deps";
    pnpm = pnpm;
    fetcherVersion = 4;
    dontUnpack = true;
    preInstall = ''
      cp -rT ${srcPath} "$PWD"
      chmod -R u+w "$PWD"
    '';
    preFixup = ''
      find $storePath -name "*.json" -exec sh -c '
        jq empty "$1" 2>/dev/null || rm -f "$1"
      ' _ {} \;
    '';
    hash = "sha256-uPONTamu8bzVFgdQ8NSAAmk50xh3+YmYM09Xw+1M5Hk=";
  };

  env = defaultBuildEnv;

  preConfigure = ''
    cp -rT "$src" "$PWD"
    chmod -R u+w "$PWD"
  '';

  buildPhase = ''
    runHook preBuild

    buildRoot="$PWD"
    export PATH="$PWD/node_modules/.bin:$PWD/${webDir}/node_modules/.bin:$PATH"

    prisma generate --schema=${prismaDir}/schema.prisma

    cd ${webDir}
    # Nix sandbox has no network; serve next/font/google from vendored files.
    NODE_OPTIONS="--max_old_space_size=8192 --require $src/nix/fonts/font-mock.cjs" \
      next build --webpack
    cd "$buildRoot"

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p $out/apps/web/.next/standalone
    mkdir -p $out/apps/web/public
    mkdir -p $out/apps/web/prisma

    cp -r ${webDir}/.next/standalone/* $out/apps/web/.next/standalone/
    cp -r ${webDir}/.next/static $out/apps/web/.next/static
    cp -r ${webDir}/public/* $out/apps/web/public/
    cp -r ${prismaDir} $out/apps/web/prisma

    # Worker (BullMQ). Bundle to a single file so the output is self-contained
    # without the pnpm store symlink tree. bullmq ships its Lua scripts compiled
    # into JS, so no runtime file reads are lost. msgpackr-extract is an optional
    # native accel that msgpackr require()s in a try/catch; leave it external and
    # msgpackr falls back to pure JS.
    mkdir -p $out/apps/worker
    esbuild apps/worker/src/index.mjs \
      --bundle --platform=node --format=esm --target=node22 \
      --external:msgpackr-extract \
      --banner:js="import{createRequire as __cr}from'module';const require=__cr(import.meta.url);" \
      --outfile=$out/apps/worker/index.mjs

    mkdir -p $out/bin

    cat > $out/bin/inbox-zero-server << SCRIPT
#!${stdenv.shell}
exec ${nodejs}/bin/node "$out/apps/web/.next/standalone/apps/web/server.js" "\$@"
SCRIPT
    chmod +x $out/bin/inbox-zero-server

    cat > $out/bin/inbox-zero-worker << SCRIPT
#!${stdenv.shell}
exec ${nodejs}/bin/node "$out/apps/worker/index.mjs" "\$@"
SCRIPT
    chmod +x $out/bin/inbox-zero-worker

    runHook postInstall
  '';

  doDist = false;

  meta = {
    description = "Inbox Zero — open-source AI email assistant";
    homepage = "https://www.getinboxzero.com";
    license = lib.licenses.agpl3Only;
    platforms = lib.platforms.linux;
    maintainers = with lib.maintainers; [ ];
  };
})