# Deployment Checklist for Flypost Ask & Post Sites

## Prerequisites

- [ ] Two separate Netlify accounts or sites configured
- [ ] Firebase project with Email Link authentication enabled
- [ ] API proxy deployed and accessible at `https://api.goflypost.com`
- [ ] DNS configured for `ask.goflypost.com` and `post.goflypost.com`

## Deploy Ask Site (`ask.goflypost.com`)

### 1. Create Netlify Site

- [ ] Log in to Netlify
- [ ] Click "Add new site" → "Import an existing project"
- [ ] Connect to GitHub repository `goflypost/v4`
- [ ] Configure build settings:
  - Base directory: `frontend_ask`
  - Build command: `npm install && npm run build`
  - Publish directory: `dist`

### 2. Configure Environment Variables

In Netlify site settings → Environment variables, add:

- [ ] `VITE_API_BASE_URL` = `https://api.goflypost.com`

### 3. Configure Custom Domain

- [ ] Add custom domain: `ask.goflypost.com`
- [ ] Verify DNS configuration
- [ ] Enable HTTPS

### 4. Deploy and Test

- [ ] Trigger initial deploy
- [ ] Test that site loads at `https://ask.goflypost.com`
- [ ] Test chat functionality (should call `/api/chat`)
- [ ] Verify capability assets are accessible:
  - [ ] `https://ask.goflypost.com/.well-known/ai.json`
  - [ ] `https://ask.goflypost.com/openapi.json`
  - [ ] `https://ask.goflypost.com/llm.txt`

## Deploy Post Site (`post.goflypost.com`)

### 1. Create Netlify Site

- [ ] Log in to Netlify
- [ ] Click "Add new site" → "Import an existing project"
- [ ] Connect to GitHub repository `goflypost/v4`
- [ ] Configure build settings:
  - Base directory: `frontend_post`
  - Build command: `npm install && npm run build`
  - Publish directory: `dist`

### 2. Configure Environment Variables

In Netlify site settings → Environment variables, add:

- [ ] `VITE_API_BASE_URL` = `https://api.goflypost.com`
- [ ] `VITE_FIREBASE_API_KEY` = (from Firebase console)
- [ ] `VITE_FIREBASE_AUTH_DOMAIN` = `your-project.firebaseapp.com`
- [ ] `VITE_FIREBASE_PROJECT_ID` = `your-project-id`
- [ ] `VITE_FIREBASE_APP_ID` = (optional, from Firebase console)
- [ ] `VITE_FIREBASE_MEASUREMENT_ID` = (optional, for Analytics)

### 3. Configure Firebase

- [ ] Add `post.goflypost.com` to authorized domains in Firebase Console
  - Firebase Console → Authentication → Settings → Authorized domains
- [ ] Verify Email Link authentication is enabled
  - Firebase Console → Authentication → Sign-in method → Email/Password → Email link (passwordless sign-in)

### 4. Configure Custom Domain

- [ ] Add custom domain: `post.goflypost.com`
- [ ] Verify DNS configuration
- [ ] Enable HTTPS

### 5. Deploy and Test

- [ ] Trigger initial deploy
- [ ] Test that site loads at `https://post.goflypost.com`
- [ ] Test sign-in flow:
  - [ ] Enter email and click "Send Link"
  - [ ] Check email for magic link
  - [ ] Click link (should redirect to `/finishSignIn` then home)
  - [ ] Verify signed-in state
- [ ] Test publishing an event
- [ ] Verify capability assets are accessible:
  - [ ] `https://post.goflypost.com/.well-known/ai.json`
  - [ ] `https://post.goflypost.com/openapi.json`
  - [ ] `https://post.goflypost.com/llm.txt`

## API Proxy Configuration

Ensure the API proxy at `https://api.goflypost.com` has proper CORS and origin-gating configured:

### For Ask Site

- [ ] Allow `POST /api/chat` from origin `https://ask.goflypost.com`
- [ ] No authentication required
- [ ] Block other `/api/*` POST requests from this origin

### For Post Site

- [ ] Allow `POST /api/parse-and-publish` from origin `https://post.goflypost.com`
- [ ] Require Firebase ID token in `Authorization: Bearer <token>` header
- [ ] Validate token and extract user claims

## Testing Checklist

### Ask Site
- [ ] Can load the page
- [ ] Can type a question
- [ ] Can submit and receive a response from `/api/chat`
- [ ] Error handling works for API failures
- [ ] Capability assets are accessible
- [ ] Navigation to Post site works

### Post Site
- [ ] Can load the page
- [ ] Sign-in flow works end-to-end
- [ ] Magic link email is received
- [ ] Completing sign-in redirects properly
- [ ] Can publish an event when signed in
- [ ] Cannot publish when not signed in
- [ ] Sign-out works
- [ ] Error handling works for API failures
- [ ] Capability assets are accessible
- [ ] Navigation to Ask site works

## Troubleshooting

### Ask Site Issues

**Chat not working:**
- Check browser console for errors
- Verify `VITE_API_BASE_URL` is set correctly
- Check API proxy CORS configuration
- Verify origin-gating allows `ask.goflypost.com`

**Assets not found:**
- Rebuild and verify dist contains all files
- Check build logs for copy-assets script output

### Post Site Issues

**Firebase errors:**
- Verify all Firebase env vars are set
- Check Firebase Console for correct config
- Ensure domain is in authorized domains list

**Sign-in not working:**
- Verify Email Link auth is enabled in Firebase
- Check spam folder for magic link email
- Verify authorized domains include `post.goflypost.com`

**Publishing fails:**
- Check that user is signed in
- Verify Firebase ID token is being sent
- Check API proxy logs for authentication errors
- Verify origin-gating allows `post.goflypost.com`

## Post-Deployment

- [ ] Set up monitoring/analytics
- [ ] Configure error tracking (e.g., Sentry)
- [ ] Set up automated backups
- [ ] Document any custom configuration
- [ ] Train team on new deployment process
- [ ] Update internal documentation with new URLs
