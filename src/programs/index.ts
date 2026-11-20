import type { Cpu } from '../core/cpu'
import blank from './blank.s?raw'
import factorial from './factorial.s?raw'
import fibonacci from './fibonacci.s?raw'
import quicksort from './quicksort.s?raw'
import riscvtest from './riscvtest.s?raw'
import symmetricTree from './symmetric-tree.s?raw'

export const BLANK_ID = 'blank'
export const BLANK_SOURCE = blank

export interface Sample {
  id: string
  name: string
  description: string
  expected: string
  source: string
  memoryAddr: number
  check: (cpu: Cpu, output: string) => boolean
}

const words = (cpu: Cpu, addr: number, n: number) =>
  Array.from({ length: n }, (_, i) => cpu.mem.readWord(addr + 4 * i) | 0)

export const SAMPLES: Sample[] = [
  {
    id: 'quicksort',
    name: 'Quicksort',
    description: 'Sorts {6, 4, 3, 2, 1, 8, 9} in place at 0x1000 with recursive quicksort.',
    expected: 'mem[0x1000..] = {1, 2, 3, 4, 6, 8, 9}',
    source: quicksort,
    memoryAddr: 0x1000,
    check: (cpu) => words(cpu, 0x1000, 7).join() === '1,2,3,4,6,8,9',
  },
  {
    id: 'symmetric-tree',
    name: 'Symmetric tree',
    description: 'Checks whether the flattened tree {6, 4, 4, 1, 2, 2, 1} at 0x1000 is symmetric.',
    expected: 'a0 = 1 (true)',
    source: symmetricTree,
    memoryAddr: 0x1000,
    check: (cpu) => cpu.reg(10) === 1,
  },
  {
    id: 'riscvtest',
    name: 'riscvtest.s',
    description: 'Harris & Harris test of add, sub, and, or, slt, addi, lw, sw, beq and jal.',
    expected: 'mem[0x64] = 25 (0x19)',
    source: riscvtest,
    memoryAddr: 0x40,
    check: (cpu) => cpu.mem.readWord(100) === 25,
  },
  {
    id: 'fibonacci',
    name: 'Fibonacci (ecall)',
    description: 'Prints the first 15 Fibonacci numbers and stores them at 0x2000.',
    expected: 'Console shows 0 … 377, mem[0x2038] = 377',
    source: fibonacci,
    memoryAddr: 0x2000,
    check: (cpu) => cpu.status === 'exited' && cpu.mem.readWord(0x2038) === 377,
  },
  {
    id: 'factorial',
    name: 'Factorial (input)',
    description: 'Reads n from the console and prints n! using recursion and read_int.',
    expected: 'Type n in the console, e.g. 5 → 120',
    source: factorial,
    memoryAddr: 0xfff0,
    check: (cpu, output) => cpu.status === 'exited' && /n! = \d+/.test(output),
  },
]
