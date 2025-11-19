//v12

const express = require('express')
const cors = require('cors')
const createForward = require('./src/forward')

const app = express()

const allowedOrigins = [
  process.env.FRONTEND_ORIGIN || 'https://flypost.netlify.app',
  'https://app.goflypost.com',
  'http://localhost:5173'
]

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true)
    return allowedOrigins.includes(origin)
      ? cb(null, true)
      : cb(new Error('Not allowed by CORS: ' + origin))
  },
  credentials: true
}))

app.use(express.json({ limit: '1mb' }))

app.use((req, _res, next) => {
  console.log('proxy incoming:', req.method, req.originalUrl)
  next()
})

const forward = createForward()

app.get('/', (req, res) => {
  res.status(200).json({ status: 'proxy running' })
})

app.get('/health', forward)
app.get('/v1/events/near', forward)
app.post('/api/parse-and-publish', forward)
app.use('/api', forward)

const PORT = parseInt(process.env.PORT || '8080', 10)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Proxy listening on http://0.0.0.0:${PORT}`)
})
