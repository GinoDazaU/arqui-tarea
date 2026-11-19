export type Mnemonic =
  | 'lui' | 'auipc' | 'jal' | 'jalr'
  | 'beq' | 'bne' | 'blt' | 'bge' | 'bltu' | 'bgeu'
  | 'lb' | 'lh' | 'lw' | 'lbu' | 'lhu'
  | 'sb' | 'sh' | 'sw'
  | 'addi' | 'slti' | 'sltiu' | 'xori' | 'ori' | 'andi' | 'slli' | 'srli' | 'srai'
  | 'add' | 'sub' | 'sll' | 'slt' | 'sltu' | 'xor' | 'srl' | 'sra' | 'or' | 'and'
  | 'fence' | 'ecall' | 'ebreak'

export type Format = 'R' | 'I' | 'S' | 'B' | 'U' | 'J'

export interface Instruction {
  raw: number
  name: Mnemonic
  format: Format
  rd: number
  rs1: number
  rs2: number
  imm: number
}

export class DecodeError extends Error {}

const signExtend = (value: number, bits: number) => (value << (32 - bits)) >> (32 - bits)

export const immI = (raw: number) => raw >> 20
export const immS = (raw: number) => ((raw >> 25) << 5) | ((raw >>> 7) & 0x1f)
export const immB = (raw: number) =>
  signExtend(
    (((raw >>> 31) & 1) << 12) |
      (((raw >>> 7) & 1) << 11) |
      (((raw >>> 25) & 0x3f) << 5) |
      (((raw >>> 8) & 0xf) << 1),
    13,
  )
export const immU = (raw: number) => raw & 0xfffff000
export const immJ = (raw: number) =>
  signExtend(
    (((raw >>> 31) & 1) << 20) |
      (((raw >>> 12) & 0xff) << 12) |
      (((raw >>> 20) & 1) << 11) |
      (((raw >>> 21) & 0x3ff) << 1),
    21,
  )

const BRANCH: Record<number, Mnemonic> = { 0: 'beq', 1: 'bne', 4: 'blt', 5: 'bge', 6: 'bltu', 7: 'bgeu' }
const LOAD: Record<number, Mnemonic> = { 0: 'lb', 1: 'lh', 2: 'lw', 4: 'lbu', 5: 'lhu' }
const STORE: Record<number, Mnemonic> = { 0: 'sb', 1: 'sh', 2: 'sw' }
const OP_IMM: Record<number, Mnemonic> = { 0: 'addi', 2: 'slti', 3: 'sltiu', 4: 'xori', 6: 'ori', 7: 'andi' }
const OP: Record<string, Mnemonic> = {
  '0:0': 'add', '0:32': 'sub', '1:0': 'sll', '2:0': 'slt', '3:0': 'sltu',
  '4:0': 'xor', '5:0': 'srl', '5:32': 'sra', '6:0': 'or', '7:0': 'and',
}

export function decode(raw: number): Instruction {
  raw >>>= 0
  const opcode = raw & 0x7f
  const rd = (raw >>> 7) & 0x1f
  const funct3 = (raw >>> 12) & 0x7
  const rs1 = (raw >>> 15) & 0x1f
  const rs2 = (raw >>> 20) & 0x1f
  const funct7 = raw >>> 25

  const make = (name: Mnemonic | undefined, format: Format, imm: number): Instruction => {
    if (!name) throw new DecodeError(`Invalid instruction 0x${raw.toString(16).padStart(8, '0')}`)
    return { raw, name, format, rd, rs1, rs2, imm }
  }

  switch (opcode) {
    case 0x37: return make('lui', 'U', immU(raw))
    case 0x17: return make('auipc', 'U', immU(raw))
    case 0x6f: return make('jal', 'J', immJ(raw))
    case 0x67: return make(funct3 === 0 ? 'jalr' : undefined, 'I', immI(raw))
    case 0x63: return make(BRANCH[funct3], 'B', immB(raw))
    case 0x03: return make(LOAD[funct3], 'I', immI(raw))
    case 0x23: return make(STORE[funct3], 'S', immS(raw))
    case 0x13: {
      if (funct3 === 1) return make(funct7 === 0 ? 'slli' : undefined, 'I', rs2)
      if (funct3 === 5) {
        const name = funct7 === 0 ? 'srli' : funct7 === 0x20 ? 'srai' : undefined
        return make(name, 'I', rs2)
      }
      return make(OP_IMM[funct3], 'I', immI(raw))
    }
    case 0x33: return make(OP[`${funct3}:${funct7}`], 'R', 0)
    case 0x0f: return make('fence', 'I', 0)
    case 0x73:
      if (raw === 0x00000073) return make('ecall', 'I', 0)
      if (raw === 0x00100073) return make('ebreak', 'I', 1)
      return make(undefined, 'I', 0)
  }
  return make(undefined, 'I', 0)
}
