/**
 * Firebase Admin SDK initialization
 * Supports Application Default Credentials (ADC) on Cloud Run
 * and service account file for local development
 */

import admin from 'firebase-admin'

let firebaseApp = null
let initialized = false

/**
 * Initialize Firebase Admin SDK
 * Uses Application Default Credentials by default (for Cloud Run)
 * Falls back to GOOGLE_APPLICATION_CREDENTIALS env var for local dev
 */
export function initializeFirebaseAdmin() {
  if (initialized) {
    return firebaseApp
  }

  // Mark as attempted to prevent repeated initialization attempts
  initialized = true

  try {
    // Check if GOOGLE_CLOUD_PROJECT is set (required for Firestore)
    const projectId = process.env.GOOGLE_CLOUD_PROJECT

    if (!projectId) {
      console.log('⚪ Firebase Admin not initialized: GOOGLE_CLOUD_PROJECT not set')
      return null
    }

    // Initialize with Application Default Credentials
    // This works on Cloud Run automatically, or uses GOOGLE_APPLICATION_CREDENTIALS locally
    firebaseApp = admin.initializeApp({
      projectId: projectId
    })

    console.log('✅ Firebase Admin SDK initialized (project:', projectId + ')')
    return firebaseApp
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin:', error.message)
    return null
  }
}

/**
 * Verify a Firebase ID token
 * @param {string} idToken - The Firebase ID token to verify
 * @returns {Promise<object>} Decoded token with uid, email, and custom claims
 * @throws {Error} If token is invalid or verification fails
 */
export async function verifyFirebaseToken(idToken) {
  if (!firebaseApp) {
    throw new Error('Firebase Admin not initialized')
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken)
    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
      claims: decodedToken
    }
  } catch (error) {
    throw new Error(`Token verification failed: ${error.message}`)
  }
}

/**
 * Check if Firebase Admin is initialized and available
 * @returns {boolean}
 */
export function isFirebaseAuthEnabled() {
  if (!initialized) {
    initializeFirebaseAdmin()
  }
  return firebaseApp !== null
}
