# Simulador RISC-V (RV32I)

Simulador web del ISA base RISC-V de 32 bits. Ejecuta código máquina ya compilado, paso a paso, y permite inspeccionar el PC, los registros y la memoria. Es la Tarea 5 de CS3051 Arquitectura de Computadores; el enunciado está en [`docs/HW_Arch-9.pdf`](docs/HW_Arch-9.pdf).

**Stack:** React + TypeScript + Vite. Todo corre en el navegador, sin backend.

## Uso

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests del núcleo y de los programas del enunciado
npm run build    # build estático en dist/
```

## Features

- Las **37 instrucciones RV32I** del anexo A, más `ecall`, `ebreak` y `fence`. La memoria es plana, de 32 bits y little-endian.
- **Carga de binario crudo** (`.bin`, exportado de CPUlator) en `0x00000000`, y también de **`.elf`**.
- **Ejecución** paso a paso (Step), continua (Run/Pause) con velocidad ajustable, Reset y **breakpoints**.
- **Inspección:** PC, los 32 registros (en hex, decimal con y sin signo; los cambios se resaltan) y memoria (bytes o words, ASCII, salto a una dirección, etiqueta o `sp+8`).
- **Desensamblador** con etiquetas, sincronizado con el PC.
- **Ensamblador integrado** (extra): labels, directivas (`.data`, `.word`, `.string`, ...) y pseudo-instrucciones (`li`, `la`, `call`, `ret`, `mv`, `beqz`, ...). Los errores se muestran con número de línea, y el resultado se puede descargar como `.bin`.
- **`ecall` estilo SPIM/CPUlator** (`a7`): `print_int`, `print_string`, `read_int`, `read_string`, `exit`, `print_char`, `read_char`, `print_hex`, ...
- **Programas de ejemplo** con verificación automática del resultado esperado: Quicksort, Árbol simétrico, `riscvtest.s`, Fibonacci (con `ecall`) y Factorial (con input).

Si el programa termina en un salto a sí mismo (`j .`), el simulador lo detecta y lo da por terminado.

**Atajos:** `S`/`F10` ejecuta un paso, `F5` hace run/pause, `R` hace reset y `Ctrl+Enter` ensambla.

## Estructura

```
src/
  core/      CPU: memoria, decoder, ejecución, ecalls, desensamblador, loader ELF
  asm/       ensamblador de dos pasadas: parser, encoder, pseudo-instrucciones
  programs/  programas de ejemplo (.s)
  hooks/     useSimulator: conecta el núcleo con React
  ui/        paneles: editor, desensamblado, registros, memoria, consola
tests/       tests con Vitest
```
