export const CUBE_COLORS = [
    { name: "白色", hex: "#f1f0e8", vector: [0, 1, 0] },
    { name: "黄色", hex: "#efd044", vector: [0, -1, 0] },
    { name: "绿色", hex: "#32966a", vector: [0, 0, 1] },
    { name: "蓝色", hex: "#3f80c7", vector: [0, 0, -1] },
    { name: "橙色", hex: "#ec963b", vector: [-1, 0, 0] },
    { name: "红色", hex: "#d95b46", vector: [1, 0, 0] },
];
export type CubeColors = { bottom: number; left: number };
export type ColorPart = "bottom" | "left" | "right";
export const DEFAULT_CUBE_COLORS: CubeColors = { bottom: 0, left: 3 };
export const oppositeColor = (color: number) => color ^ 1;
const validColor = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 6;
const adjacent = (a: number, b: number) => a !== b && oppositeColor(a) !== b;

export function loadCubeColors(value: any): CubeColors {
    return value && validColor(value.bottom) && validColor(value.left) && adjacent(value.bottom, value.left)
        ? { bottom: value.bottom, left: value.left } : { ...DEFAULT_CUBE_COLORS };
}

export function changeCubeColor(current: CubeColors, part: ColorPart, color: number): CubeColors {
    const scheme = loadCubeColors(current);
    if (!validColor(color)) return scheme;
    if (part === "bottom") {
        scheme.bottom = color;
        if (!adjacent(scheme.left, color)) scheme.left = CUBE_COLORS.findIndex((_, index) => adjacent(index, color));
    } else {
        const left = part === "right" ? oppositeColor(color) : color;
        if (adjacent(left, scheme.bottom)) scheme.left = left;
    }
    return scheme;
}

// A rotation of the standard color scheme preserves both opposite pairs and
// the order of colors around every corner. Face order is U, D, F, B, L, R.
export function cubePalette(value: CubeColors): number[] {
    const { bottom, left } = loadCubeColors(value);
    const a = CUBE_COLORS[left].vector, b = CUBE_COLORS[bottom].vector;
    const frontVector = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const front = CUBE_COLORS.findIndex(color => color.vector.every((axis, i) => axis === frontVector[i]));
    return [oppositeColor(bottom), bottom, front, oppositeColor(front), left, oppositeColor(left)];
}
