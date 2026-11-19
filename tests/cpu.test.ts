import { describe, expect, it } from 'vitest'
import { Cpu } from '../src/core/cpu'
import { decode } from '../src/core/decoder'
import { Memory } from '../src/core/memory'

const RISCVTEST = [
  0x00500113, 0x00c00193, 0xff718393, 0x0023e233, 0x0041f2b3, 0x004282b3, 0x02728863,
  0x0041a233, 0x00020463, 0x00000293, 0x0023a233, 0x005203b3, 0x402383b3, 0x0471aa23,
  0x06002103, 0x005104b3, 0x008001ef, 0x00100113, 0x00910133, 0x0221a023, 0x00210063,
]

function cpuWith(words: number[]): Cpu {
  const cpu = new Cpu()
  cpu.reset()
  words.forEach((w, i) => cpu.mem.writeWord(i * 4, w))
  return cpu
}

function runToEnd(cpu: Cpu, limit = 10_000): void {
  for (let i = 0; i < limit && cpu.step(); i++);
}

describe('Memory', () => {
  it('is little-endian', () => {
    const mem = new Memory()
    mem.writeWord(0x1000, 0x12345678)
    expect([...mem.readBytes(0x1000, 4)]).toEqual([0x78, 0x56, 0x34, 0x12])
    expect(mem.readHalf(0x1002)).toBe(0x1234)
    expect(mem.readWord(0xfffffffc)).toBe(0)
  })
})

describe('Decoder', () => {
  it('decodes immediates with sign extension', () => {
    expect(decode(0xff718393)).toMatchObject({ name: 'addi', rd: 7, rs1: 3, imm: -9 })
    expect(decode(0x0471aa23)).toMatchObject({ name: 'sw', rs1: 3, rs2: 7, imm: 84 })
    expect(decode(0x02728863)).toMatchObject({ name: 'beq', imm: 0x30 })
    expect(decode(0x008001ef)).toMatchObject({ name: 'jal', rd: 3, imm: 8 })
    expect(decode(0xfe000ee3)).toMatchObject({ name: 'beq', imm: -4 })
  })

  it('rejects invalid encodings', () => {
    expect(() => decode(0xffffffff)).toThrow(/Invalid instruction/)
  })
})

describe('Cpu', () => {
  it('runs riscvtest machine code and stores 25 at address 100', () => {
    const cpu = cpuWith(RISCVTEST)
    runToEnd(cpu)
    expect(cpu.status).toBe('halted')
    expect(cpu.mem.readWord(100)).toBe(25)
    expect(cpu.pc).toBe(0x50)
  })

  it('keeps x0 hardwired to zero', () => {
    const cpu = cpuWith([0x00500013]) // addi x0, x0, 5
    cpu.step()
    expect(cpu.reg(0)).toBe(0)
  })

  it('handles signed loads and shifts', () => {
    const cpu = cpuWith([
      0xf8000093, // addi x1, x0, -128
      0x00100023, // sb x1, 0(x0)
      0x00000103, // lb x2, 0(x0)
      0x00004183, // lbu x3, 0(x0)
      0x4040d213, // srai x4, x1, 4
      0x0040d293, // srli x5, x1, 4
    ])
    for (let i = 0; i < 6; i++) cpu.step()
    expect(cpu.reg(2)).toBe(-128)
    expect(cpu.reg(3)).toBe(0x80)
    expect(cpu.reg(4)).toBe(-8)
    expect(cpu.reg(5)).toBe(0x0ffffff8)
  })

  it('reports invalid instructions as errors', () => {
    const cpu = cpuWith([0xffffffff])
    expect(cpu.step()).toBe(false)
    expect(cpu.status).toBe('error')
    expect(cpu.message).toMatch(/pc=0x00000000/)
  })

  it('supports print and exit ecalls', () => {
    let out = ''
    const cpu = cpuWith([
      0x02a00513, // addi a0, x0, 42
      0x00100893, // addi a7, x0, 1
      0x00000073, // ecall
      0x00a00893, // addi a7, x0, 10
      0x00000073, // ecall
    ])
    cpu.host = { write: (s) => (out += s), readLine: () => null }
    runToEnd(cpu)
    expect(out).toBe('42')
    expect(cpu.status).toBe('exited')
  })

  it('waits for input on read_int', () => {
    const input: string[] = []
    const cpu = cpuWith([0x00500893, 0x00000073]) // addi a7, x0, 5; ecall
    cpu.host = { write: () => {}, readLine: () => input.shift() ?? null }
    cpu.step()
    cpu.step()
    expect(cpu.status).toBe('waiting-input')
    expect(cpu.pc).toBe(4)
    input.push('-7')
    cpu.step()
    expect(cpu.reg(10)).toBe(-7)
    expect(cpu.pc).toBe(8)
  })
})
