import { useState } from 'react'
import { ABI_NAMES, hex } from '../core/disassembler'
import type { Simulator } from '../hooks/useSimulator'
import { Panel } from './Panel'

type Format = 'hex' | 'dec' | 'udec'

const show = (v: number, f: Format) => (f === 'hex' ? hex(v) : f === 'dec' ? String(v | 0) : String(v >>> 0))

export function Registers({ sim }: { sim: Simulator }) {
  const { cpu, prevRegs } = sim
  const [format, setFormat] = useState<Format>('hex')

  return (
    <Panel
      title="Registers"
      className="area-regs"
      actions={
        <div className="segmented">
          {(['hex', 'dec', 'udec'] as Format[]).map((f) => (
            <button key={f} className={f === format ? 'on' : ''} onClick={() => setFormat(f)}>
              {f}
            </button>
          ))}
        </div>
      }
    >
      <div className="pc-row">
        <span className="reg-name">pc</span>
        <span className="pc-value">{hex(cpu.pc)}</span>
        <span className="muted small">{cpu.steps} steps</span>
      </div>
      <div className="regs">
        {ABI_NAMES.map((name, i) => {
          const value = cpu.regs[i]
          const changed = value !== prevRegs[i]
          const last = cpu.lastRegWrite === i
          return (
            <div key={i} className={`reg ${changed ? 'changed' : ''} ${last ? 'last' : ''} ${value === 0 ? 'zero' : ''}`}>
              <span className="reg-x">x{i}</span>
              <span className="reg-name">{name}</span>
              <span className="reg-val">{show(value, format)}</span>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
