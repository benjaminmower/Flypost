const QRCode = require('qrcode')

QRCode.toFile('flypost-qr.svg', 'https://presence.goflypost.com', {
  errorCorrectionLevel: 'H',
  margin: 2,
  width: 1000,
  type: 'svg'
})
