import * as dns from "node:dns/promises";

// Private/internal IP ranges that should be blocked
const PRIVATE_IP_RANGES = [
  // IPv4
  /^127\./, // 127.0.0.0/8 (loopback)
  /^10\./, // 10.0.0.0/8 (private)
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12 (private)
  /^192\.168\./, // 192.168.0.0/16 (private)
  /^169\.254\./, // 169.254.0.0/16 (link-local, cloud metadata)
  /^0\./, // 0.0.0.0/8
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // 100.64.0.0/10 (CGNAT)
  /^192\.0\.0\./, // 192.0.0.0/24 (IETF protocol assignments)
  /^192\.0\.2\./, // 192.0.2.0/24 (TEST-NET-1)
  /^198\.51\.100\./, // 198.51.100.0/24 (TEST-NET-2)
  /^203\.0\.113\./, // 203.0.113.0/24 (TEST-NET-3)
  /^224\./, // 224.0.0.0/4 (multicast)
  /^240\./, // 240.0.0.0/4 (reserved)
  /^255\.255\.255\.255$/, // broadcast

  // IPv6
  /^::1$/, // loopback
  /^fe80:/i, // link-local
  /^fc00:/i, // unique local (fc00::/7)
  /^fd[0-9a-f]{2}:/i, // unique local
  /^::ffff:(127\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|169\.254\.)/i, // IPv4-mapped IPv6
];

// Blocked hostnames
const BLOCKED_HOSTNAMES = [
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  // Common cloud metadata endpoints
  "metadata.google.internal",
  "metadata.gcp.internal",
];

export type WebhookUrlValidationResult =
  | { valid: true }
  | { valid: false; error: string };

/**
 * Check if an IP address is in a private/internal range
 */
function isPrivateIP(ip: string): boolean {
  return PRIVATE_IP_RANGES.some((range) => range.test(ip));
}

/**
 * Validates a webhook URL to prevent SSRF attacks.
 *
 * Validation includes:
 * - Only HTTPS scheme allowed
 * - No IP addresses in the hostname (must use DNS names)
 * - No private/internal hostnames (localhost, metadata endpoints, etc.)
 * - DNS resolution must not resolve to private/internal IP addresses
 */
export async function validateWebhookUrl(
  url: string,
): Promise<WebhookUrlValidationResult> {
  let parsedUrl: URL;

  // Parse the URL
  try {
    parsedUrl = new URL(url);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  // Only allow HTTPS in production, allow HTTP in development
  const isProduction = process.env.NODE_ENV === "production";
  const allowedProtocols = isProduction ? ["https:"] : ["https:", "http:"];

  if (!allowedProtocols.includes(parsedUrl.protocol)) {
    return {
      valid: false,
      error: isProduction
        ? "Only HTTPS URLs are allowed for webhooks"
        : "Only HTTP and HTTPS URLs are allowed for webhooks",
    };
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // Block known internal hostnames
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    return {
      valid: false,
      error: "Webhook URL hostname is not allowed",
    };
  }

  // Check if hostname is an IP address (IPv4 or IPv6)
  // IPv4 pattern
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  // IPv6 pattern (simplified - catches most cases including [::1] format)
  const ipv6Pattern = /^(\[)?([0-9a-fA-F:]+)(\])?$/;

  if (ipv4Pattern.test(hostname)) {
    // It's an IPv4 address - check if it's private
    if (isPrivateIP(hostname)) {
      return {
        valid: false,
        error: "Webhook URL cannot point to private IP addresses",
      };
    }
    // Even if it's not private, we should still resolve to verify
  }

  // Handle IPv6 addresses (may be wrapped in brackets)
  const ipv6Match = hostname.match(ipv6Pattern);
  if (ipv6Match) {
    const ipv6Addr = ipv6Match[2];
    if (isPrivateIP(ipv6Addr)) {
      return {
        valid: false,
        error: "Webhook URL cannot point to private IP addresses",
      };
    }
  }

  // Resolve DNS and check if any resolved IP is private
  // This prevents DNS rebinding attacks
  try {
    const addresses = await dns.resolve(hostname);

    for (const ip of addresses) {
      if (isPrivateIP(ip)) {
        return {
          valid: false,
          error: "Webhook URL cannot resolve to private IP addresses",
        };
      }
    }
  } catch (error) {
    // DNS resolution failed - could be because hostname is an IP address
    // or because the hostname doesn't exist
    const dnsError = error as NodeJS.ErrnoException;

    if (dnsError.code === "ENOTFOUND") {
      return {
        valid: false,
        error: "Webhook URL hostname could not be resolved",
      };
    }

    // For IP addresses, dns.resolve will fail with ENODATA
    // In that case, we've already checked the IP above
    if (dnsError.code !== "ENODATA") {
      return {
        valid: false,
        error: "Failed to validate webhook URL",
      };
    }
  }

  return { valid: true };
}
