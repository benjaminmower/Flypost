const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const MAX_EDGE = 1800
const JPEG_QUALITY = 0.82

export async function validateAndCompressImage(file) {
  if (!file) throw new Error('Choose an image first.')
  if (!file.type.startsWith('image/')) throw new Error('Choose a valid image file.')

  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) throw new Error('The selected file could not be decoded as an image.')

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  if (!blob) throw new Error('Could not prepare the image for upload.')
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error('Image is still larger than 5MB after compression.')

  const name = file.name?.replace(/\.[^.]+$/, '') || 'flyer'
  return new File([blob], `${name}.jpg`, { type: 'image/jpeg' })
}

export function imagePreviewUrl(file) {
  return file ? URL.createObjectURL(file) : ''
}
