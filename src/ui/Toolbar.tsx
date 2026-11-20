import { useRef, useState } from 'react'
import { SPEEDS, type Simulator } from '../hooks/useSimulator'
import { BLANK_ID, SAMPLES } from '../programs'

interface Props {
  sim: Simulator
  sampleId: string
  onSample: (id: string) => void
  onDownload: () => void
}

const STATUS_LABEL = {
  ready: 'Ready',
  halted: 'Finished',
  exited: 'Exited',
  'waiting-input': 'Waiting input',
  error: 'Error',
}

const speedLabel = (s: number) => (s === Infinity ? 'Max' : `${s} ips`)

export function Toolbar({ sim, sampleId, onSample, onDownload }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'light')

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('theme', next)
    } catch {
      /* storage unavailable */
    }
    setTheme(next)
  }
  const { cpu, program, running } = sim
  const status = running ? 'running' : program ? cpu.status : 'empty'
  const canRun = !!program && cpu.running

  const openFile = async (file: File | undefined) => {
    if (!file) return
    sim.loadFile(file.name, new Uint8Array(await file.arrayBuffer()))
    onSample('')
  }

  return (
    <header className="toolbar">
      <div className="brand">
        <div className="logo">RV</div>
        <div>
          <div className="brand-name">RV32I Simulator</div>
          <div className="brand-sub">Base integer ISA, 32-bit</div>
        </div>
      </div>

      <div className="tool-group">
        <select value={sampleId} onChange={(e) => onSample(e.target.value)} aria-label="Sample program">
          <option value="" disabled>
            Sample programs…
          </option>
          <option value={BLANK_ID}>New program (blank)</option>
          {SAMPLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => fileRef.current?.click()} title="Raw .bin (loaded at 0x0) or .elf">
          Open .bin / .elf
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(e) => {
            openFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <button className="btn btn-ghost" onClick={onDownload} disabled={program?.kind !== 'asm'} title="Download the assembled raw binary">
          Download .bin
        </button>
      </div>

      <div className="tool-group controls">
        <button className="btn" onClick={sim.reset} disabled={!program} title="Reset (R)">
          ↺ Reset
        </button>
        <button className="btn" onClick={sim.step} disabled={!canRun || running} title="Step (S / F10)">
          Step
        </button>
        <button className={`btn ${running ? 'btn-warn' : 'btn-accent'}`} onClick={sim.toggleRun} disabled={!canRun} title="Run / Pause (F5)">
          {running ? '❚❚ Pause' : '▶ Run'}
        </button>
        <label className="speed">
          <span>Speed</span>
          <select value={sim.speed} onChange={(e) => sim.setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s, i) => (
              <option key={i} value={i}>
                {speedLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <span className={`status status-${status}`}>
          <i />
          {status === 'running' ? 'Running' : status === 'empty' ? 'No program' : STATUS_LABEL[cpu.status]}
        </span>
        <button
          className="btn btn-ghost theme-toggle"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
    </header>
  )
}
