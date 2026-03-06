import express from 'express'
import { getStorageStats } from '../storage.js'
import { isFirestoreEnabled } from '../firestoreClient.js'

const router = express.Router()

router.get('/', (_req, res) => {
  const stats = getStorageStats()
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '4.0.0-mvp',
    storage: {
      type: isFirestoreEnabled() ? 'hybrid (memory + Firestore)' : 'in-memory',
      events: stats.totalEvents,
      firestore: isFirestoreEnabled()
    },
    uptime: stats.uptime
  })
})

export default router
