/**
 * Firebase Admin SDK initialization
 * Uses Application Default Credentials (ADC) — same as @google-cloud/firestore
 */

import { initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

if (!getApps().length) {
  initializeApp()
}

/**
 * Verify a Firebase ID token and return uid + email.
 * @param {string} idToken
 * @returns {Promise<{ uid: string, email: string }>}
 */
export async function verifyIdToken(idToken) {
  const decoded = await getAuth().verifyIdToken(idToken)
  return { uid: decoded.uid, email: decoded.email || null }
}
