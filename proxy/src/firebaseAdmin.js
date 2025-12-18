// Firebase Admin SDK initialization for Cloud Run
// Uses Application Default Credentials (ADC) - no service account key needed

const admin = require('firebase-admin')

let firebaseApp = null

/**
 * Initialize Firebase Admin SDK with Application Default Credentials
 * @returns {admin.app.App} Firebase Admin app instance
 */
function initializeFirebaseAdmin() {
  if (firebaseApp) {
    return firebaseApp
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT

  if (!projectId) {
    console.warn('⚠️  Firebase Admin: No project ID found. Set FIREBASE_PROJECT_ID or GOOGLE_CLOUD_PROJECT')
    return null
  }

  try {
    // Initialize with minimal config - ADC will be used automatically in Cloud Run
    firebaseApp = admin.initializeApp({
      projectId: projectId
    })
    console.log(`✅ Firebase Admin initialized for project: ${projectId}`)
    return firebaseApp
  } catch (err) {
    console.error('❌ Firebase Admin initialization failed:', err.message)
    return null
  }
}

/**
 * Get Firebase Auth instance
 * @returns {admin.auth.Auth | null} Firebase Auth instance or null if not initialized
 */
function getFirebaseAuth() {
  const app = initializeFirebaseAdmin()
  return app ? admin.auth(app) : null
}

module.exports = {
  initializeFirebaseAdmin,
  getFirebaseAuth
}
