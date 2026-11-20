import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { assemble, type AsmError } from '../asm/assembler'
import { Cpu } from '../core/cpu'
import { hex } from '../core/disassembler'
import { isElf, parseElf, type Segment } from '../core/elf'

export interface LoadedProgram {
  name: string
  kind: 'asm' | 'bin' | 'elf'
  segments: Segment[]
  entry: number
  symbols: Map<string, number>
  lineOf: Map<number, number>
  codeRanges: [number, number][]
  source?: string
}

export interface ConsoleEntry {
  kind: 'out' | 'info' | 'error' | 'input'
  text: string
}

export const SPEEDS = [1, 5, 25, 100, 1000, Infinity]
const MAX_PER_FRAME = 200_000
const MAX_DISASM_BYTES = 0x4000

export function useSimulator() {
  const inputQueue = useRef<string[]>([])
  const outBuffer = useRef('')
  const cpuRef = useRef<Cpu>(null)
  if (!cpuRef.current) {
    cpuRef.current = new Cpu({
      write: (text) => (outBuffer.current += text),
      readLine: () => inputQueue.current.shift() ?? null,
    })
  }
  const cpu = cpuRef.current

  const [, setVersion] = useState(0)
  const [program, setProgram] = useState<LoadedProgram | null>(null)
  const [errors, setErrors] = useState<AsmError[]>([])
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(SPEEDS.length - 2)
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set())
  const [log, setLog] = useState<ConsoleEntry[]>([])
  const prevRegs = useRef(new Int32Array(32))
  const resumeAfterInput = useRef(false)

  const append = useCallback((kind: ConsoleEntry['kind'], text: string) => {
    const pending = outBuffer.current
    outBuffer.current = ''
    setLog((entries) => {
      const next = [...entries]
      const push = (entry: ConsoleEntry) => {
        const last = next[next.length - 1]
        if (entry.kind === 'out' && last?.kind === 'out') next[next.length - 1] = { kind: 'out', text: last.text + entry.text }
        else next.push(entry)
      }
      if (pending) push({ kind: 'out', text: pending })
      if (text) push({ kind, text })
      return next
    })
  }, [])

  const refresh = useCallback(() => {
    if (outBuffer.current) append('out', '')
    setVersion((v) => v + 1)
  }, [append])

  const reportStop = useCallback(() => {
    if (cpu.status === 'error') append('error', cpu.message)
    else if (cpu.status === 'halted' || cpu.status === 'exited') append('info', `${cpu.message} after ${cpu.steps} instructions`)
    else if (cpu.status === 'waiting-input') append('info', 'Waiting for input…')
  }, [append, cpu])

  const loadInto = useCallback(
    (p: LoadedProgram) => {
      cpu.reset(p.entry)
      for (const seg of p.segments) cpu.mem.load(seg.data, seg.addr)
      prevRegs.current = new Int32Array(32)
      inputQueue.current = []
      outBuffer.current = ''
      resumeAfterInput.current = false
    },
    [cpu],
  )

  const load = useCallback(
    (p: LoadedProgram, message: string) => {
      setRunning(false)
      loadInto(p)
      setProgram(p)
      setBreakpoints(new Set())
      setLog([{ kind: 'info', text: message }])
      refresh()
    },
    [loadInto, refresh],
  )

  const assembleSource = useCallback(
    (source: string, name = 'program.s') => {
      const result = assemble(source)
      if (!result.ok) {
        setErrors(result.errors)
        setRunning(false)
        setLog(result.errors.map((e) => ({ kind: 'error', text: `line ${e.line}: ${e.message}` })))
        return false
      }
      const { bytes, symbols, lineOf, textEnd } = result.program
      setErrors([])
      load(
        {
          name,
          kind: 'asm',
          segments: [{ addr: 0, data: bytes, executable: true }],
          entry: 0,
          symbols,
          lineOf,
          codeRanges: [[0, textEnd]],
          source,
        },
        `Assembled "${name}": ${bytes.length} bytes loaded at 0x00000000`,
      )
      return true
    },
    [load],
  )

  const loadFile = useCallback(
    (name: string, bytes: Uint8Array) => {
      try {
        if (isElf(bytes)) {
          const elf = parseElf(bytes)
          const code = elf.segments.filter((s) => s.executable)
          load(
            {
              name,
              kind: 'elf',
              segments: elf.segments,
              entry: elf.entry,
              symbols: elf.symbols,
              lineOf: new Map(),
              codeRanges: code.map((s) => [s.addr, s.addr + Math.min(s.data.length, MAX_DISASM_BYTES)]),
            },
            `Loaded ELF "${name}": ${elf.segments.length} segment(s), entry ${hex(elf.entry)}`,
          )
        } else {
          load(
            {
              name,
              kind: 'bin',
              segments: [{ addr: 0, data: bytes, executable: true }],
              entry: 0,
              symbols: new Map(),
              lineOf: new Map(),
              codeRanges: [[0, Math.min(bytes.length, MAX_DISASM_BYTES) & ~3]],
            },
            `Loaded raw binary "${name}": ${bytes.length} bytes at 0x00000000`,
          )
        }
        setErrors([])
      } catch (e) {
        append('error', (e as Error).message)
      }
    },
    [append, load],
  )

  const reset = useCallback(() => {
    if (!program) return
    setRunning(false)
    loadInto(program)
    append('info', '— reset —')
    refresh()
  }, [program, loadInto, append, refresh])

  const step = useCallback(() => {
    if (!program || !cpu.running) return
    prevRegs.current = cpu.regs.slice()
    cpu.step()
    if (!cpu.running || cpu.status === 'waiting-input') reportStop()
    refresh()
  }, [program, cpu, reportStop, refresh])

  const toggleRun = useCallback(() => {
    if (!program) return
    if (running) {
      setRunning(false)
      return
    }
    if (!cpu.running) return
    prevRegs.current = cpu.regs.slice()
    setRunning(true)
  }, [program, running, cpu])

  useEffect(() => {
    if (!running) return
    let frame = 0
    let last = performance.now()
    let budget = 0
    let first = true
    const rate = SPEEDS[speed]

    const tick = (now: number) => {
      budget += rate === Infinity ? MAX_PER_FRAME : ((now - last) / 1000) * rate
      budget = Math.min(budget, MAX_PER_FRAME)
      last = now
      let stopReason: 'break' | 'stop' | null = null
      const before = cpu.steps
      while (budget >= 1) {
        if (!first && breakpoints.has(cpu.pc)) {
          stopReason = 'break'
          break
        }
        first = false
        budget--
        if (!cpu.step() || cpu.status === 'waiting-input') {
          stopReason = 'stop'
          break
        }
      }
      if (stopReason) {
        if (stopReason === 'break') append('info', `Breakpoint at ${hex(cpu.pc)}`)
        else reportStop()
        resumeAfterInput.current = cpu.status === 'waiting-input'
        setRunning(false)
        refresh()
        return
      }
      if (cpu.steps !== before) refresh()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [running, speed, breakpoints, cpu, append, reportStop, refresh])

  const submitInput = useCallback(
    (line: string) => {
      inputQueue.current.push(line)
      append('input', line)
      if (cpu.status === 'waiting-input') {
        cpu.status = 'ready'
        if (resumeAfterInput.current) {
          resumeAfterInput.current = false
          setRunning(true)
        } else step()
      }
    },
    [append, cpu, step],
  )

  const toggleBreakpoint = useCallback((addr: number) => {
    setBreakpoints((bps) => {
      const next = new Set(bps)
      if (!next.delete(addr)) next.add(addr)
      return next
    })
  }, [])

  const labels = useMemo(() => {
    const map = new Map<number, string>()
    program?.symbols.forEach((addr, name) => {
      if (!map.has(addr)) map.set(addr, name)
    })
    return map
  }, [program])

  return {
    cpu,
    program,
    errors,
    running,
    speed,
    setSpeed,
    breakpoints,
    toggleBreakpoint,
    log,
    clearLog: () => setLog([]),
    prevRegs: prevRegs.current,
    labels,
    assembleSource,
    loadFile,
    reset,
    step,
    toggleRun,
    submitInput,
  }
}

export type Simulator = ReturnType<typeof useSimulator>
