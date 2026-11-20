import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSimulator } from './hooks/useSimulator'
import { BLANK_ID, BLANK_SOURCE, SAMPLES } from './programs'
import { Console } from './ui/Console'
import { Disassembly } from './ui/Disassembly'
import { Editor } from './ui/Editor'
import { MemoryView } from './ui/MemoryView'
import { Registers } from './ui/Registers'
import { Toolbar } from './ui/Toolbar'

export default function App() {
  const sim = useSimulator()
  const [sampleId, setSampleId] = useState(SAMPLES[0].id)
  const [source, setSource] = useState(SAMPLES[0].source)
  const sample = SAMPLES.find((s) => s.id === sampleId)
  const { cpu, program } = sim

  const loadSample = useCallback(
    (id: string) => {
      setSampleId(id)
      if (id === BLANK_ID) {
        setSource(BLANK_SOURCE)
        sim.assembleSource(BLANK_SOURCE, 'program.s')
        return
      }
      const s = SAMPLES.find((x) => x.id === id)
      if (!s) return
      setSource(s.source)
      sim.assembleSource(s.source, `${s.id}.s`)
    },
    [sim],
  )

  const assembleCurrent = useCallback(() => {
    sim.assembleSource(source, sample ? `${sample.id}.s` : 'program.s')
  }, [sim, source, sample])

  useEffect(() => {
    loadSample(SAMPLES[0].id)
  }, [])

  useEffect(() => {
    if (program && program.kind !== 'asm')
      setSource(`# Running "${program.name}" (${program.kind}) directly from machine code.\n# See the disassembly panel. Write assembly here and press "Assemble & load" to replace it.\n`)
  }, [program])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        assembleCurrent()
      } else if (e.key === 'F5') {
        e.preventDefault()
        sim.toggleRun()
      } else if (e.key === 'F10' || (!typing && e.key.toLowerCase() === 's')) {
        e.preventDefault()
        sim.step()
      } else if (!typing && e.key.toLowerCase() === 'r') {
        sim.reset()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sim, assembleCurrent])

  const download = () => {
    const data = program?.segments[0]?.data
    if (!data) return
    const url = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }))
    const a = document.createElement('a')
    a.href = url
    a.download = program.name.replace(/\.s$/, '') + '.bin'
    a.click()
    URL.revokeObjectURL(url)
  }

  const isAsm = program?.kind === 'asm'
  const dirty = !isAsm || program.source !== source
  const currentLine = isAsm && !dirty ? (program.lineOf.get(cpu.pc) ?? null) : null

  const breakpointLines = useMemo(() => {
    const lines = new Set<number>()
    if (isAsm) sim.breakpoints.forEach((addr) => lines.add(program.lineOf.get(addr) ?? -1))
    return lines
  }, [isAsm, program, sim.breakpoints])

  const toggleLine = (line: number) => {
    if (!isAsm || dirty) return
    for (const [addr, l] of program.lineOf) {
      if (l === line) return sim.toggleBreakpoint(addr)
    }
  }

  const output = sim.log.filter((e) => e.kind === 'out').map((e) => e.text).join('')
  const fromSample = !!sample && isAsm && program.source === sample.source
  const verified = fromSample && sample.check(cpu, output)
  const finished = !cpu.running

  return (
    <div className="app">
      <Toolbar sim={sim} sampleId={sampleId} onSample={loadSample} onDownload={download} />

      <div className="info-strip">
        <div className="info-main">
          <span className="info-name">{program?.name ?? 'No program loaded'}</span>
          <span className="info-desc">
            {fromSample
              ? sample.description
              : isAsm
                ? 'Assembly program, loaded at 0x0'
                : program
                  ? `${program.kind === 'elf' ? 'ELF executable' : 'Raw binary'}, entry 0x${program.entry.toString(16)}`
                  : ''}
          </span>
        </div>
        {fromSample && (
          <div className={`verdict ${verified ? 'ok' : finished ? 'bad' : ''}`}>
            <span className="verdict-label">{verified ? '✓ Expected result' : finished ? '✗ Expected' : 'Expected'}</span>
            <span>{sample.expected}</span>
          </div>
        )}
      </div>

      <main className="workspace">
        <Editor
          value={source}
          onChange={setSource}
          onAssemble={assembleCurrent}
          dirty={dirty}
          errors={sim.errors}
          currentLine={currentLine}
          breakpointLines={breakpointLines}
          onToggleLine={toggleLine}
        />
        <Disassembly sim={sim} />
        <Registers sim={sim} />
        <MemoryView sim={sim} focus={fromSample ? sample.memoryAddr : 0} />
        <Console sim={sim} />
      </main>
    </div>
  )
}
