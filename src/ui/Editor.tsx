import { useEffect, useMemo, useRef, type CSSProperties, type KeyboardEvent } from 'react'
import type { AsmError } from '../asm/parser'
import { BASE_MNEMONICS } from '../asm/encoder'
import { PSEUDO_MNEMONICS } from '../asm/pseudo'
import { ABI_NAMES } from '../core/disassembler'
import { Panel } from './Panel'

interface Props {
  value: string
  onChange: (value: string) => void
  onAssemble: () => void
  dirty: boolean
  errors: AsmError[]
  currentLine: number | null
  breakpointLines: Set<number>
  onToggleLine: (line: number) => void
}

const REGISTER = new RegExp(`^(${[...ABI_NAMES, 'fp'].join('|')}|x([12]?\\d|3[01]))$`)
const TOKEN = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(#.*|\/\/.*)|([A-Za-z_.$][\w.$]*:)|(%\w+|\.?[A-Za-z_$][\w.$]*)|(-?0x[\da-fA-F]+|-?0b[01]+|-?\d+)/g

const LINE_HEIGHT = 20

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function highlight(source: string): string {
  return source
    .split('\n')
    .map((line) => {
      let out = ''
      let last = 0
      for (const m of line.matchAll(TOKEN)) {
        out += escape(line.slice(last, m.index))
        const [text, str, comment, label, word, num] = m
        let cls = ''
        if (str) cls = 'tk-str'
        else if (comment) cls = 'tk-comment'
        else if (label) cls = 'tk-label'
        else if (num) cls = 'tk-num'
        else if (word) {
          const w = word.toLowerCase()
          if (w.startsWith('.') || w.startsWith('%')) cls = 'tk-dir'
          else if (BASE_MNEMONICS.has(w) || PSEUDO_MNEMONICS.has(w)) cls = 'tk-op'
          else if (REGISTER.test(w)) cls = 'tk-reg'
        }
        out += cls ? `<span class="${cls}">${escape(text)}</span>` : escape(text)
        last = m.index! + text.length
      }
      return out + escape(line.slice(last))
    })
    .join('\n')
}

export function Editor({ value, onChange, onAssemble, dirty, errors, currentLine, breakpointLines, onToggleLine }: Props) {
  const html = useMemo(() => highlight(value) + '\n', [value])
  const lines = useMemo(() => value.split('\n').length, [value])
  const errorLines = useMemo(() => new Map(errors.map((e) => [e.line, e.message])), [errors])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const box = scrollRef.current
    if (!box || !currentLine) return
    const top = (currentLine - 1) * LINE_HEIGHT
    if (top < box.scrollTop || top + LINE_HEIGHT > box.scrollTop + box.clientHeight)
      box.scrollTo({ top: top - box.clientHeight / 3, behavior: 'smooth' })
  }, [currentLine])

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const el = e.currentTarget
      const { selectionStart: start, selectionEnd: end } = el
      onChange(value.slice(0, start) + '    ' + value.slice(end))
      requestAnimationFrame(() => el.setSelectionRange(start + 4, start + 4))
    }
  }

  return (
    <Panel
      title="Assembly"
      className="area-editor"
      actions={
        <button className={`btn btn-small ${dirty ? 'btn-accent' : ''}`} onClick={onAssemble} title="Ctrl+Enter">
          {dirty ? 'Assemble & load' : 'Re-assemble'}
        </button>
      }
    >
      <div className="editor-scroll" ref={scrollRef}>
        <div className="editor" style={{ '--lines': lines } as CSSProperties}>
          <div className="gutter" aria-hidden>
            {Array.from({ length: lines }, (_, i) => {
              const n = i + 1
              const cls = [
                n === currentLine && 'is-current',
                breakpointLines.has(n) && 'is-bp',
                errorLines.has(n) && 'is-error',
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <div key={n} className={`gutter-line ${cls}`} onClick={() => onToggleLine(n)} title={errorLines.get(n)}>
                  {n}
                </div>
              )
            })}
          </div>
          <div className="code">
            {currentLine && <div className="line-mark current" style={{ top: `calc(${currentLine - 1} * var(--lh))` }} />}
            {[...errorLines.keys()].map((n) => (
              <div key={n} className="line-mark error" style={{ top: `calc(${n - 1} * var(--lh))` }} />
            ))}
            <pre className="code-layer" dangerouslySetInnerHTML={{ __html: html }} />
            <textarea
              className="code-input"
              value={value}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              wrap="off"
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>
        </div>
      </div>
      {errors.length > 0 && (
        <div className="editor-errors">
          {errors.slice(0, 3).map((e, i) => (
            <div key={i}>
              <b>line {e.line}</b> {e.message}
            </div>
          ))}
          {errors.length > 3 && <div>…and {errors.length - 3} more</div>}
        </div>
      )}
    </Panel>
  )
}
