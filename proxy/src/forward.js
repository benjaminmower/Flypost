// Robust forwarder for proxy -> backend
// Replaces existing forwarder implementation to preserve path and forward raw response
const { GoogleAuth } = require('google-auth-library')
const url = require('url')

const BACKEND_BASE = (process.env.BACKEND_URL || '').replace(/\/$/, '')
if (!BACKEND_BASE) console.warn('WARNING: BACKEND_URL is not set. Proxy forwarder will not work until BACKEND_URL is set.')

module.exports = function createForwardMiddleware() {
  const auth = new GoogleAuth()

  return async function forwardMiddleware(req, res) {
    if (!BACKEND_BASE) return res.status(500).json({ error: 'proxy backend not configured' })

    const targetUrl = BACKEND_BASE + req.url // preserve path + query
    console.log('proxy forwarding to', targetUrl, 'method=', req.method)

    try {
      const client = await auth.getIdTokenClient(BACKEND_BASE)

      // Build headers - copy request headers but remove hop-by-hop
      const headers = { ...req.headers }
      headers.host = url.parse(BACKEND_BASE).host

      const HOP_BY_HOP = [
        'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
        'te', 'trailer', 'transfer-encoding', 'upgrade', 'accept-encoding'
      ]
      HOP_BY_HOP.forEach(h => delete headers[h])

      // Prepare body if present
      let body = undefined
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (req.body != null) {
          if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
            body = req.body;
          } else {
            body = JSON.stringify(req.body);
            headers['content-type'] = headers['content-type'] || 'application/json';
          }
          headers['content-length'] = Buffer.byteLength(body);
        }
      }

      const backendRes = await client.request({
        url: targetUrl,
        method: req.method,
        headers,
        data: body,
        responseType: 'arraybuffer'
      })

      const buf = Buffer.from(backendRes.data || '')
      const contentType = (backendRes.headers && backendRes.headers['content-type']) || ''
      const snippet = buf.slice(0, 1024).toString('utf8').replace(/\n/g, '\\n')
      console.log(`proxy received from backend status=${backendRes.status} content-type=${contentType} len=${buf.length} snippet="${snippet}"`)

      // Forward safe headers back to client
      Object.entries(backendRes.headers || {}).forEach(([k, v]) => {
        if (!k) return
        const key = k.toLowerCase()
        if (HOP_BY_HOP.includes(key)) return
        try { res.setHeader(k, v) } catch (e) { /* ignore header set errors */ }
      })

      res.status(backendRes.status)
      return res.send(buf)

    } catch (err) {
      console.error('proxy -> backend forward error:', err && err.stack ? err.stack : err)
      return res.status(502).json({ error: 'upstream proxy error', details: err?.message || String(err) })
    }
  }
}
