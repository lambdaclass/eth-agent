{
  description = "eth-agent - The simplest, safest way for AI agents to use Ethereum";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    foundry.url = "github:foundry-rs/foundry";
  };

  outputs = { self, nixpkgs, flake-utils, foundry }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        nodejs = pkgs.nodejs_22;
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs
            nodePackages.npm
            nodePackages.typescript
            nodePackages.typescript-language-server
            git
            gnumake
            # Foundry tools (forge, cast, anvil, chisel)
            foundry.packages.${system}.default
          ];

          shellHook = ''
            echo "eth-agent development environment"
            echo "Node.js $(node --version)"
            echo "npm $(npm --version)"
            echo "Foundry $(forge --version 2>/dev/null | head -1 || echo 'loading...')"
            echo ""
            echo "Available commands:"
            echo "  make install  - Install dependencies"
            echo "  make build    - Build the project"
            echo "  make test     - Run tests"
            echo "  make test-e2e - Run e2e tests (requires anvil)"
            echo "  make lint     - Run linter"
            echo "  make all      - Run all checks"
            echo ""
            echo "Foundry tools:"
            echo "  anvil         - Local Ethereum testnet"
            echo "  forge         - Build/test Solidity contracts"
            echo "  cast          - Ethereum CLI utilities"
          '';
        };

        packages.default = pkgs.buildNpmPackage {
          pname = "eth-agent";
          version = "0.1.0";
          src = ./.;
          npmDepsHash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="; # Update after first build

          buildPhase = ''
            npm run build
          '';

          installPhase = ''
            mkdir -p $out
            cp -r dist $out/
            cp package.json $out/
          '';
        };
      }
    );
}
