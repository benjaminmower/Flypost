import express from 'express'
import { getEventByIdAny } from '../storage.js'
import { isFirestoreEnabled } from '../firestoreClient.js'
import { extractEventIdFromFpid } from '../utils/shareUrl.js'
import { renderSharePageHtml, render404Page, render500Page } from '../utils/htmlRenderer.js'
import { generateIcsFile } from '../utils/icsGenerator.js'

const router = express.Router()

// GET /e/:slug/:fpid/calendar.ics
router.get('/:slug/:fpid/calendar.ics', async (req, res) => {
  try {
    const { fpid } = req.params

    // Validate fpid format BEFORE storage lookup
    const eventId = extractEventIdFromFpid(fpid)

    if (!eventId) {
      console.log(`⚠️  Invalid fpid format: ${fpid}`)
      return res.status(404).send('Event not found')
    }

    console.log(`📅 Calendar download request: eventId=${eventId}`)

    const useFirestore = isFirestoreEnabled()
    const event = await getEventByIdAny(eventId, useFirestore)

    if (!event) {
      console.log(`⚠️  Event not found: ${eventId}`)
      return res.status(404).send('Event not found')
    }

    const icsContent = generateIcsFile(event)

    res.set('Content-Type', 'text/calendar; charset=utf-8')
    res.set('Content-Disposition', 'attachment; filename="event.ics"')
    res.send(icsContent)
  } catch (error) {
    console.error('❌ Error generating calendar file:', error)
    res.status(500).send('Failed to generate calendar file')
  }
})

// GET /e/:slug/:fpid
router.get('/:slug/:fpid', async (req, res) => {
  try {
    const { fpid } = req.params

    // Validate fpid format BEFORE storage lookup (security + performance)
    const eventId = extractEventIdFromFpid(fpid)

    if (!eventId) {
      console.log(`⚠️  Invalid fpid format: ${fpid}`)
      return res.status(404).send(render404Page())
    }

    console.log(`📄 Share page request: eventId=${eventId}`)

    const useFirestore = isFirestoreEnabled()
    const event = await getEventByIdAny(eventId, useFirestore)

    if (!event) {
      console.log(`⚠️  Event not found: ${eventId}`)
      return res.status(404).send(render404Page())
    }

    // Set cache headers (5min browser, 10min CDN)
    res.set('Cache-Control', 'public, max-age=300, s-maxage=600')
    res.set('Content-Type', 'text/html; charset=utf-8')

    const html = renderSharePageHtml(event)
    res.send(html)
  } catch (error) {
    console.error('❌ Error rendering share page:', error)
    res.status(500).send(render500Page())
  }
})

export default router
