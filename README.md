# tiny-stack-vm

A tiny stack virtual machine for make.fun's tiny stack ISA v1: 32-bit wrapping
integers, a 256-value stack, branches, calls, 256 words of memory, input and
output, ten traps with their own exit codes, and step and output limits.

Run: `node main.ts` reads `/input/<id>/program.bin` and `/input/<id>/input.bin`
for every instance and writes `/output/<id>/stdout.bin` and `/output/<id>/exit.txt`.
