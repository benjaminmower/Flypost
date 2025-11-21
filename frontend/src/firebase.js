// v2 — firebase.js (pure JS) for Flypost v4

import { initializeApp, getApps } from 'firebase/app'
import {
  getAuth,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  onAuthStateChanged
} from 'firebase/auth'

// Firebase config populated from globals (set these in index.html)
const firebaseConfig = {
  apiKey: window.FIREBASE_API_KEY,
  authDomain: window.FIREBASE_AUTH_DOMAIN,
  projectId: window.FIREBASE_PROJECT_ID,
  appId: window.FIREBASE_APP_ID,
  measurementId: window.FIREBASE_MEASUREMENT_ID
}

// Initialize or reuse app
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
export const auth = getAuth(app)

/**
 * Start email-link sign-in by sending link to the given email.
 */
export async function startEmailLinkSignIn(email) {
  const actionCodeSettings = {
    url: `${window.location.origin}/finishSignIn`,
    handleCodeInApp: true
  }

  await sendSignInLinkToEmail(auth, email, actionCodeSettings)

  // Persist email locally so we can complete sign-in on return
  window.localStorage.setItem('flypostEmailForSignIn', email)
}

/**
 * Complete sign-in if the current URL is an email sign-in link.
 */
export async function completeEmailLinkSignIn() {
  if (!isSignInWithEmailLink(auth, window.location.href)) return null

  let email = window.localStorage.getItem('flypostEmailForSignIn') || ''

  if (!email) {
    email = window.prompt('Please confirm your email for Flypost sign-in') || ''
  }

  const result = await signInWithEmailLink(auth, email, window.location.href)
  window.localStorage.removeItem('flypostEmailForSignIn')
  return result.user
}

/**
 * Subscribe to auth state changes.
 */
export function subscribeToAuth(cb) {
  return onAuthStateChanged(auth, cb)
}
