# Proxy

## Browser writes (Firebase required)

For write operations originating from the browser, requests with an `Origin` header matching either of the following must include a valid Firebase ID token:

- `https://app.goflypost.com`
- `https://post.goflypost.com`

These origins are treated as **Firebase-required write origins**.

## Other writes

Non-browser/system writes may use the service write token as configured.
