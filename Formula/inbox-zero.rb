# Homebrew Formula for Inbox Zero CLI

class InboxZero < Formula
  desc "CLI tool for setting up Inbox Zero - AI email assistant"
  homepage "https://www.getinboxzero.com"
  version "2.21.40"
  license "AGPL-3.0-only"

  on_macos do
    on_arm do
      url "https://github.com/elie222/inbox-zero/releases/download/cli-v#{version}/inbox-zero-darwin-arm64.tar.gz"
      sha256 "d93cc3d3c2f0c65ead4fcd67ba707249359fe053335aae195596e8f9d6c2c20c"

      def install
        bin.install "inbox-zero-darwin-arm64" => "inbox-zero"
      end
    end

    on_intel do
      url "https://github.com/elie222/inbox-zero/releases/download/cli-v#{version}/inbox-zero-darwin-x64.tar.gz"
      sha256 "cde5a02a288ff54a1862d71be64e56424e9cb0e62a8fb94174ce30d8be5259ec"

      def install
        bin.install "inbox-zero-darwin-x64" => "inbox-zero"
      end
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/elie222/inbox-zero/releases/download/cli-v#{version}/inbox-zero-linux-x64.tar.gz"
      sha256 "956289c04be9d0bad83361966e74e0047ee3bdd1d3063dd218da3e1acbdf46ac"

      def install
        bin.install "inbox-zero-linux-x64" => "inbox-zero"
      end
    end
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/inbox-zero --version")
  end
end

