// Tiny stack VM for make.fun's tiny stack ISA v1 (see the kit's ISA.md).
// One run answers every instance in /input/<id>/, writing /output/<id>/stdout.bin
// and /output/<id>/exit.txt. Local run on the practice set:
//   mkdir -p out && MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const IN = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const enc = new TextEncoder();

// Packed [immediate bytes, pops, pushes] per opcode: imm<<4 | pops<<2 | pushes; -1 unknown.
// Packed so the hot loop allocates nothing per instruction.
function info(op: number): number {
  if (op < 8) return [0, 17, 65, 4, 6, 10, 11, 15][op];
  if (op >= 16 && op <= 34 && op !== 31) return op === 23 || op === 27 ? 5 : 9;
  if (op >= 48 && op <= 51) return [32, 36, 36, 32][op - 48];
  if (op === 52) return 0;
  if (op === 64) return 5;
  if (op === 65) return 8;
  if (op >= 80 && op <= 83) return [4, 4, 1, 4][op - 80];
  return -1;
}

function run(prog: Uint8Array, input: Uint8Array): [Uint8Array, number] {
  const n = prog.length;
  const st = new Int32Array(256);
  let sp = 0;
  const cs = new Int32Array(64);
  let cp = 0;
  const mem = new Int32Array(256);
  const out = new Uint8Array(65536);
  let ol = 0, ip = 0, pc = 0, steps = 0;
  const end = (exit: number): [Uint8Array, number] => [out.subarray(0, ol), exit];
  for (;;) {
    if (steps === 1000000) return end(10);
    if (pc < 0 || pc >= n) return end(9);
    const op = prog[pc];
    const inf = info(op);
    if (inf < 0) return end(5);
    const imm = inf >> 4, pops = (inf >> 2) & 3, pushes = inf & 3;
    if (pc + imm >= n) return end(9);
    steps++;
    const nx = pc + 1 + imm;
    if (sp < pops) return end(2);
    if (sp - pops + pushes > 256) return end(3);
    pc = nx;
    switch (op) {
      case 0: return end(0);
      case 1: st[sp++] = (prog[nx - 1] << 24) >> 24; break;
      case 2: st[sp++] = prog[nx - 4] | (prog[nx - 3] << 8) | (prog[nx - 2] << 16) | (prog[nx - 1] << 24); break;
      case 3: sp--; break;
      case 4: st[sp] = st[sp - 1]; sp++; break;
      case 5: { const t = st[sp - 1]; st[sp - 1] = st[sp - 2]; st[sp - 2] = t; break; }
      case 6: st[sp] = st[sp - 2]; sp++; break;
      case 7: { const a = st[sp - 3]; st[sp - 3] = st[sp - 2]; st[sp - 2] = st[sp - 1]; st[sp - 1] = a; break; }
      case 23: st[sp - 1] = -st[sp - 1] | 0; break;
      case 27: st[sp - 1] = ~st[sp - 1]; break;
      case 48: case 49: case 50: {
        const rel = ((prog[nx - 2] | (prog[nx - 1] << 8)) << 16) >> 16;
        let take = true;
        if (op !== 48) { const v = st[--sp]; take = op === 49 ? v === 0 : v !== 0; }
        if (take) pc = nx + rel;
        break;
      }
      case 51:
        if (cp === 64) return end(7);
        cs[cp++] = nx;
        pc = prog[nx - 2] | (prog[nx - 1] << 8);
        break;
      case 52:
        if (cp === 0) return end(8);
        pc = cs[--cp];
        break;
      case 64: {
        const a = st[sp - 1];
        if (a < 0 || a >= 256) return end(6);
        st[sp - 1] = mem[a];
        break;
      }
      case 65: {
        const a = st[sp - 1], v = st[sp - 2];
        if (a < 0 || a >= 256) return end(6);
        sp -= 2;
        mem[a] = v;
        break;
      }
      case 80: {
        const b = enc.encode(String(st[sp - 1]));
        if (ol + b.length > 65536) return end(11);
        sp--;
        out.set(b, ol);
        ol += b.length;
        break;
      }
      case 81:
        if (ol + 1 > 65536) return end(11);
        out[ol++] = st[--sp] & 255;
        break;
      case 82: st[sp++] = ip < input.length ? input[ip++] : -1; break;
      case 83: return end(st[--sp] & 255);
      default: {
        const b = st[sp - 1], a = st[sp - 2];
        let r: number;
        if (op === 16) r = (a + b) | 0;
        else if (op === 17) r = (a - b) | 0;
        else if (op === 18) r = Math.imul(a, b);
        else if (op === 19) { if (b === 0) return end(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; }
        else if (op === 20) { if (b === 0) return end(4); r = b === -1 ? 0 : (a % b) | 0; }
        else if (op === 21) { if (b === 0) return end(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
        else if (op === 22) { if (b === 0) return end(4); r = ((a >>> 0) % (b >>> 0)) | 0; }
        else if (op === 24) r = a & b;
        else if (op === 25) r = a | b;
        else if (op === 26) r = a ^ b;
        else if (op === 28) r = a << (b & 31);
        else if (op === 29) r = a >> (b & 31);
        else if (op === 30) r = (a >>> (b & 31)) | 0;
        else if (op === 32) r = a === b ? 1 : 0;
        else if (op === 33) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2;
        st[sp++] = r;
        break;
      }
    }
  }
}

for (const id of readdirSync(IN).sort()) {
  const prog = readFileSync(join(IN, id, 'program.bin'));
  const input = readFileSync(join(IN, id, 'input.bin'));
  const [stdout, exit] = run(prog, input);
  mkdirSync(join(OUT, id), { recursive: true });
  writeFileSync(join(OUT, id, 'stdout.bin'), stdout);
  writeFileSync(join(OUT, id, 'exit.txt'), exit + '\n');
}
