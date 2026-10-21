import jsQR from 'jsqr'
self.onmessage = ({ data }) => {
  const rgba = new Uint8ClampedArray(data.rgba)
  try {
    const found = jsQR(rgba, data.width, data.height, { inversionAttempts: 'attemptBoth' })
    self.postMessage({ id: data.id, text: found?.data || '' })
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message })
  }
}
