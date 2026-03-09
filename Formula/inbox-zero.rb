# Homebrew Formula for Inbox Zero CLI

class InboxZero < Formula
  desc "CLI tool for setting up Inbox Zero - AI email assistant"
  homepage "https://www.getinboxzero.com"
  version "2.29.1"
  license "AGPL-3.0-only"

  on_macos do
    on_arm do
      url "https://github.com/elie222/inbox-zero/releases/download/v2.29.1/inbox-zero-darwin-arm64.tar.gz"
      sha256 "ca1f436f67e47b50d7c44239ab11850ca4a37b42e467ad0fe3747c52c4e0145e"

      def install
        bin.install "inbox-zero-darwin-arm64" => "inbox-zero"
      end
    end

    on_intel do
      url "https://github.com/elie222/inbox-zero/releases/download/v2.29.1/inbox-zero-darwin-x64.tar.gz"
      sha256 "f691f2ab56f34d0a24f0bb00b686ed11082a38b3e72d1e72d48b6b4701b281ce"

      def install
        bin.install "inbox-zero-darwin-x64" => "inbox-zero"
      end
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/elie222/inbox-zero/releases/download/v2.29.1/inbox-zero-linux-x64.tar.gz"
      sha256 "8be318f74f51c2b9dfd526661805513eb4ef59e74c425766d7ce7f1200d6bec4"

      def install
        bin.install "inbox-zero-linux-x64" => "inbox-zero"
      end
    end
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/inbox-zero --version")
  end
end

