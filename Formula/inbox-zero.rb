# Homebrew Formula for Inbox Zero CLI

class InboxZero < Formula
  desc "CLI tool for setting up Inbox Zero - AI email assistant"
  homepage "https://www.getinboxzero.com"
  version "2.29.3"
  license "AGPL-3.0-only"

  on_macos do
    on_arm do
      url "https://github.com/elie222/inbox-zero/releases/download/v2.29.3/inbox-zero-darwin-arm64.tar.gz"
      sha256 "1e6f0ef0f5556efe56bd3bf83e2b6f2172905858fda7a5c317b2ec3d45800841"

      def install
        bin.install "inbox-zero-darwin-arm64" => "inbox-zero"
      end
    end

    on_intel do
      url "https://github.com/elie222/inbox-zero/releases/download/v2.29.3/inbox-zero-darwin-x64.tar.gz"
      sha256 "0871d76cb0d9505cd4fc53666cb7ec819bdd18713f7c1b00b6780b881e4f6cf9"

      def install
        bin.install "inbox-zero-darwin-x64" => "inbox-zero"
      end
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/elie222/inbox-zero/releases/download/v2.29.3/inbox-zero-linux-x64.tar.gz"
      sha256 "1e46f0aba30905a877509c29a65fcca5be45d7391a1b5e27125bf05518e53be6"

      def install
        bin.install "inbox-zero-linux-x64" => "inbox-zero"
      end
    end
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/inbox-zero --version")
  end
end
