import { CubieCube } from "./CubeLib.js?v=eb3b30c7c373";
import { findEOLRCase } from "./EOLRCases.js?v=eb3b30c7c373";
import { DEFAULT_CUBE_COLORS, loadCubeColors } from "./CubeColors.js?v=eb3b30c7c373";
export const CATEGORIES = ["4/0", "2o/2", "4/2", "0/2", "2a/2", "2a/0", "2o/0", "1/1", "3/1"];
export const EO_PATTERNS = {
    "4/0": "111100", "2o/2": "010111", "4/2": "111111", "0/2": "000011",
    "2a/2": "011011", "2a/0": "011000", "2o/0": "101000", "1/1": "100001", "3/1": "110110",
};
export const keyForCase = (item) => item.category + ":" + item.name;
export function hasAlignedCenters(cube) {
    return (cube.tp[0] === 0 && cube.tp[1] === 1) || (cube.tp[0] === 1 && cube.tp[1] === 0);
}
export function parseScramble(text, options = {}) {
    const normalized = text.replace(/[’‘′]/g, "'").replace(/\u00a0/g, " ").trim().toUpperCase();
    const tokens = normalized.split(/\s+/);
    if (!normalized || tokens.length > 100 || tokens.some(token => !/^[UM](2'?|')?$/.test(token))) {
        throw new Error("请输入仅包含 U、M 及其逆转、半转的打乱，例如 M' U M2 U M'");
    }
    const scramble = tokens.join(" ");
    const cube = new CubieCube().apply(scramble);
    if (!options.allowSideCenters && !hasAlignedCenters(cube)) {
        throw new Error("顶底色的中心需要位于顶面和底面，请检查打乱中的 M 转动。");
    }
    const match = findEOLRCase(cube);
    if (!match)
        throw new Error("这条打乱的 EO 已完成，暂不属于这 51 种识别情形。");
    return { cube, match, scramble };
}
export function loadStored(raw) {
    const defaults = { favorites: [], attempts: [], categories: [...CATEGORIES], focusLR: false, cubeColors: { ...DEFAULT_CUBE_COLORS }, cubeColorsVersion: 1 };
    try {
        const value = JSON.parse(raw || "null");
        if (!value || typeof value !== "object")
            return defaults;
        defaults.focusLR = value.focusLR === true;
        defaults.cubeColors = loadCubeColors(value.cubeColors);
        // Upgrade the former default once, without replacing other personal
        // schemes or preventing a deliberate return to the old colors later.
        if (!value.cubeColorsVersion && value.cubeColors?.bottom === 1 && value.cubeColors?.left === 4) {
            defaults.cubeColors = { ...DEFAULT_CUBE_COLORS };
        }
        if (Array.isArray(value.categories)) {
            const valid = value.categories.filter((c) => typeof c === "string" && CATEGORIES.includes(c));
            if (valid.length)
                defaults.categories = Array.from(new Set(valid));
        }
        if (Array.isArray(value.favorites))
            defaults.favorites = value.favorites.filter((f) => f && typeof f.id === "string" && typeof f.key === "string" && typeof f.scramble === "string" && Number.isFinite(f.at)
            // Keep older favorites in storage/backups, even if their center
            // orientation makes them ineligible for the current practice pool.
            ).filter((f) => { try {
                return keyForCase(parseScramble(f.scramble, { allowSideCenters: true }).match) === f.key;
            }
            catch {
                return false;
            } }).slice(-500);
        if (Array.isArray(value.attempts))
            defaults.attempts = value.attempts.filter((a) => a && typeof a.id === "string" && typeof a.key === "string" && CATEGORIES.includes(a.category)
                && typeof a.name === "string" && ["known", "again", "viewed"].includes(a.rating)
                && Number.isFinite(a.elapsed) && a.elapsed >= 0 && Number.isFinite(a.at)).slice(-1000);
        return defaults;
    }
    catch {
        return defaults;
    }
}
export function localDay(timestamp) {
    const date = new Date(timestamp);
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()].join("-");
}
export function summarize(attempts, today = Date.now()) {
    const day = localDay(today);
    const current = attempts.filter(a => localDay(a.at) === day);
    const timed = current.filter(a => a.elapsed > 0);
    const average = timed.length ? timed.reduce((sum, a) => sum + a.elapsed, 0) / timed.length : 0;
    const known = current.filter(a => a.rating === "known").length;
    const rated = current.filter(a => a.rating !== "viewed").length;
    return { count: current.length, average, known, rate: rated ? Math.round(known / rated * 100) : 0 };
}
