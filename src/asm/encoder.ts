import { ABI_NAMES } from '../core/disassembler'
import { AsmError, evaluate, type EvalContext } from './parser'

const REGISTERS = new Map<string, number>()
ABI_NAMES.forEach((name, i) => {
  REGISTERS.set(name, i)
  REGISTERS.set(`x${i}`, i)
})
REGISTERS.set('fp', 8)

const R: Record<string, [number, number]> = {
  add: [0, 0], sub: [0, 0x20], sll: [1, 0], slt: [2, 0], sltu: [3, 0],
  xor: [4, 0], srl: [5, 0], sra: [5, 0x20], or: [6, 0], and: [7, 0],
}
const I_ALU: Record<string, number> = { addi: 0, slti: 2, sltiu: 3, xori: 4, ori: 6, andi: 7 }
const SHIFT: Record<string, [number, number]> = { slli: [1, 0], srli: [5, 0], srai: [5, 0x20] }
const LOAD: Record<string, number> = { lb: 0, lh: 1, lw: 2, lbu: 4, lhu: 5 }
const STORE: Record<string, number> = { sb: 0, sh: 1, sw: 2 }
const BRANCH: Record<string, number> = { beq: 0, bne: 1, blt: 4, bge: 5, bltu: 6, bgeu: 7 }

export const BASE_MNEMONICS = new Set([
  ...Object.keys(R), ...Object.keys(I_ALU), ...Object.keys(SHIFT), ...Object.keys(LOAD),
  ...Object.keys(STORE), ...Object.keys(BRANCH), 'lui', 'auipc', 'jal', 'jalr', 'ecall', 'ebreak', 'fence',
])

const encR = (f7: number, rs2: number, rs1: number, f3: number, rd: number, op: number) =>
  ((f7 << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | op) >>> 0
const encI = (imm: number, rs1: number, f3: number, rd: number, op: number) =>
  (((imm & 0xfff) << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | op) >>> 0
const encS = (imm: number, rs2: number, rs1: number, f3: number, op: number) =>
  ((((imm >> 5) & 0x7f) << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | ((imm & 0x1f) << 7) | op) >>> 0
const encB = (imm: number, rs2: number, rs1: number, f3: number) =>
  ((((imm >> 12) & 1) << 31) | (((imm >> 5) & 0x3f) << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) |
    (((imm >> 1) & 0xf) << 8) | (((imm >> 11) & 1) << 7) | 0x63) >>> 0
const encJ = (imm: number, rd: number) =>
  ((((imm >> 20) & 1) << 31) | (((imm >> 1) & 0x3ff) << 21) | (((imm >> 11) & 1) << 20) |
    (((imm >> 12) & 0xff) << 12) | (rd << 7) | 0x6f) >>> 0

/** Encodes one base RV32I instruction whose operands are still text. */
export function encode(op: string, args: string[], ctx: EvalContext): number {
  const fail = (msg: string): never => {
    throw new AsmError(msg, ctx.line)
  }
  const expect = (n: number) => {
    if (args.length !== n) fail(`"${op}" expects ${n} operand(s), got ${args.length}`)
  }
  const reg = (s: string) => REGISTERS.get(s.toLowerCase()) ?? fail(`Unknown register "${s}"`)
  const imm = (s: string, bits: number, signed = true) => {
    const v = evaluate(s, ctx)
    const min = signed ? -(1 << (bits - 1)) : 0
    const max = signed ? (1 << (bits - 1)) - 1 : 2 ** bits - 1
    if (v < min || v > max) fail(`Immediate ${v} out of range [${min}, ${max}]`)
    return v
  }
  const offset = (s: string, bits: number) => {
    const v = evaluate(s, ctx) - ctx.pc
    if (v % 2) fail(`Misaligned target "${s}"`)
    if (v < -(2 ** (bits - 1)) || v >= 2 ** (bits - 1)) fail(`Target "${s}" out of range`)
    return v
  }
  const memOperand = (s: string): [number, number] => {
    const m = s.match(/^(.*)\(\s*(\w+)\s*\)$/)
    if (!m) return fail(`Expected offset(register), got "${s}"`)
    return [m[1].trim() ? imm(m[1], 12) : 0, reg(m[2])]
  }

  if (op in R) {
    expect(3)
    const [f3, f7] = R[op]
    return encR(f7, reg(args[2]), reg(args[1]), f3, reg(args[0]), 0x33)
  }
  if (op in I_ALU) {
    expect(3)
    return encI(imm(args[2], 12), reg(args[1]), I_ALU[op], reg(args[0]), 0x13)
  }
  if (op in SHIFT) {
    expect(3)
    const [f3, f7] = SHIFT[op]
    return encR(f7, imm(args[2], 5, false), reg(args[1]), f3, reg(args[0]), 0x13)
  }
  if (op in LOAD) {
    expect(2)
    const [off, base] = memOperand(args[1])
    return encI(off, base, LOAD[op], reg(args[0]), 0x03)
  }
  if (op in STORE) {
    expect(2)
    const [off, base] = memOperand(args[1])
    return encS(off, reg(args[0]), base, STORE[op], 0x23)
  }
  if (op in BRANCH) {
    expect(3)
    return encB(offset(args[2], 13), reg(args[1]), reg(args[0]), BRANCH[op])
  }
  switch (op) {
    case 'lui':
    case 'auipc':
      expect(2)
      return ((imm(args[1], 20, false) << 12) | (reg(args[0]) << 7) | (op === 'lui' ? 0x37 : 0x17)) >>> 0
    case 'jal':
      expect(2)
      return encJ(offset(args[1], 21), reg(args[0]))
    case 'jalr':
      if (args.length === 2) {
        const [off, base] = memOperand(args[1])
        return encI(off, base, 0, reg(args[0]), 0x67)
      }
      expect(3)
      return encI(imm(args[2], 12), reg(args[1]), 0, reg(args[0]), 0x67)
    case 'ecall':
      expect(0)
      return 0x00000073
    case 'ebreak':
      expect(0)
      return 0x00100073
    case 'fence':
      return 0x0ff0000f
  }
  return fail(`Unknown instruction "${op}"`)
}
