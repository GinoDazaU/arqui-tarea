const PAGE_BITS = 12
const PAGE_SIZE = 1 << PAGE_BITS
const PAGE_MASK = PAGE_SIZE - 1

/** Flat 32-bit byte-addressable little-endian memory, allocated lazily in 4 KiB pages. */
export class Memory {
  private pages = new Map<number, Uint8Array>()

  private page(addr: number, create: boolean): Uint8Array | undefined {
    const key = addr >>> PAGE_BITS
    let page = this.pages.get(key)
    if (!page && create) {
      page = new Uint8Array(PAGE_SIZE)
      this.pages.set(key, page)
    }
    return page
  }

  readByte(addr: number): number {
    addr >>>= 0
    return this.page(addr, false)?.[addr & PAGE_MASK] ?? 0
  }

  writeByte(addr: number, value: number): void {
    addr >>>= 0
    this.page(addr, true)![addr & PAGE_MASK] = value & 0xff
  }

  readHalf(addr: number): number {
    return this.readByte(addr) | (this.readByte(addr + 1) << 8)
  }

  writeHalf(addr: number, value: number): void {
    this.writeByte(addr, value)
    this.writeByte(addr + 1, value >>> 8)
  }

  readWord(addr: number): number {
    return (
      (this.readByte(addr) |
        (this.readByte(addr + 1) << 8) |
        (this.readByte(addr + 2) << 16) |
        (this.readByte(addr + 3) << 24)) >>>
      0
    )
  }

  writeWord(addr: number, value: number): void {
    for (let i = 0; i < 4; i++) this.writeByte(addr + i, value >>> (8 * i))
  }

  load(bytes: Uint8Array, base = 0): void {
    bytes.forEach((b, i) => this.writeByte(base + i, b))
  }

  readBytes(addr: number, length: number): Uint8Array {
    const out = new Uint8Array(length)
    for (let i = 0; i < length; i++) out[i] = this.readByte(addr + i)
    return out
  }

  clear(): void {
    this.pages.clear()
  }
}
