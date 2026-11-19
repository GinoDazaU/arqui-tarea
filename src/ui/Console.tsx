import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Simulator } from '../hooks/useSimulator'
import { Panel } from './Panel'

export function Console({ sim }: { sim: Simulator }) {
  const { log, clearLog, submitInput, cpu } = sim
  const [line, setLine] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const waiting = cpu.status === 'waiting-input'

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [log])

  useEffect(() => {
    if (waiting) inputRef.current?.focus()
  }, [waiting])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    submitInput(line)
    setLine('')
  }

  return (
    <Panel
      title="Console"
      className="area-console"
      actions={
        <button className="btn btn-small btn-ghost" onClick={clearLog}>
          Clear
        </button>
      }
    >
      <div className="console">
        {log.map((entry, i) => (
          <div key={i} className={`log log-${entry.kind}`}>
            {entry.kind === 'input' ? `> ${entry.text}` : entry.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className={`console-input ${waiting ? 'waiting' : ''}`} onSubmit={submit}>
        <span className="prompt">{waiting ? 'input ›' : '›'}</span>
        <input
          ref={inputRef}
          value={line}
          onChange={(e) => setLine(e.target.value)}
          placeholder={waiting ? 'The program is waiting for input…' : 'Input for read_int / read_string ecalls'}
          aria-label="Program input"
        />
      </form>
    </Panel>
  )
}
