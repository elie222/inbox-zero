# AWS Image Proxy

This app provides an AWS Lambda adapter for the Inbox Zero image proxy contract.

Accepted request shapes:

- Signed mode: `GET /proxy?u=<url>&e=<unix-seconds>&s=<signature>`

Recommended deployment:

1. Deploy `src/handler.ts` as a Lambda Function URL or API Gateway v2 handler.
2. Put CloudFront in front of the function.
3. Forward the full query string so cache keys include `u`, `e`, and `s`.
4. Set `IMAGE_PROXY_SIGNING_SECRET` and configure the web app with the same value so the proxy only accepts signed requests.

The web app only needs `NEXT_PUBLIC_IMAGE_PROXY_BASE_URL` pointing at the AWS endpoint.
`IMAGE_PROXY_SIGNING_SECRET` must match between the app and the proxy.
If you need to accept signatures from multiple clients, the proxy can use a comma-separated secret list for validation. Each client that signs proxy URLs should still use a single secret.
