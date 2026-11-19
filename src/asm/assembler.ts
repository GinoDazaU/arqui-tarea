import { BASE_MNEMONICS, encode } from './encoder'
import { AsmError, evaluate, parse, parseString, type EvalContext, type Statement } from './parser'
import { expand, instrSize, PSEUDO_MNEMONICS } from './pseudo'

export { AsmError }

type Section = 'text' | 'data'

export interface Program {
  bytes: Uint8Array
  /** Address -> source line for every emitted instruction. */
  lineOf: Map<number, number>
  symbols: Map<string, number>
  textEnd: number
  dataStart: number
}

export type AssembleResult = { ok: true; program: Program } | { ok: false; errors: AsmError[] }

interface Placed {
  stmt: Statement
  section: Section
  offset: number
  size: number
}

const DATA_ALIGN = 16
const align = (v: number, a: number) => Math.ceil(v / a) * a
const IGNORED = new Set(['.globl', '.global', '.type', '.size', '.file', '.option', '.attribute', '.p2align'])

function sectionOf(stmt: Statement): Section | null {
  if (stmt.op === '.text') return 'text'
  if (stmt.op === '.data' || stmt.op === '.rodata' || stmt.op === '.bss') return 'data'
  if (stmt.op === '.section') return /text/.test(stmt.args[0] ?? '') ? 'text' : 'data'
  return null
}

function dataSize(stmt: Statement, offset: number, ctx: EvalContext): number {
  const { op, args, line } = stmt
  switch (op) {
    case '.word': return 4 * args.length
    case '.half': case '.short': return 2 * args.length
    case '.byte': return args.length
    case '.ascii': return args.reduce((n, a) => n + parseString(a, line).length, 0)
    case '.asciz': case '.string': return args.reduce((n, a) => n + parseString(a, line).length + 1, 0)
    case '.space': case '.zero': case '.skip': return evaluate(args[0] ?? '0', ctx)
    case '.align': return align(offset, 1 << evaluate(args[0] ?? '2', ctx)) - offset
    case '.balign': return align(offset, evaluate(args[0] ?? '4', ctx)) - offset
  }
  throw new AsmError(`Unknown directive "${op}"`, line)
}

function emitData(stmt: Statement, out: Uint8Array, addr: number, ctx: EvalContext): void {
  const put = (value: number, bytes: number) => {
    for (let i = 0; i < bytes; i++) out[addr++] = (value >>> (8 * i)) & 0xff
  }
  const width = { '.word': 4, '.half': 2, '.short': 2, '.byte': 1 }[stmt.op]
  if (width) {
    stmt.args.forEach((a) => put(evaluate(a, ctx), width))
  } else if (['.ascii', '.asciz', '.string'].includes(stmt.op)) {
    for (const a of stmt.args) {
      for (const c of new TextEncoder().encode(parseString(a, stmt.line))) out[addr++] = c
      if (stmt.op !== '.ascii') out[addr++] = 0
    }
  }
}

/** Two-pass assembler: text is placed at 0x0, data right after it (16-byte aligned). */
export function assemble(source: string): AssembleResult {
  const errors: AsmError[] = []
  const symbols = new Map<string, number>()
  const labelSite = new Map<string, { section: Section; offset: number }>()
  const placed: Placed[] = []
  const cursor: Record<Section, number> = { text: 0, data: 0 }
  let section: Section = 'text'

  const guard = (fn: () => void) => {
    try {
      fn()
    } catch (e) {
      if (e instanceof AsmError) errors.push(e)
      else throw e
    }
  }

  for (const stmt of parse(source)) {
    guard(() => {
      for (const label of stmt.labels) {
        if (labelSite.has(label) || symbols.has(label)) throw new AsmError(`Duplicate label "${label}"`, stmt.line)
        labelSite.set(label, { section, offset: cursor[section] })
      }
      if (!stmt.op) return
      const next = sectionOf(stmt)
      if (next) {
        section = next
        return
      }
      const ctx = { symbols, pc: cursor[section], line: stmt.line }
      if (stmt.op === '.equ' || stmt.op === '.set') {
        symbols.set(stmt.args[0], evaluate(stmt.args[1] ?? '', ctx))
        return
      }
      if (IGNORED.has(stmt.op)) return
      let size: number
      if (stmt.op.startsWith('.')) size = dataSize(stmt, cursor[section], ctx)
      else if (BASE_MNEMONICS.has(stmt.op) || PSEUDO_MNEMONICS.has(stmt.op)) size = 4 * instrSize(stmt.op, stmt.args, ctx)
      else throw new AsmError(`Unknown instruction "${stmt.op}"`, stmt.line)
      placed.push({ stmt, section, offset: cursor[section], size })
      cursor[section] += size
    })
  }

  const textEnd = cursor.text
  const dataStart = cursor.data ? align(textEnd, DATA_ALIGN) : textEnd
  const base = (s: Section) => (s === 'text' ? 0 : dataStart)
  labelSite.forEach(({ section: s, offset }, label) => symbols.set(label, base(s) + offset))

  const bytes = new Uint8Array(dataStart + cursor.data)
  const lineOf = new Map<number, number>()

  for (const { stmt, section: s, offset, size } of placed) {
    guard(() => {
      const addr = base(s) + offset
      const ctx = { symbols, pc: addr, line: stmt.line }
      if (stmt.op.startsWith('.')) return emitData(stmt, bytes, addr, ctx)
      const instrs = expand(stmt.op, stmt.args, ctx, size / 4)
      instrs.forEach(([op, args], i) => {
        const pc = addr + 4 * i
        const word = encode(op, args, { ...ctx, pc })
        for (let b = 0; b < 4; b++) bytes[pc + b] = (word >>> (8 * b)) & 0xff
        lineOf.set(pc, stmt.line)
      })
    })
  }

  if (errors.length) return { ok: false, errors: errors.sort((a, b) => a.line - b.line) }
  return { ok: true, program: { bytes, lineOf, symbols, textEnd, dataStart } }
}
