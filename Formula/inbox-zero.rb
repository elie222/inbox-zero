# Homebrew Formula for Inbox Zero CLI

class InboxZero < Formula
  desc "CLI tool for setting up Inbox Zero - AI email assistant"
  homepage "https://www.getinboxzero.com"
  version "2.29.0"
  license "AGPL-3.0-only"

  on_macos do
    on_arm do
      url "https://github.com/elie222/inbox-zero/releases/download/v2.29.0/inbox-zero-darwin-arm64.tar.gz"
      sha256 "da563c39f7f1be5ff15d63f55526d2dcdf5b0540cff5ae55aae8c6441513cadc"

      def install
        bin.install "inbox-zero-darwin-arm64" => "inbox-zero"
      end
    end

    on_intel do
      url "https://github.com/elie222/inbox-zero/releases/download/v2.29.0/inbox-zero-darwin-x64.tar.gz"
      sha256 "19dbd56b62a15f9931219240eb08366e9cf619fe57aa135479cfd5bee36ebb1d"

      def install
        bin.install "inbox-zero-darwin-x64" => "inbox-zero"
      end
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/elie222/inbox-zero/releases/download/v2.29.0/inbox-zero-linux-x64.tar.gz"
      sha256 "8b944bbef066b6005e8a3c334cdb14bdeaf9e5e5d45f37b68e413b66fb34081f"

      def install
        bin.install "inbox-zero-linux-x64" => "inbox-zero"
      end
    end
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/inbox-zero --version")
  end
end

