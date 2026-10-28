export type BLDGroup = "general" | "edge" | "corner";
export type BLDScheme = "speffz" | "chichu" | "custom";
export type MemoryImage = { url: string; source: string; title: string; author: string; license: string; cachedUrl?: string;
    match?: "entity" | "candidate" | "chosen"; meaning?: string; recommended?: boolean };
export type BLDEntry = { id: string; code: string; word: string; group: BLDGroup; note: string; keyword: string; image?: MemoryImage;
    reviews: number; correct: number; mistakes: number; streak: number; due: number; updated: number };
export type BLDStore = { entries: BLDEntry[]; scheme: BLDScheme; group: BLDGroup; edgeLetters: string[]; cornerLetters: string[] };
export const SPEFFZ_CORNERS = "D I F A E R B Q N C M J U G L X S H W O T V K P".split(" ");
export const SPEFFZ_EDGES = "C I D E A Q B M U K X G W S V O J P L F R H T N".split(" ");
export const CHICHU_CORNERS = "A B C D E F G H I J K L W M N O P Q R S T X Y Z".split(" ");
export const CHICHU_EDGES = "A B C D E F G H I J K L M N O P Q R S T W X Y Z".split(" ");
export const newBLDId = () => Array.from(crypto.getRandomValues(new Uint32Array(2)), n => n.toString(16)).join("-");
export function parseCode(value: string): string {
    const text = value.trim().toUpperCase();
    const tokens = /^[A-Z]{2}$/.test(text) ? text.split("") : text.split(/[\s·,，/]+/);
    if (tokens.length !== 2 || tokens.some(token => !/^[A-Z0-9]{1,3}$/.test(token))) throw new Error("请输入两个编码，如 AB；数字或多位编码请用空格分开，如 1 12。");
    return tokens.join(" ");
}
export function displayCode(code: string): string { const pair = code.split(" "); return pair.every(p => p.length === 1 && /^[A-Z]$/.test(p)) ? pair.join("") : pair.join(" · "); }
export function parseLetters(value: string): string[] {
    const letters = value.trim().toUpperCase().split(/\s+/);
    if (letters.length !== 24 || new Set(letters).size !== 24 || letters.some(l => !/^[A-Z0-9]{1,3}$/.test(l))) {
        throw new Error("每套编码需要24个不重复的字母或数字，用空格分开，每个编码最多3位。");
    }
    return letters;
}
export function safeImageUrl(value: unknown): string {
    if (typeof value !== "string" || value.length > 2000) return "";
    try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : ""; } catch { return ""; }
}
export function sanitizeImage(value: any): MemoryImage | undefined {
    const url = safeImageUrl(value?.url);
    if (!url) return undefined;
    const image: MemoryImage = { url, source: safeImageUrl(value.source), title: String(value.title || "联想图片").slice(0, 200),
        author: String(value.author || "").slice(0, 200), license: String(value.license || "").slice(0, 100) };
    if (typeof value.cachedUrl === "string" && /^\.\/assets\/memory\/[a-f0-9]{24}\.(jpg|png|webp)$/.test(value.cachedUrl)) image.cachedUrl = value.cachedUrl;
    if (["entity", "candidate", "chosen"].includes(value.match)) image.match = value.match;
    if (typeof value.meaning === "string") image.meaning = value.meaning.slice(0, 300);
    if (typeof value.recommended === "boolean") image.recommended = value.recommended;
    return image;
}
export function makeEntry(code: string, word: string, group: BLDGroup = "general"): BLDEntry {
    return { id: newBLDId(), code: parseCode(code), word: word.trim().slice(0, 80), group, note: "", keyword: "", reviews: 0, correct: 0, mistakes: 0, streak: 0, due: 0, updated: Date.now() };
}
export function loadBLDStore(raw: string | null): BLDStore {
    const store: BLDStore = { entries: [], group: "general", scheme: "speffz", edgeLetters: [...SPEFFZ_EDGES], cornerLetters: [...SPEFFZ_CORNERS] };
    try {
        const value = JSON.parse(raw || "null");
        if (!value || typeof value !== "object") return store;
        if (["general", "edge", "corner"].includes(value.group)) store.group = value.group;
        if (["speffz", "chichu", "custom"].includes(value.scheme)) store.scheme = value.scheme;
        try { store.edgeLetters = parseLetters(value.edgeLetters.join(" ")); } catch { /* Keep the standard scheme. */ }
        try { store.cornerLetters = parseLetters(value.cornerLetters.join(" ")); } catch { /* Keep the standard scheme. */ }
        if (Array.isArray(value.entries)) {
            const seen = new Set<string>();
            const ids = new Set<string>();
            for (const row of value.entries.slice(0, 6000)) {
                try {
                    if (typeof row.word !== "string" || !row.word.trim() || typeof row.code !== "string") continue;
                    const entry = makeEntry(row.code, row.word, ["general", "edge", "corner"].includes(row.group) ? row.group : "general");
                    const key = entry.group + ":" + entry.code + ":" + entry.word;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    entry.id = typeof row.id === "string" && /^[\w-]{1,100}$/.test(row.id) ? row.id : entry.id;
                    if (ids.has(entry.id)) entry.id = newBLDId();
                    ids.add(entry.id);
                    entry.note = String(row.note || "").slice(0, 500); entry.keyword = String(row.keyword || "").slice(0, 100);
                    entry.image = sanitizeImage(row.image);
                    for (const field of ["reviews", "correct", "mistakes", "streak", "due", "updated"] as const) {
                        if (Number.isFinite(row[field]) && row[field] >= 0) entry[field] = Math.floor(row[field]);
                    }
                    entry.correct = Math.min(entry.correct, entry.reviews); entry.mistakes = Math.min(entry.mistakes, entry.reviews);
                    store.entries.push(entry);
                } catch { /* Skip invalid rows without losing valid words. */ }
            }
        }
    } catch { /* Recover from damaged storage. */ }
    return store;
}
export function schemaLetters(store: BLDStore, group: "edge" | "corner"): string[] {
    if (store.scheme === "custom") return group === "edge" ? store.edgeLetters : store.cornerLetters;
    if (store.scheme === "chichu") return group === "edge" ? CHICHU_EDGES : CHICHU_CORNERS;
    return group === "edge" ? SPEFFZ_EDGES : SPEFFZ_CORNERS;
}
export function activeAlphabet(store: BLDStore): string[] {
    if (store.group !== "general") return [...schemaLetters(store, store.group)].sort();
    if (store.scheme !== "custom") return "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    return Array.from(new Set([...schemaLetters(store, "edge"), ...schemaLetters(store, "corner")])).sort();
}
export function eligibleEntry(entry: BLDEntry, store: BLDStore): boolean {
    if (store.group !== "general" && entry.group !== "general" && entry.group !== store.group) return false;
    const [a, b] = entry.code.split(" ");
    if (store.group === "general") { const alphabet = activeAlphabet(store); return alphabet.includes(a) && alphabet.includes(b); }
    const letters = schemaLetters(store, store.group), first = letters.indexOf(a), second = letters.indexOf(b);
    const size = store.group === "corner" ? 3 : 2;
    return first !== -1 && second !== -1 && Math.floor(first / size) !== Math.floor(second / size);
}
export function reviewEntry(entry: BLDEntry, correct: boolean, now = Date.now()): void {
    entry.reviews++; entry.correct += correct ? 1 : 0; entry.mistakes += correct ? 0 : 1;
    entry.streak = correct ? entry.streak + 1 : 0;
    const days = [1, 3, 7, 14, 30];
    entry.due = now + (correct ? days[Math.min(entry.streak - 1, days.length - 1)] * 86400000 : 600000);
    entry.updated = now;
}
const normalizeAnswer = (text: string) => text.trim().normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ");
export function availableCodes(store: BLDStore): string[] {
    const letters = activeAlphabet(store), codes: string[] = [];
    const grouped = store.group === "general" ? null : schemaLetters(store, store.group);
    const size = store.group === "corner" ? 3 : 2;
    for (const a of letters) for (const b of letters) {
        if (!grouped || Math.floor(grouped.indexOf(a) / size) !== Math.floor(grouped.indexOf(b) / size)) codes.push(a + " " + b);
    }
    return codes;
}
export function randomCode(store: BLDStore, previous = ""): string {
    const codes = availableCodes(store).filter(code => code !== previous);
    return codes[Math.floor(Math.random() * codes.length)];
}
export function learnMnemonic(store: BLDStore, code: string, text: string): { entry: BLDEntry; existing: boolean; reusedImage: boolean } {
    const normalizedCode = parseCode(code), word = text.trim();
    if (!word) throw new Error("请输入这组编码对应的联想词。");
    if (word.length > 80) throw new Error("联想词不能超过80个字。");
    const matches = (entry: BLDEntry) => normalizeAnswer(entry.word) === normalizeAnswer(word);
    const exact = store.entries.find(e => e.code === normalizedCode && matches(e) && e.group === store.group) ||
        store.entries.find(e => e.code === normalizedCode && matches(e) && (store.group === "general" || e.group === "general"));
    const donors = store.entries.filter(e => matches(e) && !!e.image);
    const donor = donors.find(e => e.image?.match === "chosen") || donors.find(e => e.image?.match === "entity") || donors[0];
    if (exact) {
        if (!exact.image && donor?.image) exact.image = { ...donor.image };
        return { entry: exact, existing: true, reusedImage: !!exact.image };
    }
    if (store.entries.length >= 6000) throw new Error("词库已满，请先导出备份。");
    const entry = makeEntry(normalizedCode, word, store.group);
    if (donor?.image) entry.image = { ...donor.image };
    store.entries.push(entry);
    return { entry, existing: false, reusedImage: !!donor?.image };
}
export function matchesWord(answer: string, code: string, entries: BLDEntry[]): boolean {
    return entries.some(entry => entry.code === code && normalizeAnswer(entry.word) === normalizeAnswer(answer));
}
export function importBLD(value: any): BLDEntry[] {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("请选择词库JSON文件，或使用批量文本录入。");
    if (value.app === "cube-studio-bld" && value.version === 1 && Array.isArray(value.entries)) {
        const entries = loadBLDStore(JSON.stringify(value)).entries;
        if (!entries.length) throw new Error("文件中没有有效编码词。");
        return entries;
    }
    const entries: BLDEntry[] = [];
    for (const code of Object.keys(value).slice(0, 2000)) {
        const words = typeof value[code] === "string" ? [value[code]] : value[code];
        if (!Array.isArray(words)) continue;
        for (const word of words.slice(0, 10)) {
            if (typeof word !== "string" || !word.trim()) continue;
            try { entries.push(makeEntry(code, word)); } catch { /* Ignore unrelated metadata. */ }
        }
    }
    if (!entries.length) throw new Error("文件中没有有效编码词。支持本训练器或参考站的 {\"AB\":[\"词语\"]} 格式。");
    return entries;
}
export function parseBulkEntries(text: string, group: BLDGroup): BLDEntry[] {
    const rows = text.trim().split(/\r?\n/).filter(line => line.trim());
    if (!rows.length) throw new Error("请先填写编码词，每行一组，例如 AB 阿波罗。");
    if (rows.length > 2000) throw new Error("一次最多录入2000行。");
    return rows.flatMap((line, i) => {
        const match = line.trim().match(/^([A-Za-z]{2}|[A-Za-z0-9]{1,3}\s+[A-Za-z0-9]{1,3})[\s\t,，=：:]+(.+)$/);
        if (!match) throw new Error("第" + (i + 1) + "行格式不对，请使用 AB 词语，多个联想词用 / 分开。");
        return match[2].split(/[\/／]/).filter(w => w.trim()).map(word => makeEntry(match[1], word, group));
    });
}
export function mergeEntries(existing: BLDEntry[], incoming: BLDEntry[]): BLDEntry[] {
    const result = [...existing], keys = new Set(existing.map(e => e.group + ":" + e.code + ":" + e.word));
    for (const entry of incoming) {
        const key = entry.group + ":" + entry.code + ":" + entry.word;
        if (keys.has(key)) continue;
        keys.add(key); result.push({ ...entry, id: newBLDId() });
    }
    if (result.length > 6000) throw new Error("词库最多保存6000个词，请拆分备份。");
    return result;
}
export const DEMO_WORDS = ["BC 白菜", "BD 冰刀", "BM 斑马", "CJ 茶几", "DM 大米", "HJ 火箭", "JD 鸡蛋", "KL 可乐", "LM 柠檬", "PG 苹果", "XM 熊猫", "DT 地铁"].join("\n");
