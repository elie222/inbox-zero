{
  description = "Inbox Zero — open-source AI email assistant";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    inbox-zero-src = {
      url = "path:.";
      flake = false;
    };
  };

  outputs =
    { self, nixpkgs, flake-utils, inbox-zero-src }:
    let
      out = system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          applied = self.overlays.default pkgs pkgs;
        in
        {
          packages = {
            inbox-zero = applied.inbox-zero;
            default = applied.inbox-zero;
          };
          devShells.default = applied.inbox-zero-dev-shell;
        };
    in
    flake-utils.lib.eachDefaultSystem out // {
      overlays.default = final: prev:
        let
          nodejs = prev.nodejs_24;
          pnpm = prev.pnpm;

          inbox-zero-drv =
            (prev.callPackage ./nix/pkgs/inbox-zero.nix {
              inherit nodejs pnpm;
              fetchPnpmDeps = prev.fetchPnpmDeps;
              pnpmConfigHook = prev.pnpmConfigHook;
              writableTmpDirAsHomeHook = prev.writableTmpDirAsHomeHook;
              prisma = prev.prisma;
              prisma-engines = prev.prisma-engines;
              srcPath = inbox-zero-src;
            }).overrideAttrs (old: {
              src = inbox-zero-src;
            });
        in
        {
          inherit inbox-zero-drv;

          # Single package ships both bins: inbox-zero-server and
          # inbox-zero-worker.
          inbox-zero = inbox-zero-drv;

          inbox-zero-dev-shell = prev.mkShell {
            inputsFrom = [ inbox-zero-drv ];
            packages = with prev; [
              typescript
              docker-compose
              curl
              jq
            ];
            shellHook = ''
              echo "🛠  Inbox Zero development shell"
              echo "   Node.js: $(node --version)"
              echo "   pnpm:    $(pnpm --version)"
              echo ""
              echo "Quick start:"
              echo "  docker compose -f docker-compose.dev.yml up -d   # Postgres + Redis"
              echo "  pnpm install"
              echo "  cd apps/web && pnpm prisma migrate dev && cd ../.."
              echo "  pnpm dev"
              echo ""
            '';
          };
        };
    };
}