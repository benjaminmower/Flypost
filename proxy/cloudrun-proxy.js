// Mount the forward middleware and add request logging
const express = require('express')
const bodyParser = require('body-parser')
const createForward = require('./src/forward')

const app = express()
app.use(bodyParser.json({ limit: '1mb' }))

app.use((req, res, next) => {
  console.log('proxy incoming:', req.method, req.originalUrl, 'auth:', !!req.headers.authorization)
  next()
})

// Preserve /api prefix and forward requests to backend
app.use('/api', createForward())

const port = process.env.PORT || 8080
app.listen(port, () => console.log(`Proxy listening on ${port}`))
