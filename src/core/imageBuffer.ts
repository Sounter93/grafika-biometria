// Obraz w pamięci: piksele RGBA, 4 bajty na jeden piksel
export class ImageBuffer {
  width: number
  height: number
  imageData: ImageData
  data: Uint8ClampedArray

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.imageData = new ImageData(width, height)
    this.data = this.imageData.data
  }

  static fromImageData(img: ImageData): ImageBuffer {
    const buf = new ImageBuffer(img.width, img.height)
    buf.data.set(img.data)
    return buf
  }

  clone(): ImageBuffer {
    const buf = new ImageBuffer(this.width, this.height)
    buf.data.set(this.data)
    return buf
  }

  // ustawia jeden piksel, jak jest poza obrazem to nic nie robi
  setPixel(x: number, y: number, r: number, g: number, b: number) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    const i = (y * this.width + x) * 4
    this.data[i] = r
    this.data[i + 1] = g
    this.data[i + 2] = b
    this.data[i + 3] = 255
  }

  // cały obraz na jeden kolor
  fill(r: number, g: number, b: number) {
    const d = this.data
    for (let i = 0; i < d.length; i += 4) {
      d[i] = r
      d[i + 1] = g
      d[i + 2] = b
      d[i + 3] = 255
    }
  }
}
