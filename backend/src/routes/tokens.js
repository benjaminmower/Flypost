import express from 'express'
import crypto from 'crypto'
import { verifyIdToken } from '../utils/firebaseAdmin.js'
import { getFirestoreClient } from '../firestoreClient.js'

const router = express.Router()

/**
 * POST /v1/tokens/generate
 * Requires: Authorization: Bearer <firebase_id_token>
 * Idempotent — returns existing token if one already exists for the uid.
 * Stores token in Firestore tokens/{uid}.
 *
 * Note: A Firestore index on tokens.token (ASC) is required for write-token
 * lookups in publish.js. Create it in the Firebase console or firestore.indexes.json.
 */
router.post('/generate', async (req, res) => {
  const authHeader = req.get('authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing Authorization: Bearer <firebase_id_token>' })
  }

  let uid, email
  try {
    ;({ uid, email } = await verifyIdToken(authHeader.slice(7)))
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired Firebase ID token' })
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
