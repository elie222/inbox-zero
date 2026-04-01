# Homebrew Formula for Inbox Zero CLI

class InboxZero < Formula
  desc "CLI tool for setting up Inbox Zero - AI email assistant"
  homepage "https://www.getinboxzero.com"
  version "2.29.2"
  license "AGPL-3.0-only"

  on_macos do
    on_arm do
      url "https://github.com/elie222/inbox-zero/releases/download/v2.29.2/inbox-zero-darwin-arm64.tar.gz"
      sha256 "82c16d708e8b892818c38c3250ffc45c9e80e9cff2341faf7580cb920523c0ee"

      def install
        bin.install "inbox-zero-darwin-arm64" => "inbox-zero"
      end
    end

    on_intel do
      url "https://github.com/elie222/inbox-zero/releases/download/v2.29.2/inbox-zero-darwin-x64.tar.gz"
      sha256 "9e1de1c0e65c68024faf7f31d3c6830f517914625415fa31af614cc43bbfabc6"

      def install
        bin.install "inbox-zero-darwin-x64" => "inbox-zero"
      end
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/elie222/inbox-zero/releases/download/v2.29.2/inbox-zero-linux-x64.tar.gz"
      sha256 "ef257ee5bafe474275d405099b05ce2c5c63fa2ecf675737ea3b6d45d97deac7"

      def install
        bin.install "inbox-zero-linux-x64" => "inbox-zero"
      end
    end
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/inbox-zero --version")
  end
end

