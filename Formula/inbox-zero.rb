# Homebrew Formula for Inbox Zero CLI

class InboxZero < Formula
  desc "CLI tool for setting up Inbox Zero - AI email assistant"
  homepage "https://www.getinboxzero.com"
  version "2.21.38"
  license "AGPL-3.0-only"

  on_macos do
    on_arm do
      url "https://github.com/elie222/inbox-zero/releases/download/cli-v#{version}/inbox-zero-darwin-arm64.tar.gz"
      sha256 "REPLACE_WITH_DARWIN_ARM64_SHA256"

      def install
        bin.install "inbox-zero-darwin-arm64" => "inbox-zero"
      end
    end

    on_intel do
      url "https://github.com/elie222/inbox-zero/releases/download/cli-v#{version}/inbox-zero-darwin-x64.tar.gz"
      sha256 "REPLACE_WITH_DARWIN_X64_SHA256"

      def install
        bin.install "inbox-zero-darwin-x64" => "inbox-zero"
      end
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/elie222/inbox-zero/releases/download/cli-v#{version}/inbox-zero-linux-x64.tar.gz"
      sha256 "REPLACE_WITH_LINUX_X64_SHA256"

      def install
        bin.install "inbox-zero-linux-x64" => "inbox-zero"
      end
    end
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/inbox-zero --version")
  end
end

