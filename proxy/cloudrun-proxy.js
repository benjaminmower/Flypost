const express = require('express')
const bodyParser = require('body-parser')
const createForward = require('./src/forward')

const app = express()
app.use(bodyParser.json({ limit: '1mb' }))

app.use((req, res, next) => {
  console.log('proxy incoming:', req.method, req.originalUrl, 'auth:', !!req.headers.authorization)
  next()
})

app.use('/api', createForward())

app.get('/', (req, res) => res.json({ proxy: 'ok' }))

const port = process.env.PORT || 8080
app.listen(port, () => console.log(`Proxy listening on ${port}`))
