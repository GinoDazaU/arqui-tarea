# Reads n from the console and prints n! computed recursively.
# Uses read_int (a7 = 5), print_string (4), print_int (1) and exit (10).

.data
ask:    .string "n = "
res:    .string "n! = "

.text
_start:
    li      sp, 0x10000

    la      a0, ask
    li      a7, 4
    ecall
    li      a7, 5           # read_int -> a0
    ecall

    call    fact
    mv      s0, a0

    la      a0, res
    li      a7, 4
    ecall
    mv      a0, s0
    li      a7, 1
    ecall
    li      a7, 10
    ecall

# a0: n  ->  a0: n!
fact:
    li      t0, 2
    blt     a0, t0, base
    addi    sp, sp, -8
    sw      ra, 4(sp)
    sw      a0, 0(sp)
    addi    a0, a0, -1
    call    fact
    lw      t1, 0(sp)
    lw      ra, 4(sp)
    addi    sp, sp, 8
    mv      a1, a0
    li      a0, 0
mul:                        # a0 = t1 * a1 (no M extension)
    beqz    t1, mul_end
    add     a0, a0, a1
    addi    t1, t1, -1
    j       mul
mul_end:
    ret
base:
    li      a0, 1
    ret
