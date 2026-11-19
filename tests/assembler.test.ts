import { describe, expect, it } from 'vitest'
import { assemble, type Program } from '../src/asm/assembler'
import { Cpu } from '../src/core/cpu'
import { SAMPLES } from '../src/programs'

function build(source: string): Program {
  const result = assemble(source)
  if (!result.ok) throw new Error(result.errors.map((e) => `${e.line}: ${e.message}`).join('\n'))
  return result.program
}

function run(source: string, input: string[] = []): { cpu: Cpu; output: string } {
  let output = ''
  const cpu = new Cpu({ write: (s) => (output += s), readLine: () => input.shift() ?? null })
  cpu.reset()
  cpu.mem.load(build(source).bytes)
  for (let i = 0; i < 1_000_000 && cpu.step(); i++);
  return { cpu, output }
}

const word = (bytes: Uint8Array, addr: number) =>
  (bytes[addr] | (bytes[addr + 1] << 8) | (bytes[addr + 2] << 16) | (bytes[addr + 3] << 24)) >>> 0

describe('Assembler', () => {
  it('matches the machine code listed in riscvtest.s', () => {
    const source = SAMPLES.find((s) => s.id === 'riscvtest')!.source
    const { bytes } = build(source)
    const expected = [...source.matchAll(/\b([0-9A-F]{8})\s*$/gm)].map((m) => parseInt(m[1], 16))
    expect(expected).toHaveLength(21)
    expected.forEach((w, i) => expect(word(bytes, i * 4)).toBe(w))
  })

  it('expands li, la and call', () => {
    const { bytes, symbols } = build(`
      li a0, 0x12345FFF
      li a1, -1
      la a2, msg
      call f
    f: ret
    .data
    msg: .string "hi"`)
    expect(word(bytes, 0)).toBe(0x12346537) // lui a0, 0x12346
    expect(word(bytes, 4)).toBe(0xfff50513) // addi a0, a0, -1
    expect(word(bytes, 8)).toBe(0xfff00593) // addi a1, zero, -1
    expect(symbols.get('msg')).toBe(0x20)
    expect(word(bytes, 0x18)).toBe(0x00008067) // ret
    expect(bytes[0x20]).toBe('h'.charCodeAt(0))
  })

  it('reports errors with line numbers', () => {
    const result = assemble('addi a0, a0, 1\nfoo a0\naddi a0, a0, 5000\nj nowhere')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.map((e) => e.line)).toEqual([2, 3, 4])
      expect(result.errors[1].message).toMatch(/out of range/)
    }
  })
})

describe('Sample programs', () => {
  it('quicksort sorts the array at 0x1000', () => {
    const { cpu } = run(SAMPLES[0].source)
    expect(cpu.status).toBe('halted')
    expect(SAMPLES[0].check(cpu, '')).toBe(true)
  })

  it('symmetric tree ends with a0 = 1', () => {
    const { cpu } = run(SAMPLES[1].source)
    expect(cpu.reg(10)).toBe(1)
  })

  it('riscvtest writes 25 to address 100', () => {
    const { cpu } = run(SAMPLES[2].source)
    expect(cpu.mem.readWord(100)).toBe(25)
  })

  it('fibonacci prints the sequence', () => {
    const { cpu, output } = run(SAMPLES[3].source)
    expect(output).toBe('Fibonacci: 0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377\n')
    expect(SAMPLES[3].check(cpu, output)).toBe(true)
  })

  it('factorial reads n and prints n!', () => {
    const { output } = run(SAMPLES[4].source, ['6'])
    expect(output).toBe('n = n! = 720')
  })
})
