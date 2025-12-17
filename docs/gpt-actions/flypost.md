# Flypost GPT Actions

## Proxy write authentication policy

Browser-originated write requests to the proxy must present a valid Firebase ID token when the `Origin` header is one of:

- `https://app.goflypost.com`
- `https://post.goflypost.com`

The service `write-token` is not accepted for these browser write origins.
