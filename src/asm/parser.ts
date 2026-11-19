export class AsmError extends Error {
  readonly line: number
  constructor(message: string, line: number) {
    super(message)
    this.line = line
  }
}

export interface Statement {
  line: number
  labels: string[]
  op: string
  args: string[]
}

const LABEL = /^([A-Za-z_.$][\w.$]*)\s*:/

function stripComment(text: string): string {
  let quote: string | null = null
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = null
    } else if (c === '"' || c === "'") quote = c
    else if (c === '#' || (c === '/' && text[i + 1] === '/')) return text.slice(0, i)
  }
  return text
}

export function splitArgs(text: string): string[] {
  const args: string[] = []
  let current = ''
  let quote: string | null = null
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      current += c
      if (c === '\\') current += text[++i] ?? ''
      else if (c === quote) quote = null
    } else if (c === '"' || c === "'") {
      quote = c
      current += c
    } else if (c === ',') {
      args.push(current.trim())
      current = ''
    } else current += c
  }
  if (current.trim() || args.length) args.push(current.trim())
  return args
}

/** Splits source into statements: labels plus an optional instruction or directive. */
export function parse(source: string): Statement[] {
  const out: Statement[] = []
  source.split(/\r?\n/).forEach((raw, idx) => {
    let text = stripComment(raw).trim()
    const labels: string[] = []
    let m: RegExpMatchArray | null
    while ((m = text.match(LABEL))) {
      labels.push(m[1])
      text = text.slice(m[0].length).trim()
    }
    if (!text && !labels.length) return
    const space = text.search(/\s/)
    const op = (space < 0 ? text : text.slice(0, space)).toLowerCase()
    const args = space < 0 ? [] : splitArgs(text.slice(space + 1))
    out.push({ line: idx + 1, labels, op, args })
  })
  return out
}

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', '0': '\0', '\\': '\\', '"': '"', "'": "'" }

export function unescape(body: string): string {
  return body.replace(/\\(.)/g, (_, c: string) => ESCAPES[c] ?? c)
}

export function parseString(arg: string, line: number): string {
  const m = arg.match(/^"((?:[^"\\]|\\.)*)"$/)
  if (!m) throw new AsmError(`Expected a string literal, got ${arg}`, line)
  return unescape(m[1])
}

export interface EvalContext {
  symbols: Map<string, number>
  pc: number
  line: number
}

/** Evaluates integer expressions: numbers, chars, symbols, '.', %hi()/%lo(), + - * and parentheses. */
export function evaluate(expr: string, ctx: EvalContext): number {
  const tokens = expr.match(/%\w+|0x[\da-f]+|0b[01]+|\d+|'(?:[^'\\]|\\.)'|[A-Za-z_.$][\w.$]*|[-+*()~]|\S/gi) ?? []
  let pos = 0
  const fail = (msg: string): never => {
    throw new AsmError(msg, ctx.line)
  }

  const primary = (): number => {
    const t = tokens[pos++]
    if (t === undefined) return fail(`Incomplete expression "${expr}"`)
    if (t === '-') return -primary()
    if (t === '+') return primary()
    if (t === '~') return ~primary()
    if (t === '(') {
      const v = sum()
      if (tokens[pos++] !== ')') fail(`Missing ")" in "${expr}"`)
      return v
    }
    if (t.startsWith('%')) {
      if (tokens[pos++] !== '(') fail(`Expected "(" after ${t}`)
      const v = sum()
      if (tokens[pos++] !== ')') fail(`Missing ")" in "${expr}"`)
      if (t === '%hi') return ((v + 0x800) >>> 12) & 0xfffff
      if (t === '%lo') return (v << 20) >> 20
      return fail(`Unknown operator ${t}`)
    }
    if (/^0x/i.test(t)) return parseInt(t.slice(2), 16)
    if (/^0b/i.test(t)) return parseInt(t.slice(2), 2)
    if (/^\d/.test(t)) return parseInt(t, 10)
    if (t.startsWith("'")) return unescape(t.slice(1, -1)).charCodeAt(0)
    if (t === '.') return ctx.pc
    const value = ctx.symbols.get(t)
    if (value === undefined) return fail(`Undefined symbol "${t}"`)
    return value
  }

  const product = (): number => {
    let v = primary()
    while (tokens[pos] === '*') {
      pos++
      v = Math.imul(v, primary())
    }
    return v
  }

  const sum = (): number => {
    let v = product()
    while (tokens[pos] === '+' || tokens[pos] === '-') {
      const op = tokens[pos++]
      v = op === '+' ? v + product() : v - product()
    }
    return v
  }

  const v = sum()
  if (pos !== tokens.length) fail(`Unexpected "${tokens[pos]}" in "${expr}"`)
  return v | 0
}
