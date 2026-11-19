export interface Segment {
  addr: number
  data: Uint8Array
  executable: boolean
}

export interface ElfImage {
  entry: number
  segments: Segment[]
  symbols: Map<string, number>
}

export class ElfError extends Error {}

export const isElf = (bytes: Uint8Array) =>
  bytes.length >= 4 && bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46

/** Minimal ELF32 little-endian RISC-V loader: PT_LOAD segments plus the symbol table. */
export function parseElf(bytes: Uint8Array): ElfImage {
  if (!isElf(bytes)) throw new ElfError('Not an ELF file')
  if (bytes[4] !== 1 || bytes[5] !== 1) throw new ElfError('Only 32-bit little-endian ELF is supported')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u16 = (o: number) => view.getUint16(o, true)
  const u32 = (o: number) => view.getUint32(o, true)
  if (u16(18) !== 0xf3) throw new ElfError('ELF machine is not RISC-V')

  const entry = u32(24)
  const phoff = u32(28)
  const shoff = u32(32)
  const phentsize = u16(42)
  const phnum = u16(44)
  const shentsize = u16(46)
  const shnum = u16(48)

  const segments: Segment[] = []
  for (let i = 0; i < phnum; i++) {
    const ph = phoff + i * phentsize
    if (u32(ph) !== 1) continue
    const offset = u32(ph + 4)
    const paddr = u32(ph + 12)
    const filesz = u32(ph + 16)
    const memsz = u32(ph + 20)
    const data = new Uint8Array(memsz)
    data.set(bytes.subarray(offset, offset + filesz))
    segments.push({ addr: paddr, data, executable: (u32(ph + 24) & 1) !== 0 })
  }

  const symbols = new Map<string, number>()
  for (let i = 0; i < shnum; i++) {
    const sh = shoff + i * shentsize
    if (u32(sh + 4) !== 2) continue
    const symOff = u32(sh + 16)
    const symSize = u32(sh + 20)
    const strSh = shoff + u32(sh + 24) * shentsize
    const strOff = u32(strSh + 16)
    for (let s = symOff; s + 16 <= symOff + symSize; s += 16) {
      const type = bytes[s + 12] & 0xf
      if (type > 2 || u16(s + 14) === 0) continue
      let name = ''
      for (let p = strOff + u32(s); bytes[p]; p++) name += String.fromCharCode(bytes[p])
      if (name && !name.startsWith('$')) symbols.set(name, u32(s + 4))
    }
  }

  return { entry, segments, symbols }
}
