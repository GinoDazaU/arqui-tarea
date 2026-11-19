import { useEffect, useState, type FormEvent } from 'react'
import { evaluate } from '../asm/parser'
import { ABI_NAMES, hex } from '../core/disassembler'
import type { Simulator } from '../hooks/useSimulator'
import { Panel } from './Panel'

const ROW = 16
const ROWS = 16
const PAGE = ROW * ROWS

type View = 'bytes' | 'words'

interface Props {
  sim: Simulator
  focus: number
}

export function MemoryView({ sim, focus }: Props) {
  const { cpu, program } = sim
  const [base, setBase] = useState(focus & ~(ROW - 1))
  const [query, setQuery] = useState(hex(focus))
  const [view, setView] = useState<View>('words')
  const [error, setError] = useState('')

  useEffect(() => {
    setBase(focus & ~(ROW - 1))
    setQuery(hex(focus))
  }, [focus, program])

  const go = (addr: number) => {
    const aligned = (addr >>> 0) & ~(ROW - 1)
    setBase(aligned >>> 0)
    setQuery(hex(addr))
    setError('')
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    try {
      const symbols = new Map(program?.symbols)
      cpu.regs.forEach((v, i) => {
        symbols.set(ABI_NAMES[i], v >>> 0)
        symbols.set(`x${i}`, v >>> 0)
      })
      symbols.set('pc', cpu.pc)
      go(evaluate(query, { symbols, pc: cpu.pc, line: 0 }))
    } catch {
      setError('Invalid address')
    }
  }

  const written = cpu.lastMemWrite
  const isWritten = (addr: number) => !!written && addr >= written.addr && addr < written.addr + written.size
  const isPc = (addr: number) => addr >= cpu.pc && addr < cpu.pc + 4
  const isSp = (addr: number) => addr >= cpu.regs[2] >>> 0 && addr < (cpu.regs[2] >>> 0) + 4

  const cellClass = (addr: number) =>
    `cell ${isWritten(addr) ? 'written' : ''} ${isPc(addr) ? 'pc' : ''} ${isSp(addr) ? 'sp' : ''}`

  const shortcuts: [string, number][] = [
    ['0x0', 0],
    ['0x1000', 0x1000],
    ['pc', cpu.pc],
    ['sp', cpu.regs[2] >>> 0],
  ]
  if (written) shortcuts.push(['last write', written.addr])

  return (
    <Panel
      title="Memory"
      className="area-memory"
      actions={
        <div className="segmented">
          {(['bytes', 'words'] as View[]).map((v) => (
            <button key={v} className={v === view ? 'on' : ''} onClick={() => setView(v)}>
              {v}
            </button>
          ))}
        </div>
      }
    >
      <div className="mem-toolbar">
        <form onSubmit={submit} className="mem-goto">
          <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Address" placeholder="0x1000, label, sp+8" />
          <button className="btn btn-small">Go</button>
        </form>
        <button className="btn btn-small btn-ghost" onClick={() => go((base - PAGE) >>> 0)} aria-label="Previous page">
          ‹
        </button>
        <button className="btn btn-small btn-ghost" onClick={() => go((base + PAGE) >>> 0)} aria-label="Next page">
          ›
        </button>
        <div className="chips">
          {shortcuts.map(([label, addr]) => (
            <button key={label} className="chip" onClick={() => go(addr)}>
              {label}
            </button>
          ))}
        </div>
        {error && <span className="error-text">{error}</span>}
      </div>
      <div className="mem-grid">
        <div className="mem-row mem-head">
          <span className="m-addr">address</span>
          <span className="m-cells">
            {view === 'bytes'
              ? Array.from({ length: ROW }, (_, i) => <span key={i} className="cell">{`+${i.toString(16)}`}</span>)
              : Array.from({ length: ROW / 4 }, (_, i) => <span key={i} className="cell wide">{`+${(i * 4).toString(16)}`}</span>)}
          </span>
          <span className="m-ascii">ascii</span>
        </div>
        {Array.from({ length: ROWS }, (_, r) => {
          const rowAddr = (base + r * ROW) >>> 0
          const bytes = cpu.mem.readBytes(rowAddr, ROW)
          return (
            <div key={rowAddr} className="mem-row">
              <span className="m-addr">{hex(rowAddr)}</span>
              <span className="m-cells">
                {view === 'bytes'
                  ? [...bytes].map((b, i) => (
                      <span key={i} className={`${cellClass(rowAddr + i)} ${b ? '' : 'zero'}`}>
                        {b.toString(16).padStart(2, '0')}
                      </span>
                    ))
                  : Array.from({ length: ROW / 4 }, (_, w) => {
                      const addr = rowAddr + w * 4
                      const value = cpu.mem.readWord(addr)
                      return (
                        <span key={w} className={`${cellClass(addr)} wide ${value ? '' : 'zero'}`} title={String(value | 0)}>
                          {value.toString(16).padStart(8, '0')}
                        </span>
                      )
                    })}
              </span>
              <span className="m-ascii">
                {[...bytes].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '·')).join('')}
              </span>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
