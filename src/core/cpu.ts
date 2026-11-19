import { decode, type Instruction } from './decoder'
import { Memory } from './memory'
import { syscall, type Host } from './syscalls'

export type CpuStatus = 'ready' | 'halted' | 'exited' | 'waiting-input' | 'error'

export interface MemWrite {
  addr: number
  size: number
}

/** Architectural state of an RV32I hart plus a fetch-decode-execute step. */
export class Cpu {
  pc = 0
  readonly regs = new Int32Array(32)
  readonly mem = new Memory()
  status: CpuStatus = 'ready'
  message = ''
  exitCode = 0
  steps = 0
  lastRegWrite: number | null = null
  lastMemWrite: MemWrite | null = null
  host: Host

  constructor(host: Host = { write: () => {}, readLine: () => null }) {
    this.host = host
  }

  reset(pc = 0): void {
    this.pc = pc >>> 0
    this.regs.fill(0)
    this.mem.clear()
    this.status = 'ready'
    this.message = ''
    this.exitCode = 0
    this.steps = 0
    this.lastRegWrite = null
    this.lastMemWrite = null
  }

  get running(): boolean {
    return this.status === 'ready' || this.status === 'waiting-input'
  }

  reg(i: number): number {
    return this.regs[i]
  }

  private setReg(i: number, value: number): void {
    if (i === 0) return
    this.regs[i] = value
    this.lastRegWrite = i
  }

  private store(addr: number, size: number, value: number): void {
    addr >>>= 0
    if (size === 1) this.mem.writeByte(addr, value)
    else if (size === 2) this.mem.writeHalf(addr, value)
    else this.mem.writeWord(addr, value)
    this.lastMemWrite = { addr, size }
  }

  fetch(): Instruction {
    return decode(this.mem.readWord(this.pc))
  }

  /** Executes one instruction. Returns false when the CPU cannot advance. */
  step(): boolean {
    if (!this.running) return false
    this.lastRegWrite = null
    this.lastMemWrite = null
    try {
      this.execute(this.fetch())
    } catch (e) {
      this.status = 'error'
      this.message = `${(e as Error).message} at pc=0x${this.pc.toString(16).padStart(8, '0')}`
      return false
    }
    return this.running
  }

  private execute(ins: Instruction): void {
    const { rd, imm } = ins
    const a = this.regs[ins.rs1]
    const b = this.regs[ins.rs2]
    const pc = this.pc
    let next = (pc + 4) >>> 0
    const branch = (cond: boolean) => {
      if (cond) next = (pc + imm) >>> 0
    }

    switch (ins.name) {
      case 'lui': this.setReg(rd, imm); break
      case 'auipc': this.setReg(rd, (pc + imm) | 0); break
      case 'jal': this.setReg(rd, pc + 4); next = (pc + imm) >>> 0; break
      case 'jalr': next = ((a + imm) & ~1) >>> 0; this.setReg(rd, pc + 4); break

      case 'beq': branch(a === b); break
      case 'bne': branch(a !== b); break
      case 'blt': branch(a < b); break
      case 'bge': branch(a >= b); break
      case 'bltu': branch(a >>> 0 < b >>> 0); break
      case 'bgeu': branch(a >>> 0 >= b >>> 0); break

      case 'lb': this.setReg(rd, (this.mem.readByte(a + imm) << 24) >> 24); break
      case 'lh': this.setReg(rd, (this.mem.readHalf(a + imm) << 16) >> 16); break
      case 'lw': this.setReg(rd, this.mem.readWord(a + imm) | 0); break
      case 'lbu': this.setReg(rd, this.mem.readByte(a + imm)); break
      case 'lhu': this.setReg(rd, this.mem.readHalf(a + imm)); break

      case 'sb': this.store(a + imm, 1, b); break
      case 'sh': this.store(a + imm, 2, b); break
      case 'sw': this.store(a + imm, 4, b); break

      case 'addi': this.setReg(rd, (a + imm) | 0); break
      case 'slti': this.setReg(rd, a < imm ? 1 : 0); break
      case 'sltiu': this.setReg(rd, a >>> 0 < imm >>> 0 ? 1 : 0); break
      case 'xori': this.setReg(rd, a ^ imm); break
      case 'ori': this.setReg(rd, a | imm); break
      case 'andi': this.setReg(rd, a & imm); break
      case 'slli': this.setReg(rd, a << imm); break
      case 'srli': this.setReg(rd, a >>> imm); break
      case 'srai': this.setReg(rd, a >> imm); break

      case 'add': this.setReg(rd, (a + b) | 0); break
      case 'sub': this.setReg(rd, (a - b) | 0); break
      case 'sll': this.setReg(rd, a << (b & 31)); break
      case 'slt': this.setReg(rd, a < b ? 1 : 0); break
      case 'sltu': this.setReg(rd, a >>> 0 < b >>> 0 ? 1 : 0); break
      case 'xor': this.setReg(rd, a ^ b); break
      case 'srl': this.setReg(rd, a >>> (b & 31)); break
      case 'sra': this.setReg(rd, a >> (b & 31)); break
      case 'or': this.setReg(rd, a | b); break
      case 'and': this.setReg(rd, a & b); break

      case 'fence': break
      case 'ebreak':
        this.status = 'halted'
        this.message = 'ebreak'
        break
      case 'ecall': {
        const result = syscall(this.regs, this.mem, this.host)
        if (result.kind === 'needs-input') {
          this.status = 'waiting-input'
          return
        }
        this.status = 'ready'
        if ([5, 12].includes(this.regs[17])) this.lastRegWrite = 10
        if (result.kind === 'exit') {
          this.status = 'exited'
          this.exitCode = result.code
          this.message = `Program exited with code ${result.code}`
        }
        break
      }
    }

    this.steps++
    if (next === pc && this.status === 'ready') {
      this.status = 'halted'
      this.message = 'Infinite loop detected (jump to self): program finished'
    }
    this.pc = next
  }
}
