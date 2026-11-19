import type { Memory } from './memory'

/** I/O bridge between the simulated program and the host (UI or tests). */
export interface Host {
  write(text: string): void
  /** Returns the next input line, or null when none is available yet. */
  readLine(): string | null
}

export type SyscallResult =
  | { kind: 'continue' }
  | { kind: 'exit'; code: number }
  | { kind: 'needs-input' }

export const SYSCALLS: Record<number, string> = {
  1: 'print_int',
  4: 'print_string',
  5: 'read_int',
  8: 'read_string',
  10: 'exit',
  11: 'print_char',
  12: 'read_char',
  34: 'print_hex',
  35: 'print_bin',
  36: 'print_unsigned',
  93: 'exit2',
}

export class SyscallError extends Error {}

/** SPIM-style environment calls (service number in a7), as documented by CPUlator. */
export function syscall(regs: Int32Array, mem: Memory, host: Host): SyscallResult {
  const a0 = regs[10]
  const service = regs[17]

  switch (service) {
    case 1:
      host.write(String(a0))
      break
    case 4: {
      let s = ''
      for (let addr = a0 >>> 0, c; (c = mem.readByte(addr)) !== 0; addr++) s += String.fromCharCode(c)
      host.write(s)
      break
    }
    case 5: {
      const line = host.readLine()
      if (line === null) return { kind: 'needs-input' }
      const value = parseInt(line.trim(), 10)
      regs[10] = Number.isNaN(value) ? 0 : value
      break
    }
    case 8: {
      const line = host.readLine()
      if (line === null) return { kind: 'needs-input' }
      const max = regs[11]
      const bytes = new TextEncoder().encode(line + '\n').slice(0, Math.max(0, max - 1))
      mem.load(bytes, a0 >>> 0)
      if (max > 0) mem.writeByte((a0 >>> 0) + bytes.length, 0)
      break
    }
    case 10:
      return { kind: 'exit', code: 0 }
    case 11:
      host.write(String.fromCharCode(a0 & 0xff))
      break
    case 12: {
      const line = host.readLine()
      if (line === null) return { kind: 'needs-input' }
      regs[10] = line.length ? line.charCodeAt(0) : 10
      break
    }
    case 34:
      host.write('0x' + (a0 >>> 0).toString(16).padStart(8, '0'))
      break
    case 35:
      host.write((a0 >>> 0).toString(2).padStart(32, '0'))
      break
    case 36:
      host.write(String(a0 >>> 0))
      break
    case 93:
      return { kind: 'exit', code: a0 }
    default:
      throw new SyscallError(`Unsupported ecall service a7=${service}`)
  }
  return { kind: 'continue' }
}
