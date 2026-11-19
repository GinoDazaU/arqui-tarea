import { AsmError, evaluate, type EvalContext } from './parser'

export type BaseInstr = [op: string, args: string[]]

const fitsI = (v: number) => v >= -2048 && v <= 2047
const hi = (v: number) => String(((v + 0x800) >>> 12) & 0xfffff)
const lo = (v: number) => String((v << 20) >> 20)

const SIMPLE: Record<string, (a: string[]) => BaseInstr[]> = {
  nop: () => [['addi', ['zero', 'zero', '0']]],
  mv: ([rd, rs]) => [['addi', [rd, rs, '0']]],
  not: ([rd, rs]) => [['xori', [rd, rs, '-1']]],
  neg: ([rd, rs]) => [['sub', [rd, 'zero', rs]]],
  seqz: ([rd, rs]) => [['sltiu', [rd, rs, '1']]],
  snez: ([rd, rs]) => [['sltu', [rd, 'zero', rs]]],
  sltz: ([rd, rs]) => [['slt', [rd, rs, 'zero']]],
  sgtz: ([rd, rs]) => [['slt', [rd, 'zero', rs]]],
  beqz: ([rs, t]) => [['beq', [rs, 'zero', t]]],
  bnez: ([rs, t]) => [['bne', [rs, 'zero', t]]],
  blez: ([rs, t]) => [['bge', ['zero', rs, t]]],
  bgez: ([rs, t]) => [['bge', [rs, 'zero', t]]],
  bltz: ([rs, t]) => [['blt', [rs, 'zero', t]]],
  bgtz: ([rs, t]) => [['blt', ['zero', rs, t]]],
  bgt: ([a, b, t]) => [['blt', [b, a, t]]],
  ble: ([a, b, t]) => [['bge', [b, a, t]]],
  bgtu: ([a, b, t]) => [['bltu', [b, a, t]]],
  bleu: ([a, b, t]) => [['bgeu', [b, a, t]]],
  j: ([t]) => [['jal', ['zero', t]]],
  jr: ([rs]) => [['jalr', ['zero', `0(${rs})`]]],
  ret: () => [['jalr', ['zero', '0(ra)']]],
  call: ([t]) => [['jal', ['ra', t]]],
  tail: ([t]) => [['jal', ['zero', t]]],
}

const ARITY: Record<string, number> = { nop: 0, ret: 0, j: 1, jr: 1, call: 1, tail: 1, li: 2, la: 2 }
const arity = (op: string) => ARITY[op] ?? (/^b(gt|le)u?$/.test(op) ? 3 : 2)

export const PSEUDO_MNEMONICS = new Set([...Object.keys(SIMPLE), 'li', 'la'])

/** Number of words a statement occupies; must be decidable before all labels are known. */
export function instrSize(op: string, args: string[], ctx: EvalContext): number {
  if (op === 'la') return 2
  if (op === 'li') {
    try {
      return fitsI(evaluate(args[1] ?? '', ctx)) ? 1 : 2
    } catch {
      return 2
    }
  }
  return 1
}

/** Expands pseudo-instructions (and 1-operand jal/jalr) into base instructions. */
export function expand(op: string, args: string[], ctx: EvalContext, size: number): BaseInstr[] {
  if (PSEUDO_MNEMONICS.has(op) && args.length !== arity(op))
    throw new AsmError(`"${op}" expects ${arity(op)} operand(s), got ${args.length}`, ctx.line)
  if (op === 'li') {
    const v = evaluate(args[1], ctx)
    if (size === 1) return [['addi', [args[0], 'zero', String(v)]]]
    return [['lui', [args[0], hi(v)]], ['addi', [args[0], args[0], lo(v)]]]
  }
  if (op === 'la') {
    const off = evaluate(args[1], ctx) - ctx.pc
    return [['auipc', [args[0], hi(off)]], ['addi', [args[0], args[0], lo(off)]]]
  }
  if (op === 'jal' && args.length === 1) return [['jal', ['ra', args[0]]]]
  if (op === 'jalr' && args.length === 1) return [['jalr', ['ra', `0(${args[0]})`]]]
  const simple = SIMPLE[op]
  return simple ? simple(args) : [[op, args]]
}
