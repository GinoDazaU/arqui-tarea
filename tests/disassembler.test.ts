import { describe, expect, it } from 'vitest'
import { disassemble } from '../src/core/disassembler'
import { parseElf } from '../src/core/elf'

describe('Disassembler', () => {
  it('formats every instruction format', () => {
    expect(disassemble(0xff718393, 0)).toBe('addi t2, gp, -9')
    expect(disassemble(0x0023e233, 0)).toBe('or tp, t2, sp')
    expect(disassemble(0x0471aa23, 0)).toBe('sw t2, 84(gp)')
    expect(disassemble(0x06002103, 0)).toBe('lw sp, 96(zero)')
    expect(disassemble(0x02728863, 0x18)).toBe('beq t0, t2, 0x48')
    expect(disassemble(0x008001ef, 0x40, new Map([[0x48, 'end']]))).toBe('jal gp, end')
    expect(disassemble(0x000102b7, 0)).toBe('lui t0, 0x10')
    expect(disassemble(0x00000073, 0)).toBe('ecall')
    expect(disassemble(0xffffffff, 0)).toBe('.word 0xffffffff')
  })
})

describe('ELF loader', () => {
  it('loads PT_LOAD segments and the entry point', () => {
    const bytes = new Uint8Array(0x60)
    const v = new DataView(bytes.buffer)
    bytes.set([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1])
    v.setUint16(18, 0xf3, true)
    v.setUint32(24, 0x100, true)
    v.setUint32(28, 0x34, true)
    v.setUint16(42, 32, true)
    v.setUint16(44, 1, true)
    v.setUint32(0x34, 1, true) // PT_LOAD
    v.setUint32(0x38, 0x54, true) // offset
    v.setUint32(0x40, 0x100, true) // paddr
    v.setUint32(0x44, 4, true) // filesz
    v.setUint32(0x48, 8, true) // memsz
    v.setUint32(0x4c, 5, true) // flags R+X
    v.setUint32(0x54, 0x00500113, true)

    const elf = parseElf(bytes)
    expect(elf.entry).toBe(0x100)
    expect(elf.segments).toHaveLength(1)
    expect(elf.segments[0].addr).toBe(0x100)
    expect([...elf.segments[0].data]).toEqual([0x13, 0x01, 0x50, 0x00, 0, 0, 0, 0])
  })
})
