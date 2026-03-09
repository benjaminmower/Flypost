import express from 'express'
import crypto from 'crypto'
import { getFirestoreClient } from '../firestoreClient.js'

const router = express.Router()

/**
 * POST /v1/tokens/generate
 * Called from the browser (post.goflypost.com) with a valid Firebase session.
 * The proxy (forward.js) verifies the Firebase ID token and injects:
 *   x-flypost-auth-provider: 'firebase'
 *   x-flypost-auth-uid: <uid>
 *   x-flypost-auth-email: <email>
 * The Authorization header is stripped by the proxy before reaching here.
 *
 * Idempotent — returns existing token if one already exists for the uid.
 * Stores token in Firestore tokens/{uid}.
 *
 * Note: A Firestore index on tokens.token (ASC) is required for write-token
 * lookups in publish.js. Create it in the Firebase console or firestore.indexes.json.
 */
router.post('/generate', async (req, res) => {
  const uid = req.get('x-flypost-auth-uid') || null
  const email = req.get('x-flypost-auth-email') || null

  if (!uid) {
    return res.status(401).json({ success: false, error: 'Firebase authentication required' })
  }

  try {
    const db = getFirestoreClient()
    const docRef = db.collection('tokens').doc(uid)
    const existing = await docRef.get()

    if (existing.exists) {
      return res.json({ success: true, token: existing.data().token })
    }

    const token = crypto.randomBytes(32).toString('hex')
    await docRef.set({ token, uid, email, createdAt: new Date() })
    console.log(`🔑 Generated write token for uid=${uid}`)

    return res.json({ success: true, token })
  } catch (error) {
    console.error('❌ Token generation error:', error)
    return res.status(500).json({ success: false, error: 'Token generation failed' })
  }
})

export default router
