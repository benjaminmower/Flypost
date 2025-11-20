//v1
// src/firebase.ts
import { initializeApp, getApps } from 'firebase/app'
import {
  getAuth,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  onAuthStateChanged,
  type User
} from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
}

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
export const auth = getAuth(app)

/**
 * Start email-link sign-in by sending link to the given email.
 */
export async function startEmailLinkSignIn(email: string) {
  const actionCodeSettings = {
    url: `${window.location.origin}/finishSignIn`,
    handleCodeInApp: true
  }

  await sendSignInLinkToEmail(auth, email, actionCodeSettings)

  // Persist email locally so we can complete sign-in when they come back
  window.localStorage.setItem('flypostEmailForSignIn', email)
}

/**
 * Complete sign-in if the current URL is an email sign-in link.
 */
export async function completeEmailLinkSignIn() {
  if (!isSignInWithEmailLink(auth, window.location.href)) return null

  let email = window.localStorage.getItem('flypostEmailForSignIn') || ''

  if (!email) {
    // If they opened the link on a different device, ask for email again
    email = window.prompt('Please confirm your email for Flypost sign-in') || ''
  }

  const result = await signInWithEmailLink(auth, email, window.location.href)
  window.localStorage.removeItem('flypostEmailForSignIn')
  return result.user
}

/**
 * Subscribe to auth state changes.
 */
export function subscribeToAuth(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb)
}
