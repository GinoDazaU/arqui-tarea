# Prints the first 15 Fibonacci numbers using ecall
# and stores them as words starting at 0x2000.

.data
title:  .string "Fibonacci: "
sep:    .string ", "

.text
.global _start
_start:
    li      s0, 15          # count
    li      s1, 0x2000      # output array
    li      t0, 0           # a
    li      t1, 1           # b

    la      a0, title
    li      a7, 4           # print_string
    ecall

loop:
    sw      t0, 0(s1)
    mv      a0, t0
    li      a7, 1           # print_int
    ecall

    add     t2, t0, t1
    mv      t0, t1
    mv      t1, t2
    addi    s1, s1, 4
    addi    s0, s0, -1
    beqz    s0, done

    la      a0, sep
    li      a7, 4
    ecall
    j       loop

done:
    li      a0, '\n'
    li      a7, 11          # print_char
    ecall
    li      a7, 10          # exit
    ecall
