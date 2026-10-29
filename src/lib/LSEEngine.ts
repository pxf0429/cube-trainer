import { CubieCube } from "./CubeLib";
import { findEOLRCase, getEOLRCategory } from "./EOLRCases";
import { keyForCase } from "./Practice";

export const LSE_SLOTS = [0, 1, 2, 3, 4, 6];
export const LSE_MOVES = ["U", "U'", "U2", "M", "M'", "M2"];
const factorial = [1, 1, 2, 6, 24, 120, 720];
const SIZE = 720 * 64 * 16;

function rank(permutation: number[]): number {
    let result = 0;
    for (let i = 0; i < 6; i++) {
        let smaller = 0;
        for (let j = i + 1; j < 6; j++) if (permutation[j] < permutation[i]) smaller++;
        result += smaller * factorial[5 - i];
    }
    return result;
}

function unrank(value: number): number[] {
    const available = [0, 1, 2, 3, 4, 5];
    return Array(6).fill(0).map((_, i) => {
        const index = Math.floor(value / factorial[5 - i]);
        value %= factorial[5 - i];
        return available.splice(index, 1)[0];
    });
}

export class LSEEngine {
    private parents = new Int32Array(SIZE).fill(-1);
    private steps = new Int8Array(SIZE).fill(-1);
    private permNext = new Uint16Array(720 * 6);
    private eoNext = new Uint8Array(64 * 6);
    private keysByProjection = new Map<number, string>();
    private pools = new Map<string, number[]>();
    private recent: number[] = [];
    stateCount = 0;
    practiceStateCount = 0;

    constructor() {
        const lrByPerm: number[] = [];
        for (let p = 0; p < 720; p++) {
            const permutation = unrank(p);
            lrByPerm[p] = permutation.indexOf(1) * 6 + permutation.indexOf(3);
            const cube = new CubieCube();
            LSE_SLOTS.forEach((slot, i) => cube.ep[slot] = LSE_SLOTS[permutation[i]]);
            LSE_MOVES.forEach((move, i) => {
                const next = cube.apply(move);
                this.permNext[p * 6 + i] = rank(LSE_SLOTS.map(slot => LSE_SLOTS.indexOf(next.ep[slot])));
            });
        }
        const categoryByEO: string[] = [];
        for (let eo = 0; eo < 64; eo++) {
            const cube = new CubieCube();
            LSE_SLOTS.forEach((slot, i) => cube.eo[slot] = (eo >> i) & 1);
            categoryByEO[eo] = getEOLRCategory(cube) || "";
            LSE_MOVES.forEach((move, i) => {
                const next = cube.apply(move);
                this.eoNext[eo * 6 + i] = LSE_SLOTS.reduce((bits, slot, k) => bits | (next.eo[slot] << k), 0);
            });
            if (!categoryByEO[eo] || categoryByEO[eo] === "solved") continue;
            for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) {
                const others = [0, 2, 4, 6];
                LSE_SLOTS.forEach((slot, i) => cube.ep[slot] = i === a ? 1 : i === b ? 3 : others.shift()!);
                const match = findEOLRCase(cube);
                if (!match) throw new Error("识别规则存在未覆盖的状态");
                this.keysByProjection.set(eo * 36 + a * 6 + b, keyForCase(match));
                this.keysByProjection.set(eo * 36 + b * 6 + a, keyForCase(match));
            }
        }
        const queue = new Int32Array(SIZE);
        this.parents[0] = 0;
        let head = 0, tail = 1;
        while (head < tail) {
            const code = queue[head++];
            for (let i = 0; i < 6; i++) {
                const next = this.transition(code, i);
                if (this.parents[next] !== -1) continue;
                this.parents[next] = code;
                this.steps[next] = i;
                queue[tail++] = next;
            }
            const permAndEO = Math.floor(code / 16);
            const eo = permAndEO % 64;
            const permutation = Math.floor(permAndEO / 64);
            const key = this.keysByProjection.get(eo * 36 + lrByPerm[permutation]);
            // Keep quarter-M states in the search graph so scramble paths
            // remain valid, but only offer final states with U/D centers on
            // the U/D faces. M and M' put those centers on F/B; M2 is allowed.
            const centersAligned = (Math.floor((code % 16) / 4) % 2) === 0;
            if (key && centersAligned) {
                if (!this.pools.has(key)) this.pools.set(key, []);
                this.pools.get(key)!.push(code);
                this.practiceStateCount++;
            }
        }
        this.stateCount = tail;
    }

    private transition(code: number, move: number): number {
        const coordinate = Math.floor(code / 16);
        const eo = coordinate % 64;
        const permutation = Math.floor(coordinate / 64);
        const m = Math.floor((code % 16) / 4);
        const u = code % 4;
        const amounts = [1, 3, 2];
        const nextM = move < 3 ? m : (m + amounts[move - 3]) % 4;
        const nextU = move < 3 ? (u + amounts[move]) % 4 : u;
        return (this.permNext[permutation * 6 + move] * 64 + this.eoNext[eo * 6 + move]) * 16
            + nextM * 4 + nextU;
    }

    scrambleFor(code: number): string {
        if (code < 0 || code >= SIZE || this.parents[code] === -1) throw new Error("无效魔方状态");
        const moves: string[] = [];
        while (code !== 0) {
            moves.push(LSE_MOVES[this.steps[code]]);
            code = this.parents[code];
        }
        return moves.reverse().join(" ");
    }

    sample(categories: string[], caseKey?: string): { scramble: string; key: string } {
        const pools = Array.from(this.pools.entries()).filter(([key]) =>
            categories.includes(key.split(":")[0]) && (!caseKey || key === caseKey));
        if (!pools.length) throw new Error("所选范围没有可练习的状态");
        const [key, pool] = pools[Math.floor(Math.random() * pools.length)];
        for (let attempt = 0; attempt < 50; attempt++) {
            const code = pool[Math.floor(Math.random() * pool.length)];
            if (attempt < 49 && this.recent.includes(code)) continue;
            this.recent.push(code);
            this.recent = this.recent.slice(-20);
            return { scramble: this.scrambleFor(code), key };
        }
        throw new Error("暂时无法生成题目，请重试");
    }
}
