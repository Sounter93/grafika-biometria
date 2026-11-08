import { ImageBuffer } from './imageBuffer.ts'

// wczytanie pliku (png, jpg...) do naszego bufora
export function loadImageFile(file: File): Promise<ImageBuffer> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const buf = ImageBuffer.fromImageData(ctx.getImageData(0, 0, canvas.width, canvas.height))
      URL.revokeObjectURL(url)

      // przezroczyste miejsca robimy białe, żeby dalej nie martwić się kanałem alfa
      const d = buf.data
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3] / 255
        if (a < 1) {
          d[i] = d[i] * a + 255 * (1 - a)
          d[i + 1] = d[i + 1] * a + 255 * (1 - a)
          d[i + 2] = d[i + 2] * a + 255 * (1 - a)
          d[i + 3] = 255
        }
      }
      resolve(buf)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Nie udało się wczytać obrazu'))
    }
    img.src = url
  })
}

// pokazanie bufora na canvasie
export function showBuffer(canvas: HTMLCanvasElement, buf: ImageBuffer) {
  if (canvas.width !== buf.width) canvas.width = buf.width
  if (canvas.height !== buf.height) canvas.height = buf.height
  canvas.getContext('2d')!.putImageData(buf.imageData, 0, 0)
}

// zapis bufora jako plik png
export function saveImage(buf: ImageBuffer, fileName: string) {
  const canvas = document.createElement('canvas')
  showBuffer(canvas, buf)
  canvas.toBlob((blob) => {
    if (!blob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = fileName
    a.click()
    URL.revokeObjectURL(a.href)
  }, 'image/png')
}
