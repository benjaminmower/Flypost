# Hashed assets + loader for Concierge widget

What this does
- Produces content-hashed static assets and a small loader:
  - concierge-dist/concierge-loader.js (stable URL to reference in Webflow)
  - concierge-dist/manifest.json (maps to hashed assets)
  - concierge-dist/<hashed files> (JS/CSS, long-cache)

How to use
- In Webflow embed (or any page), include:
  <script>
    window.FLYPOST_CONFIG = { apiBase: 'https://api.goflypost.com', brokerageId: 'vista-sir' };
  </script>
  <script src="https://cdn.goflypost.com/concierge-loader.js"></script>

CI / GitHub Actions
- The workflow `.github/workflows/deploy-concierge-hashed.yml` runs the build script and deploys to Firebase Hosting.
- Required GitHub secret: FIREBASE_SERVICE_ACCOUNT (JSON key contents for service account with roles/firebasehosting.admin).

Notes
- The workflow triggers on push to main and on manual dispatch; merging the PR to main will trigger the workflow and deploy concierge-dist automatically.
- If the FIREBASE_SERVICE_ACCOUNT secret is missing or lacks permissions, the deploy step will fail; ensure the service account has `roles/firebasehosting.admin`.
