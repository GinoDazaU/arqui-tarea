import { useEffect, useMemo, useRef } from 'react'
import { disassemble, hex } from '../core/disassembler'
import type { Simulator } from '../hooks/useSimulator'
import { Panel } from './Panel'

interface Props {
  sim: Simulator
}

export function Disassembly({ sim }: Props) {
  const { cpu, program, labels, breakpoints, toggleBreakpoint } = sim
  const listRef = useRef<HTMLDivElement>(null)
  const pc = cpu.pc

  const rows = useMemo(() => {
    if (!program) return []
    const out: { addr: number; word: number; text: string; label?: string; line?: number }[] = []
    for (const [start, end] of program.codeRanges) {
      for (let addr = start; addr < end; addr += 4) {
        const word = cpu.mem.readWord(addr)
        out.push({ addr, word, text: disassemble(word, addr, labels), label: labels.get(addr), line: program.lineOf.get(addr) })
      }
    }
    return out
    // Code is not self-modifying in practice, so rows only depend on the loaded program.
  }, [program, labels, cpu])

  useEffect(() => {
    listRef.current?.querySelector('.is-pc')?.scrollIntoView({ block: 'nearest' })
  }, [pc, rows])

  return (
    <Panel
      title="Disassembly"
      className="area-disasm"
      actions={<span className="muted small">click a row to toggle a breakpoint</span>}
    >
      {!rows.length && <div className="empty">Load or assemble a program to see its machine code.</div>}
      <div className="disasm" ref={listRef}>
        {rows.map((r) => (
          <div key={r.addr}>
            {r.label && <div className="disasm-label">{r.label}:</div>}
            <div
              className={`disasm-row ${r.addr === pc ? 'is-pc' : ''} ${breakpoints.has(r.addr) ? 'is-bp' : ''}`}
              onClick={() => toggleBreakpoint(r.addr)}
            >
              <span className="bp-dot" />
              <span className="d-addr">{hex(r.addr)}</span>
              <span className="d-word">{r.word.toString(16).padStart(8, '0')}</span>
              <span className="d-text">{r.text}</span>
              {r.line && <span className="d-line">L{r.line}</span>}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}
