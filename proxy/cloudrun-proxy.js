import express from 'express'
import { GoogleAuth } from 'google-auth-library'

const app = express()
const auth = new GoogleAuth()

const TARGET = process.env.TARGET_URL || 'https://flypostv4-498798854474.us-west1.run.app'
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'https://flypost.netlify.app'

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', FRONTEND_ORIGIN)
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Vary', 'Origin')
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    return res.sendStatus(204)
  }
  next()
})

app.get('/api/health', async (req, res) => {
  try {
    const client = await auth.getIdTokenClient(TARGET)
    const response = await client.request({ url: `${TARGET}/health` })
    res.status(response.status).set('Content-Type', response.headers['content-type'] || 'application/json')
    res.send(response.data)
  } catch (err) {
    console.error('proxy error', err)
    res.status(502).json({ error: 'upstream proxy error' })
  }
})

const PORT = process.env.PORT || 8080
app.listen(PORT, () => console.log(`Proxy listening on ${PORT}`))
