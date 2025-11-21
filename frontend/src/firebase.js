// firebase.js — Flypost v4 (Vite + Firebase JS SDK) v3

import { initializeApp, getApps } from 'firebase/app'
import {
  getAuth,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  onAuthStateChanged
} from 'firebase/auth'

// Firebase config using Vite’s environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
}

// Debug log (visible in console only, does NOT leak keys)
console.log('[Flypost] FirebaseConfig loaded:', {
  apiKeyPresent: !!firebaseConfig.apiKey,
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  appIdPresent: !!firebaseConfig.appId
})

if (!firebaseConfig.apiKey) {
  console.error('[Flypost] ERROR: Missing Firebase API key. Check Netlify env vars.')
}

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
export const auth = getAuth(app)

export async function startEmailLinkSignIn(email) {
  const actionCodeSettings = {
    url: `${window.location.origin}/finishSignIn`,
    handleCodeInApp: true
  }

  await sendSignInLinkToEmail(auth, email, actionCodeSettings)
  window.localStorage.setItem('flypostEmailForSignIn', email)
}

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

export function subscribeToAuth(cb) {
  return onAuthStateChanged(auth, cb)
}
