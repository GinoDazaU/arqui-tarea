import { decode, type Instruction } from './decoder'

export const ABI_NAMES = [
  'zero', 'ra', 'sp', 'gp', 'tp', 't0', 't1', 't2', 's0', 's1', 'a0', 'a1', 'a2', 'a3', 'a4', 'a5',
  'a6', 'a7', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 't3', 't4', 't5', 't6',
]

export const hex = (value: number, digits = 8) => '0x' + (value >>> 0).toString(16).padStart(digits, '0')

/** Formats one instruction in assembly syntax; branch/jump targets are absolute and resolved to labels when known. */
export function formatInstruction(ins: Instruction, pc: number, labels?: Map<number, string>): string {
  const r = (i: number) => ABI_NAMES[i]
  const target = (offset: number) => {
    const addr = (pc + offset) >>> 0
    return labels?.get(addr) ?? hex(addr, 0)
  }
  const { name, rd, rs1, rs2, imm } = ins

  switch (ins.format) {
    case 'R':
      return `${name} ${r(rd)}, ${r(rs1)}, ${r(rs2)}`
    case 'U':
      return `${name} ${r(rd)}, ${hex(imm >>> 12, 0)}`
    case 'J':
      return `${name} ${r(rd)}, ${target(imm)}`
    case 'B':
      return `${name} ${r(rs1)}, ${r(rs2)}, ${target(imm)}`
    case 'S':
      return `${name} ${r(rs2)}, ${imm}(${r(rs1)})`
    case 'I':
      if (name === 'ecall' || name === 'ebreak' || name === 'fence') return name
      if (name.startsWith('l') || name === 'jalr') return `${name} ${r(rd)}, ${imm}(${r(rs1)})`
      return `${name} ${r(rd)}, ${r(rs1)}, ${imm}`
  }
}

export function disassemble(word: number, pc: number, labels?: Map<number, string>): string {
  try {
    return formatInstruction(decode(word), pc, labels)
  } catch {
    return `.word ${hex(word)}`
  }
}
