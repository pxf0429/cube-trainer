import { icon } from "./Icons";
import { BLDEntry, BLDGroup, BLDStore, BLDScheme, MemoryImage, DEMO_WORDS, activeAlphabet, displayCode, eligibleEntry, importBLD,
    loadBLDStore, makeEntry, matchesWord, mergeEntries, parseBulkEntries, parseCode, parseLetters, reviewEntry, safeImageUrl, schemaLetters, learnMnemonic, randomCode, availableCodes } from "./lib/Blindfold";
import { searchMemoryImages } from "./lib/MemoryImages";
import { mnemonicImages, mnemonicWords } from "./lib/MnemonicCandidates";

const entities: { [key: string]: string } = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (value: unknown) => String(value).replace(/[&<>"']/g, char => entities[char]);
const labels = { general: "通用", edge: "棱块", corner: "角块" };
const STORE_KEY = "cube-studio:bld:v1";
const shuffle = <T>(values: T[]) => { const copy = [...values]; for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; };
type Mode = "code-word" | "word-code" | "image-code" | "sequence";
type Draft = { code: string; word: string; group: BLDGroup; note: string; keyword: string; url: string; image?: MemoryImage };
const emptyDraft = (): Draft => ({ code: "", word: "", group: "general", note: "", keyword: "", url: "" });
export class BlindfoldTrainer {
    store: BLDStore;
    private view: "encode" | "library" | "train" | "schema" = "encode";
    private encoding: { code: string; word: string; phase: "input" | "searching" | "result"; entryId: string; existing: boolean; reused: boolean; error: string; saved: boolean };
    private lastEncoding: { code: string; word: string } | null = null;
    private encodingCandidates: MemoryImage[] = [];
    private encodingChoosing = false;
    private draft = emptyDraft();
    private editing: string | null = null;
    private query = "";
    private matrix = false;
    private bulkOpen = false;
    private bulkText = "";
    private notice = "";
    private deleted: BLDEntry | null = null;
    private imageResults: MemoryImage[] = [];
    private imageLoading = false;
    private imageError = "";
    private imageAbort: AbortController | null = null;
    private imageToken = 0;
    private batchRunning = false;
    private batchProgress = "";
    private batchAbort: AbortController | null = null;
    private mode: Mode = "code-word";
    private filter = "all";
    private question: { id: string; started: number; done: boolean; answer: string; correct: boolean; elapsed: number } | null = null;
    private previousCode = "";
    private sequenceLength = 6;
    private sequence: { ids: string[]; stage: "memorize" | "recall" | "result"; answers: string[]; results: boolean[]; started: number; elapsed: number } | null = null;
    private edgeDraft = "";
    private cornerDraft = "";

    constructor(private rerender: () => void, private toast: (message: string) => void) {
        try { this.store = loadBLDStore(localStorage.getItem(STORE_KEY)); } catch { this.store = loadBLDStore(null); }
        this.edgeDraft = this.store.edgeLetters.join(" "); this.cornerDraft = this.store.cornerLetters.join(" ");
        this.encoding = { code: randomCode(this.store), word: "", phase: "input", entryId: "", existing: false, reused: false, error: "", saved: true };
    }
    get stats() {
        const entries = this.store.entries, reviews = entries.reduce((sum, entry) => sum + entry.reviews, 0);
        return { words: entries.length, pairs: new Set(entries.map(e => e.code)).size, images: entries.filter(e => e.image).length,
            reviews, due: entries.filter(e => e.due <= Date.now()).length,
            accuracy: reviews ? Math.round(entries.reduce((sum, e) => sum + e.correct, 0) / reviews * 100) : 0 };
    }
    private save(): boolean {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(this.store)); return true; }
        catch { this.toast("浏览器空间不足，当前修改尚未保存。请先导出词库备份。"); return false; }
    }
    private pool(): BLDEntry[] {
        return this.store.entries.filter(entry => eligibleEntry(entry, this.store)).filter(entry =>
            (this.filter !== "due" || entry.due <= Date.now()) && (this.filter !== "weak" || (entry.mistakes > 0 && entry.streak < 2)) &&
            (this.mode !== "image-code" || !!entry.image));
    }
    private focus(selector: string) { window.requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus()); }
    private image(image: MemoryImage | undefined, word: string, large = false): string {
        const display = image ? new URL(image.url) : null;
        if (display && /^(?:tse|ts)[1-4]\.mm\.bing\.net$/.test(display.hostname)) {
            display.hostname = display.hostname.replace(/^ts([1-4])\./, "tse$1."); display.searchParams.set("pid", "Api");
        }
        const displayUrl = display?.href || "";
        const host = display?.hostname || "";
        const staticSite = typeof location !== "undefined" && location.hostname.endsWith(".github.io");
        const proxy = image && !staticSite && (["upload.wikimedia.org", "thumb.wikimedia.org"].includes(host) || /^tse[1-4]\.mm\.bing\.net$/.test(host));
        const src = image ? image.cachedUrl || (proxy ? './api/memory-image?url=' + encodeURIComponent(displayUrl) : displayUrl) : '';
        return '<div class="bld-image ' + (large ? 'large-image ' : '') + (!image ? 'no-image' : '') + '">' +
            (image ? '<img data-memory-image data-original-src="' + esc(displayUrl) + '" src="' + esc(src) + '" alt="' + esc(word) + '" loading="lazy" referrerpolicy="no-referrer">' : '') +
            '<span class="image-fallback">' + icon("image") + '<span>' + (image ? '图片未能加载' : '为联想留一个画面') + '</span></span></div>';
    }
    private credit(image?: MemoryImage): string {
        if (!image) return "";
        return '<div class="image-credit">' + (image.source ? '<a href="' + esc(image.source) + '" target="_blank" rel="noreferrer">图片来源 ' + icon("external") + '</a>' : '<span>自选图片</span>') +
            '<span>' + esc([image.author, image.license].filter(Boolean).join(" · ")) + '</span>' +
            (image.meaning ? '<span class="image-meaning">对应：' + esc(image.meaning) + '</span>' : '') + '</div>';
    }
    header(): string {
        const stats = this.stats;
        return '<header class="page-header bld-page-header"><div><div class="eyebrow">BLINDFOLD / ASSOCIATION & RECALL</div><h1>盲拧<span class="title-tag">编码记忆</span></h1>' +
            '<p>编码联想与图片记忆</p></div><div class="top-stats"><div><span>已录入<b>' + stats.pairs + '<small> 组</small></b></span></div><div><span>回忆正确率<b>' +
            (stats.reviews ? stats.accuracy : "—") + '<small> %</small></b></span></div></div></header>' +
            '<nav class="page-tabs" aria-label="盲拧功能">' + (["encode", "library", "train", "schema"] as const).map(view => '<button data-bld-view="' + view + '" class="' +
            (view === this.view ? "active" : "") + '" aria-current="' + (view === this.view ? "page" : "false") + '">' + ({ encode: "编码记忆", library: "编码词库", train: "记忆练习", schema: "编码方案" }[view]) + '</button>').join("") +
            '<span class="tab-end">编码 → 联想词 → 画面 → 回忆</span></nav>';
    }
    markup(): string {
        return '<div id="bld-app">' + this.header() + '<div class="bld-range"><label>练习范围 <select id="bld-group" aria-label="盲拧练习范围">' +
            (["general", "edge", "corner"] as BLDGroup[]).map(group => '<option value="' + group + '" ' + (group === this.store.group ? "selected" : "") + '>' +
            (group === "general" ? "通用 · 全部编码" : labels[group] + " · 排除同块编码") + '</option>').join("") + '</select></label><span>' +
            ({ speffz: "Speffz", chichu: "彳亍", custom: "自定义" }[this.store.scheme]) + ' / ' + (this.view === "encode" ? availableCodes(this.store).length + ' 组随机编码' : this.pool().length + ' 个可练词') + '</span></div>' +
            (this.notice ? '<div class="bld-notice" role="status">' + esc(this.notice) + (this.deleted ? '<button data-bld-action="undo-delete">撤销删除</button>' : '') + '</div>' : '') +
            (this.view === "encode" ? this.encodingView() : this.view === "library" ? this.library() : this.view === "schema" ? this.schema() : this.training()) +
            '<footer class="page-footnote"><span>BLD / 编码记忆</span><a href="./NOTICE.md" target="_blank" rel="noreferrer">关于与许可</a></footer></div>';
    }
    private encodingView(): string {
        const q = this.encoding, entry = this.store.entries.find(e => e.id === q.entryId), submitted = q.phase !== "input", words = mnemonicWords(q.code);
        const status = q.phase === "searching" ? "正在查找配图…" : this.encodingChoosing ? "选择对应的图片" : q.error ? "配图暂未找到，可重新搜索" : q.reused ? "已载入配图" : entry?.image ? "配图已保存" : "联想词已保存";
        return '<section class="bld-encoding ' + (submitted ? 'has-result' : '') + '"><div class="bld-encoding-top"><span>' + icon("memory") + ' 随机编码 · 想起它对应的词</span><button class="text-button" data-bld-action="next-encoding">' +
            (submitted ? "下一组" : "换一组") + ' ' + icon("arrow") + '</button></div><div class="bld-encoding-main"><div class="bld-encoding-code">' + esc(displayCode(q.code)) + '</div>' +
            '<form id="bld-encoding-form"><label class="sr-only" for="bld-encoding-word">联想词</label><input id="bld-encoding-word" maxlength="80" placeholder="输入这组编码对应的联想词" autocomplete="off" value="' + esc(q.word) + '" ' +
            (submitted ? 'disabled' : '') + '><button class="primary" type="submit" aria-label="记住这个词" ' + (submitted ? 'disabled' : '') + '>' + icon("arrow") + '<span>记住这个词</span></button></form>' +
            (!submitted ? (words.length ? '<div class="bld-mnemonic-suggestions" aria-label="参考候选词"><span>候选词</span><div>' + words.map((word, index) =>
                '<button type="button" data-bld-candidate="' + index + '">' + esc(word) + '</button>').join("") + '</div></div>' : '<p class="bld-mnemonic-empty">这组暂无候选词，可以输入自己的联想。</p>') +
                '<p class="bld-encoding-hint">输入或选择一个联想词，按 Enter 查看配图。</p>' :
                '<div class="bld-encoding-result" role="status"><div class="bld-encoding-status ' + (q.phase === "searching" ? 'is-searching' : '') + '">' +
                icon(q.phase === "searching" ? "search" : "check") + '<span>' + esc(status) + '</span></div><h2>' + esc(q.word) + '</h2>' +
                (q.phase === "searching" ? '<div class="bld-encoding-loading"><span></span><p>正在查找这个词的代表图</p></div>' : this.encodingChoosing ?
                    '<div class="encoding-image-choices">' + this.encodingCandidates.map((image, i) => '<button data-bld-encoding-image="' + i + '" aria-label="选择记忆图片' + (i + 1) + '">' +
                        this.image(image, image.meaning || image.title) + '<span>' + esc(image.meaning || image.title) + '</span><b>用这张</b></button>').join("") + '</div>' : this.image(entry?.image, q.word, true)) +
                (!this.encodingChoosing && q.phase !== "searching" ? this.credit(entry?.image) : '') + (entry?.note ? '<p class="bld-encoding-note">' + esc(entry.note) + '</p>' : '') +
                (q.error ? '<p class="bld-inline-error">' + esc(q.error) + '</p>' : '') + (!q.saved ? '<p class="bld-inline-error">本次修改暂未保存，请导出词库备份。</p>' : '') +
                '<div class="bld-encoding-result-actions">' + (q.phase !== "searching" ? '<button class="primary" type="button" data-bld-action="next-encoding">下一组 ' + icon("arrow") + '</button>' +
                '<button class="text-button" data-bld-action="replace-encoding-image">图片不对？重选</button>' +
                (entry ? '<button class="text-button" data-bld-edit="' + esc(entry.id) + '">编辑联想</button>' : '') : '') + '</div></div>') +
            '</div>' + (this.lastEncoding ? '<div class="bld-encoding-last"><span>上一个</span><b>' + esc(displayCode(this.lastEncoding.code)) + '</b><span>' + esc(this.lastEncoding.word) + '</span></div>' : '') + '</section>';
    }
    private nextEncoding() {
        const q = this.encoding;
        if (q.entryId) this.lastEncoding = { code: q.code, word: q.word };
        this.encodingCandidates = []; this.encodingChoosing = false;
        this.encoding = { code: randomCode(this.store, q.code), word: "", phase: "input", entryId: "", existing: false, reused: false, error: "", saved: true };
        this.rerender(); this.focus("#bld-encoding-word");
    }
    private async submitEncoding(retry = false, replace = false) {
        const q = this.encoding;
        if (q.phase === "searching" || (!retry && q.phase !== "input")) return;
        try {
            const result = learnMnemonic(this.store, q.code, q.word);
            const entry = result.entry;
            q.word = entry.word; q.entryId = entry.id; q.existing = result.existing; q.reused = !replace && result.reusedImage; q.error = "";
            this.encodingCandidates = []; this.encodingChoosing = false;
            q.saved = this.save();
            if (entry.image && !replace) { q.phase = "result"; this.rerender(); this.focus('[data-bld-action="next-encoding"]'); return; }
            const prepared = !replace ? mnemonicImages(entry.word) : [];
            if (prepared.length) {
                this.encodingCandidates = prepared; this.encodingChoosing = true;
                q.phase = "result"; this.rerender(); this.focus('[data-bld-encoding-image="0"]'); return;
            }
            q.phase = "searching"; this.rerender();
            const searchingWord = entry.word, searchingCode = entry.code;
            try {
                const images = await searchMemoryImages(entry.keyword || entry.word, undefined, replace);
                const live = this.store.entries.find(e => e.id === entry.id && e.word === searchingWord && e.code === searchingCode);
                const recommended = images.find(image => image.match === "entity" && image.recommended);
                if (recommended && live && !replace) {
                    if (!live.image) live.image = recommended;
                    q.saved = this.save();
                } else if (images.length && live) {
                    if (q === this.encoding) { this.encodingCandidates = images; this.encodingChoosing = true; }
                } else q.error = "暂时没有找到对应图片。词已保留，可以重新找图或在词库更换关键词。";
            } catch (error) { q.error = error.message; }
            q.phase = "result";
            if (q === this.encoding) { this.rerender(); this.focus('.bld-encoding-result-actions [data-bld-action="next-encoding"]'); }
        } catch (error) { q.error = error.message; this.toast(error.message); this.focus("#bld-encoding-word"); }
    }
    private library(): string {
        const term = this.query.toLowerCase(), all = this.store.entries.filter(e => this.store.group === "general" || e.group === "general" || e.group === this.store.group);
        const rows = all.filter(e => (displayCode(e.code) + " " + e.word + " " + e.note).toLowerCase().includes(term));
        return '<div class="bld-library-tools"><label class="search-box">' + icon("search") + '<input id="bld-search" placeholder="搜索编码、词语或联想…" aria-label="搜索编码词" value="' + esc(this.query) + '"></label>' +
            '<div><button class="outline-button" data-bld-action="new">' + icon("plus") + ' 录入编码</button><button class="text-button" data-bld-action="bulk">批量录入</button>' +
            '<button class="text-button" data-bld-action="matrix">' + (this.matrix ? '卡片视图' : '编码表') + '</button></div></div>' +
            (this.bulkOpen ? '<section class="bld-bulk"><h3>批量录入</h3><p>每行一组：AB 词语；多个联想词用 / 分开。也支持 1 12 词语。</p><textarea id="bld-bulk-text" rows="5" placeholder="BC 白菜&#10;JD 鸡蛋&#10;PG 苹果">' +
                esc(this.bulkText) + '</textarea><button class="primary" data-bld-action="save-bulk">加入词库 ' + icon("arrow") + '</button></section>' : '') +
            '<div class="bld-library-layout"><section class="bld-word-section"><div class="bld-section-title"><span>' + rows.length + ' 个联想词 · ' +
            all.filter(e => !!e.image).length + ' 个已有配图</span><button class="text-button" data-bld-action="' + (this.batchRunning ? 'stop-images' : 'batch-images') + '" ' + (!all.length ? 'disabled' : '') + '>' +
            icon(this.batchRunning ? "close" : "image") + (this.batchRunning ? '停止配图' : '补齐缺少的图片') + '</button></div>' +
            (this.batchProgress ? '<p class="bld-batch-status" role="status">' + esc(this.batchProgress) + '</p>' : '') +
            (this.matrix ? this.matrixMarkup() : rows.length ? '<div class="bld-word-grid">' + rows.map(entry => '<article class="bld-word-card">' +
                '<button class="bld-word-image" data-bld-edit="' + esc(entry.id) + '" aria-label="编辑' + esc(displayCode(entry.code) + entry.word) + '">' + this.image(entry.image, entry.word) + '</button>' +
                '<div class="bld-word-body"><div><b class="bld-code-tag">' + esc(displayCode(entry.code)) + '</b><span class="soft-label">' + labels[entry.group] + '</span></div><h3>' + esc(entry.word) + '</h3>' +
                '<p>' + esc(entry.note || "添一个动作或场景，让这个词更有画面。") + '</p><div class="bld-word-actions"><button class="text-button" data-bld-edit="' + esc(entry.id) + '">编辑</button>' +
                '<button class="text-button" data-bld-remember="' + esc(entry.id) + '" aria-label="记忆' + esc(displayCode(entry.code) + entry.word) + '">记忆</button>' +
                '<button class="text-button" data-bld-find="' + esc(entry.id) + '">' + icon("image") + (entry.image ? '换图' : '找图') + '</button></div>' + this.credit(entry.image) + '</div></article>').join("") + '</div>' :
                '<div class="bld-empty"><span class="empty-icon">' + icon("memory") + '</span><h2>' + (all.length ? '没有找到这个编码词' : '从你熟悉的联想词开始') + '</h2><p>' +
                (all.length ? '试试其他关键词。' : '录入编码与联想词，或导入词库文件。') + '</p>' +
                (!all.length ? '<button class="outline-button" data-bld-action="demo">载入示例词库</button>' : '') + '</div>') +
            '<div class="bld-backup"><span>词库备份</span><button class="text-button" data-bld-action="import">' + icon("upload") + ' 导入 JSON</button><button class="text-button" data-bld-action="export">' +
            icon("download") + ' 导出备份</button><input id="bld-import-file" type="file" accept=".json,application/json" hidden></div><p class="bld-small-note">支持 JSON 词库。数据仅保存在当前浏览器，建议定期导出备份。</p></section>' +
            this.editor() + '</div>';
    }
    private editor(): string {
        return '<aside class="bld-editor" aria-label="编码词编辑"><div class="bld-editor-title"><h2>' + (this.editing ? '编辑联想' : '录入联想') + '</h2>' +
            (this.editing ? '<button class="text-button" data-bld-action="new">新增一个</button>' : icon("pencil")) + '</div>' +
            '<div class="bld-editor-fields"><label>编码<input id="bld-code" maxlength="12" placeholder="例如 JD" value="' + esc(this.draft.code) + '"></label>' +
            '<label>归属<select id="bld-entry-group">' + (["general", "edge", "corner"] as BLDGroup[]).map(group => '<option value="' + group + '" ' + (group === this.draft.group ? 'selected' : '') + '>' + labels[group] + '</option>').join("") + '</select></label></div>' +
            '<label class="bld-field">联想词<input id="bld-word" maxlength="80" placeholder="例如 鸡蛋" value="' + esc(this.draft.word) + '"></label>' +
            '<label class="bld-field">联想场景 <small>可选</small><textarea id="bld-note" rows="2" maxlength="500" placeholder="比如：一颗巨大的鸡蛋从桌上滚下来。">' + esc(this.draft.note) + '</textarea></label>' +
            this.image(this.draft.image, this.draft.word || "联想词", true) + this.credit(this.draft.image) +
            '<label class="bld-field">找图关键词 <small>可换英文或具体描述</small><input id="bld-keyword" maxlength="100" placeholder="默认使用联想词" value="' + esc(this.draft.keyword) + '"></label>' +
            '<div class="bld-image-tools"><button class="outline-button" data-bld-action="search-images" ' + (this.imageLoading ? 'disabled' : '') + '>' + icon("search") +
            (this.imageLoading ? '正在搜索…' : '联网找图') + '</button><a href="https://www.bing.com/images/search?q=' + encodeURIComponent(this.draft.keyword || this.draft.word || "") +
            '" target="_blank" rel="noreferrer">外部图片搜索 ' + icon("external") + '</a></div>' +
            (this.imageError ? '<p class="bld-inline-error" role="alert">' + esc(this.imageError) + '</p>' : '') +
            (this.imageResults.length ? '<div class="bld-image-results">' + this.imageResults.map((image, i) => '<article><button data-bld-image="' + i + '" aria-label="使用图片' + (i + 1) + '">' +
                this.image(image, image.title) + '<span>用这张</span></button><small class="image-choice-meaning">' + esc(image.meaning || "相关搜索候选") + '</small><a href="' + esc(image.source) + '" target="_blank" rel="noreferrer">' + esc(image.title) + '</a></article>').join("") + '</div>' : '') +
            '<details class="bld-image-url"><summary>使用自己的图片地址</summary><input id="bld-image-url" type="url" placeholder="https://…" aria-label="自选图片地址" value="' + esc(this.draft.url) + '">' +
            '<button class="text-button" data-bld-action="set-image-url">使用此图片</button></details>' +
            (this.draft.image ? '<button class="text-button" data-bld-action="remove-image">移除当前配图</button>' : '') +
            '<div class="bld-editor-save"><button class="primary" data-bld-action="save-word">' + icon("check") + ' 保存编码词</button>' +
            (this.editing ? '<button class="text-button delete-word" data-bld-action="delete-word">删除</button>' : '') + '</div></aside>';
    }
    private matrixMarkup(): string {
        const letters = activeAlphabet(this.store), byCode = new Map<string, BLDEntry[]>();
        this.store.entries.filter(e => this.store.group === "general" || e.group === "general" || e.group === this.store.group).forEach(entry => byCode.set(entry.code, [...(byCode.get(entry.code) || []), entry]));
        return '<p class="bld-small-note">行是第一个编码，列是第二个编码；点击格子可录入或编辑。</p><div class="bld-matrix-wrap"><table class="bld-matrix"><thead><tr><th></th>' +
            letters.map(l => '<th>' + esc(l) + '</th>').join("") + '</tr></thead><tbody>' + letters.map(a => '<tr><th>' + esc(a) + '</th>' + letters.map(b => {
                const rows = byCode.get(a + " " + b) || [];
                return '<td><button data-bld-pair="' + esc(a + " " + b) + '" aria-label="编辑' + esc(a + " " + b) + '" class="' + (rows.length ? 'filled' : '') + '">' + esc(rows.map(e => e.word).join(" / ")) + '</button></td>';
            }).join("") + '</tr>').join("") + '</tbody></table></div>';
    }
    private training(): string {
        const pool = this.pool(), stats = this.stats;
        return '<div class="bld-train-controls"><label>练习方式<select id="bld-mode">' + (["code-word", "word-code", "image-code", "sequence"] as Mode[]).map(mode => '<option value="' + mode + '" ' +
            (mode === this.mode ? "selected" : "") + '>' + ({ "code-word": "看编码 → 想词", "word-code": "看词 → 想编码", "image-code": "看图 → 想编码", sequence: "串联记忆" }[mode]) + '</option>').join("") +
            '</select></label><label>词语范围<select id="bld-filter"><option value="all" ' + (this.filter === "all" ? 'selected' : '') + '>全部已录入</option><option value="due" ' +
            (this.filter === "due" ? 'selected' : '') + '>待复习</option><option value="weak" ' + (this.filter === "weak" ? 'selected' : '') + '>薄弱词</option></select></label>' +
            (this.mode === "sequence" ? '<label>每组数量<select id="bld-sequence-length">' + [3, 4, 6, 8, 10, 12].map(n => '<option value="' + n + '" ' + (n === this.sequenceLength ? 'selected' : '') + '>' + n + ' 组</option>').join("") + '</select></label>' : '') + '</div>' +
            (!pool.length && !(this.mode !== "sequence" && this.question && this.store.entries.some(e => e.id === this.question!.id)) && !(this.mode === "sequence" && this.sequence) ? '<div class="bld-empty"><span class="empty-icon">' + icon("memory") + '</span><h2>' + (this.store.entries.length ? '当前范围内没有可练习的词' : '先建立你的编码词库') +
                '</h2><p>' + (this.mode === "image-code" ? '看图练习需要配图。先在词库为联想词选图，或切换练习方式。' : '切换词语范围，或回到词库录入。角块、棱块练习会排除同一块上的编码组合。') +
                '</p><button class="outline-button" data-bld-view="library">前往编码词库 ' + icon("arrow") + '</button></div>' : this.mode === "sequence" ? this.sequenceView() : this.questionView()) +
            '<div class="bld-training-summary"><span>累计回忆 <b>' + stats.reviews + '</b> 次</span><span>已有配图 <b>' + stats.images + '</b> 个词</span><span>待复习 <b>' + stats.due + '</b> 个词</span></div>' +
            '<p class="bld-small-note">答错的词会进入薄弱词，10分钟后待复习；答对后按1、3、7、14、30天逐步延长复习间隔。</p>';
    }
    private questionView(): string {
        const q = this.question, entry = q && this.store.entries.find(e => e.id === q.id);
        if (!q || !entry) return '<section class="bld-start"><div class="eyebrow">RECALL / 建立条件反射</div><h2>让编码与画面连起来。</h2><p>只从你录入的词出题，支持同编码的多个联想词。</p><button class="primary" data-bld-action="next-question">开始练习 ' + icon("arrow") + '</button></section>';
        const expected = this.mode === "code-word" ? this.store.entries.filter(e => eligibleEntry(e, this.store) && e.code === entry.code).map(e => e.word).join(" / ") : displayCode(entry.code);
        return '<section class="bld-recall"><div class="bld-recall-heading"><span>' + ({ "code-word": "看到编码，你想到什么？", "word-code": "这个词对应哪组编码？", "image-code": "看到画面，想起它的编码。", sequence: "" }[this.mode]) +
            '</span><span class="soft-label">' + labels[this.store.group] + ' / ' + this.pool().length + ' 个词</span></div><div class="bld-recall-main">' +
            (this.mode === "image-code" ? this.image(entry.image, "回忆这张图片对应的编码", true) : '<div class="bld-recall-prompt ' + (this.mode === "code-word" ? 'is-code' : '') + '">' + esc(this.mode === "code-word" ? displayCode(entry.code) : entry.word) + '</div>') +
            '<form id="bld-answer-form"><label class="sr-only" for="bld-answer">你的答案</label><input id="bld-answer" autocomplete="off" placeholder="' + (this.mode === "code-word" ? '输入联想词' : '输入编码，如 AB') + '" value="' + esc(q.answer) + '" ' + (q.done ? 'disabled' : '') +
            '><button class="primary" type="submit" ' + (q.done ? 'disabled' : '') + '>核对 ' + icon("arrow") + '</button></form>' +
            (q.done ? '<div class="bld-answer-result ' + (q.correct ? 'correct' : 'incorrect') + '" role="status"><span>' + icon(q.correct ? "check" : "reset") + (q.correct ? '答对了' : '再记住一次') + ' · ' + (q.elapsed / 1000).toFixed(1) + ' 秒</span><h3>' + esc(expected) + '</h3>' +
                (entry.note ? '<p>' + esc(entry.note) + '</p>' : '') + (this.mode !== "image-code" ? this.image(entry.image, entry.word, true) : '') + this.credit(entry.image) + '</div>' : '') +
            '<div class="bld-recall-actions">' + (q.done ? '<button class="primary" data-bld-action="next-question">下一组 ' + icon("arrow") + '</button>' : '<button class="text-button" data-bld-action="reveal-question">想不起来，看看答案</button>') +
            '<button class="text-button" data-bld-edit="' + esc(entry.id) + '">编辑这个联想</button></div></div></section>';
    }
    private sequenceView(): string {
        const seq = this.sequence;
        if (!seq) return '<section class="bld-start"><div class="eyebrow">LINK / 串联记忆</div><h2>把几个画面连成一个故事。</h2><p>先看编码、联想词和图片，再遮住它们，按顺序回忆编码。</p><button class="primary" data-bld-action="new-sequence">开始一组 ' + icon("arrow") + '</button></section>';
        const rows = seq.ids.map(id => this.store.entries.find(e => e.id === id)!);
        return '<section class="bld-sequence"><div class="bld-recall-heading"><span>' + ({ memorize: '把这些画面按顺序连起来', recall: '按顺序写出刚才的编码', result: '这一组的回忆结果' }[seq.stage]) +
            '</span><span class="soft-label">' + rows.length + ' 组' + (seq.stage === "result" ? ' · 记忆用时 ' + (seq.elapsed / 1000).toFixed(1) + ' 秒' : '') + '</span></div>' +
            (seq.stage === "memorize" ? '<div class="bld-sequence-grid">' + rows.map(entry => '<article>' + this.image(entry.image, entry.word) + '<b>' + esc(displayCode(entry.code)) + '</b><h3>' + esc(entry.word) +
                '</h3><p>' + esc(entry.note) + '</p></article>').join("") + '</div><button class="primary" data-bld-action="recall-sequence">记好了，开始回忆 ' + icon("eye") + '</button>' :
                '<form id="bld-sequence-form"><div class="bld-sequence-inputs">' + rows.map((entry, i) => '<label><span class="' + (seq.stage === "result" ? (seq.results[i] ? 'correct' : 'incorrect') : '') + '">' +
                    (seq.stage === "result" ? icon(seq.results[i] ? "check" : "reset") : icon("memory")) + '</span><input data-bld-sequence-index="' + i + '" aria-label="回忆第' + (i + 1) + '组编码" placeholder="编码" value="' + esc(seq.answers[i]) + '" ' +
                    (seq.stage === "result" ? 'disabled' : '') + '>' + (seq.stage === "result" ? '<small>' + esc(displayCode(entry.code) + " · " + entry.word) + '</small>' : '') + '</label>').join("") + '</div>' +
                (seq.stage === "recall" ? '<button class="primary" type="submit">核对这一组 ' + icon("check") + '</button>' : '<p class="bld-sequence-score" role="status">答对 ' + seq.results.filter(Boolean).length + ' / ' + rows.length + ' 组</p><button class="primary" type="button" data-bld-action="new-sequence">再来一组 ' + icon("arrow") + '</button>') + '</form>') + '</section>';
    }
    private schema(): string {
        const edge = schemaLetters(this.store, "edge"), corner = schemaLetters(this.store, "corner");
        const maps = [
            { name: "U", corners: [3, 6, 0, 9], edges: [4, 2, 6, 0] }, { name: "L", corners: [4, 2, 17, 13], edges: [3, 21, 19, 11] },
            { name: "F", corners: [1, 11, 14, 22], edges: [1, 18, 16, 9] }, { name: "R", corners: [10, 8, 23, 19], edges: [7, 17, 23, 15] },
            { name: "B", corners: [7, 5, 20, 16], edges: [5, 22, 20, 13] }, { name: "D", corners: [12, 21, 15, 18], edges: [8, 10, 14, 12] },
        ];
        return '<section class="bld-schema"><div class="bld-schema-heading"><div><h2>贴纸编码</h2><p>角块与棱块各24个编码；练习时排除同一块上的编码组合。</p></div><label>编码方案<select id="bld-scheme">' +
            (["speffz", "chichu", "custom"] as BLDScheme[]).map(scheme => '<option value="' + scheme + '" ' + (scheme === this.store.scheme ? 'selected' : '') + '>' + ({ speffz: "Speffz", chichu: "彳亍", custom: "自定义" }[scheme]) + '</option>').join("") + '</select></label></div>' +
            '<div class="bld-letter-net" aria-label="角棱编码展开图">' + maps.map(face => {
                const c = face.corners, e = face.edges, cells = [corner[c[0]], edge[e[0]], corner[c[1]], edge[e[1]], face.name, edge[e[2]], corner[c[2]], edge[e[3]], corner[c[3]]];
                return '<div class="bld-letter-face letter-face-' + face.name.toLowerCase() + '">' + cells.map((value, i) => '<span class="' + (i === 4 ? 'center' : i % 2 === 0 ? 'corner-code' : 'edge-code') + '">' + esc(value) + '</span>').join("") + '</div>';
            }).join("") + '</div><div class="bld-schema-legend"><span>角落为角块编码</span><span>边中为棱块编码</span></div>' +
            (this.store.scheme === "custom" ? '<div class="bld-custom-schema"><p>每行按同一块分组：角块每3个、棱块每2个。顺序对应下方位置说明，填入24个不重复的编码。</p>' +
                '<label class="bld-field">角块编码<textarea id="bld-corner-letters" rows="3">' + esc(this.cornerDraft) + '</textarea></label><p class="bld-small-note">块顺序：UFL、UBL、UBR、UFR、DFL、DBL、DBR、DFR；每块从 U/D 贴纸开始，顺序与展开图一致。</p>' +
                '<label class="bld-field">棱块编码<textarea id="bld-edge-letters" rows="3">' + esc(this.edgeDraft) + '</textarea></label><p class="bld-small-note">块顺序：UF、UL、UB、UR、DF、DL、DB、DR、FR、FL、BL、BR；每块先填第一个面，再填第二个面。</p>' +
                '<button class="primary" data-bld-action="save-schema">保存编码方案 ' + icon("check") + '</button></div>' : '') + '</section>';
    }
    mount(root: HTMLElement) {
        if (this.view === "encode" && this.encoding.phase === "input") this.focus("#bld-encoding-word");
        root.addEventListener("click", event => this.click(event));
        root.addEventListener("input", event => this.input(event));
        root.addEventListener("change", event => this.change(event));
        root.addEventListener("submit", event => {
            event.preventDefault();
            if ((event.target as HTMLElement).id === "bld-encoding-form") this.submitEncoding();
            if ((event.target as HTMLElement).id === "bld-answer-form") this.answer(false);
            if ((event.target as HTMLElement).id === "bld-sequence-form") this.finishSequence();
        });
        root.addEventListener("error", event => {
            const target = event.target as HTMLImageElement; if (!target.matches("[data-memory-image]")) return;
            if (target.dataset.originalSrc && target.src !== target.dataset.originalSrc) { target.src = target.dataset.originalSrc; return; }
            target.parentElement?.classList.add("image-failed");
        }, true);
    }
    private edit(entry?: BLDEntry, pair = "") {
        this.imageAbort?.abort(); this.imageToken++; this.imageLoading = false; this.imageError = ""; this.imageResults = [];
        this.view = "library"; this.editing = entry?.id || null;
        this.draft = entry ? { code: displayCode(entry.code), word: entry.word, group: entry.group, note: entry.note, keyword: entry.keyword, url: "", image: entry.image } : { ...emptyDraft(), code: pair ? displayCode(pair) : "", group: this.store.group };
        this.rerender(); this.focus("#bld-code");
    }
    private async findImages() {
        const keyword = this.draft.keyword || this.draft.word;
        this.imageAbort?.abort(); const token = ++this.imageToken;
        this.imageAbort = new AbortController(); this.imageLoading = true; this.imageError = ""; this.imageResults = []; this.rerender();
        try {
            const images = await searchMemoryImages(keyword, this.imageAbort.signal, true);
            if (token !== this.imageToken) return;
                this.imageResults = images;
            if (!images.length) this.imageError = "没有找到合适图片，试试英文、具体物品名或外部图片搜索。";
        } catch (error) { if (token === this.imageToken) this.imageError = error.message; }
        finally { if (token === this.imageToken) { this.imageLoading = false; this.rerender(); } }
    }
    private saveWord() {
        const code = parseCode(this.draft.code), word = this.draft.word.trim();
        if (!word) throw new Error("请填写这个编码的联想词。");
        if (this.store.entries.some(e => e.id !== this.editing && e.code === code && e.word === word && e.group === this.draft.group)) throw new Error("这个编码词已经在词库里了。");
        const existing = this.store.entries.find(e => e.id === this.editing), entry = existing || makeEntry(code, word, this.draft.group);
        if (!existing && this.store.entries.length >= 6000) throw new Error("词库已满，请先导出备份。");
        if (existing && (entry.code !== code || entry.word !== word || entry.group !== this.draft.group)) Object.assign(entry, { reviews: 0, correct: 0, mistakes: 0, streak: 0, due: 0 });
        Object.assign(entry, { code, word, group: this.draft.group, note: this.draft.note.trim(), keyword: this.draft.keyword.trim(), image: this.draft.image, updated: Date.now() });
        if (!existing) this.store.entries.push(entry);
        this.editing = entry.id;
        if (this.save()) this.toast("编码词已保存");
        this.notice = ""; this.rerender();
    }
    private nextQuestion() {
        const pool = this.pool(); if (!pool.length) { this.question = null; this.rerender(); return; }
        const alternatives = pool.filter(e => e.code !== this.previousCode);
        const entry = shuffle(alternatives.length ? alternatives : pool)[0];
        this.previousCode = entry.code;
        this.question = { id: entry.id, started: performance.now(), done: false, answer: "", correct: false, elapsed: 0 };
        this.rerender(); this.focus("#bld-answer");
    }
    private answer(reveal: boolean) {
        const q = this.question, entry = q && this.store.entries.find(e => e.id === q.id);
        if (!q || q.done || !entry) return;
        if (!reveal && !q.answer.trim()) { this.toast("先写下你的答案，或点击“想不起来”。"); return; }
        let correct = !reveal && matchesWord(q.answer, entry.code, this.store.entries.filter(e => eligibleEntry(e, this.store)));
        if (this.mode !== "code-word") { try { correct = !reveal && parseCode(q.answer) === entry.code; } catch { correct = false; } }
        q.done = true; q.correct = correct; q.elapsed = performance.now() - q.started;
        reviewEntry(entry, correct); this.save(); this.rerender(); this.focus('[data-bld-action="next-question"]');
    }
    private newSequence() {
        const unique = new Map<string, BLDEntry>(); shuffle(this.pool()).forEach(e => { if (!unique.has(e.code)) unique.set(e.code, e); });
        const entries = shuffle(Array.from(unique.values())).slice(0, this.sequenceLength);
        if (!entries.length) return;
        this.sequence = { ids: entries.map(e => e.id), stage: "memorize", answers: entries.map(() => ""), results: [], started: performance.now(), elapsed: 0 };
        this.rerender();
    }
    private finishSequence() {
        const seq = this.sequence; if (!seq || seq.stage !== "recall") return;
        seq.results = seq.ids.map((id, i) => {
            const entry = this.store.entries.find(e => e.id === id); if (!entry) return false;
            let correct = false; try { correct = parseCode(seq.answers[i]) === entry.code; } catch { /* Empty or invalid answers count as forgotten. */ }
            reviewEntry(entry, correct); return correct;
        });
        seq.stage = "result"; this.save(); this.rerender();
    }
    private async batchImages() {
        if (this.batchRunning) return;
        const pool = this.store.entries.filter(e => !e.image && (this.store.group === "general" || e.group === "general" || e.group === this.store.group));
        if (!pool.length) { this.toast("当前词库的配图已经齐了。"); return; }
        this.batchRunning = true; this.batchAbort = new AbortController(); let done = 0, matched = 0;
        for (const entry of pool) {
            if (this.batchAbort.signal.aborted) break;
            this.batchProgress = "正在为“" + entry.word + "”找图 · " + done + " / " + pool.length; this.rerender();
            try {
                const images = await searchMemoryImages(entry.keyword || entry.word, this.batchAbort.signal);
                // Do not overwrite a picture the user selected while a request was running.
                const live = this.store.entries.find(e => e.id === entry.id);
                const recommended = images.find(image => image.match === "entity" && image.recommended);
                if (live && !live.image && recommended && !this.batchAbort.signal.aborted) {
                    live.image = recommended; matched++; this.save();
                    if (this.editing === live.id && !this.draft.image && this.draft.word === live.word) this.draft.image = live.image;
                }
            } catch { /* Keep words without images for manual searching. */ }
            done++;
        }
        this.batchProgress = (this.batchAbort.signal.aborted ? "已停止。" : "配图完成。") + "已处理 " + done + " 个词，找到 " + matched + " 张词义代表图；模糊结果请逐词选择。";
        this.batchRunning = false; this.rerender();
    }
    private click(event: Event) {
        const target = (event.target as Element).closest<HTMLElement>("button");
        if (!target || target.hasAttribute("disabled")) return;
        if (target.dataset.bldCandidate !== undefined && this.encoding.phase === "input") {
            const word = mnemonicWords(this.encoding.code)[Number(target.dataset.bldCandidate)];
            if (word) {
                this.encoding.word = word;
                const input = document.querySelector<HTMLInputElement>("#bld-encoding-word");
                if (input) { input.value = word; input.focus(); }
            }
            return;
        }
        if (target.dataset.bldView) { this.view = target.dataset.bldView as "encode" | "library" | "train" | "schema"; this.notice = ""; this.rerender(); if (this.view === "encode") this.focus("#bld-encoding-word"); return; }
        if (target.dataset.bldEdit) { this.edit(this.store.entries.find(e => e.id === target.dataset.bldEdit)); return; }
        if (target.dataset.bldFind) { this.edit(this.store.entries.find(e => e.id === target.dataset.bldFind)); this.findImages(); return; }
        if (target.dataset.bldRemember) {
            const entry = this.store.entries.find(e => e.id === target.dataset.bldRemember);
            if (entry) {
                this.view = "encode"; this.encodingCandidates = []; this.encodingChoosing = false;
                this.encoding = {code:entry.code,word:entry.word,phase:"input",entryId:"",existing:false,reused:false,error:"",saved:true};
                this.submitEncoding();
            }
            return;
        }
        if (target.dataset.bldPair) {
            const code = target.dataset.bldPair;
            this.edit(this.store.entries.find(e => e.code === code && (this.store.group === "general" || e.group === "general" || e.group === this.store.group)), code); return;
        }
        if (target.dataset.bldImage !== undefined) { const image = this.imageResults[Number(target.dataset.bldImage)]; this.draft.image = image ? { ...image, match: "chosen" } : undefined; this.rerender(); return; }
        if (target.dataset.bldEncodingImage !== undefined) {
            const image = this.encodingCandidates[Number(target.dataset.bldEncodingImage)];
            const entry = this.store.entries.find(e => e.id === this.encoding.entryId);
            if (image && entry) {
                entry.image = { ...image, match: "chosen" }; this.encoding.saved = this.save(); this.encodingChoosing = false; this.encoding.error = "";
                this.rerender(); this.focus('.bld-encoding-result-actions [data-bld-action="next-encoding"]');
            }
            return;
        }
        try {
            switch (target.dataset.bldAction) {
                case "next-encoding": this.nextEncoding(); break;
                case "retry-encoding-image": this.submitEncoding(true); break;
                case "replace-encoding-image": this.submitEncoding(true, true); break;
                case "new": this.edit(); break;
                case "bulk": this.bulkOpen = !this.bulkOpen; this.rerender(); break;
                case "matrix": this.matrix = !this.matrix; this.rerender(); break;
                case "demo": this.store.entries = mergeEntries(this.store.entries, parseBulkEntries(DEMO_WORDS, "general")); this.save(); this.rerender(); this.toast("示例词库已加入，可自行修改或继续录入。"); break;
                case "save-bulk": { const before = this.store.entries.length; this.store.entries = mergeEntries(this.store.entries, parseBulkEntries(this.bulkText, this.store.group));
                    this.notice = "已新增 " + (this.store.entries.length - before) + " 个词，相同编码词已去重。"; this.save(); this.bulkOpen = false; this.bulkText = ""; this.rerender(); break; }
                case "save-word": this.saveWord(); break;
                case "search-images": this.findImages(); break;
                case "set-image-url": { const url = safeImageUrl(this.draft.url); if (!url) throw new Error("请填写有效的 https 图片地址。");
                    this.draft.image = { url, source: "", title: this.draft.word || "自选图片", author: "", license: "", match: "chosen" }; this.rerender(); break; }
                case "remove-image": this.draft.image = undefined; this.rerender(); break;
                case "delete-word": { const entry = this.store.entries.find(e => e.id === this.editing); if (!entry) break;
                    this.deleted = entry; this.store.entries = this.store.entries.filter(e => e.id !== entry.id); this.notice = "已删除“" + entry.word + "”。";
                    this.save(); this.edit(); break; }
                case "undo-delete": if (this.deleted) { this.store.entries = mergeEntries(this.store.entries, [this.deleted]); this.deleted = null; this.notice = "已恢复编码词。"; this.save(); this.rerender(); } break;
                case "next-question": this.nextQuestion(); break;
                case "reveal-question": this.answer(true); break;
                case "new-sequence": this.newSequence(); break;
                case "recall-sequence": if (this.sequence?.stage === "memorize") { this.sequence.elapsed = performance.now() - this.sequence.started; this.sequence.stage = "recall"; this.rerender(); this.focus('[data-bld-sequence-index="0"]'); } break;
                case "save-schema": { const edge = parseLetters(this.edgeDraft), corner = parseLetters(this.cornerDraft); this.store.edgeLetters = edge; this.store.cornerLetters = corner;
                    this.question = null; this.sequence = null; this.save(); this.nextEncoding(); this.toast("自定义编码方案已保存"); break; }
                case "import": document.querySelector<HTMLInputElement>("#bld-import-file")?.click(); break;
                case "export": { const blob = new Blob([JSON.stringify({ app: "cube-studio-bld", version: 1, ...this.store }, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = "盲拧编码词库-" + new Date().toISOString().slice(0, 10) + ".json";
                    link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); this.toast("词库、图片来源和复习进度已导出"); break; }
                case "batch-images": this.batchImages(); break;
                case "stop-images": this.batchAbort?.abort(); break;
            }
        } catch (error) { this.notice = error.message; this.rerender(); }
    }
    private input(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.id === "bld-encoding-word") this.encoding.word = input.value;
        if (input.id === "bld-code") this.draft.code = input.value;
        if (input.id === "bld-word") {
            this.draft.word = input.value;
            this.imageAbort?.abort(); this.imageToken++; this.imageLoading = false;
            this.draft.image = undefined; this.imageResults = [];
            const button = document.querySelector<HTMLButtonElement>('[data-bld-action="search-images"]');
            if (button) { button.disabled = false; button.innerHTML = icon("search") + "联网找图"; }
            const preview = document.querySelector<HTMLElement>(".bld-editor>.bld-image");
            if (preview) { preview.classList.add("no-image"); preview.querySelector("img")?.remove(); }
            document.querySelector(".bld-editor>.image-credit")?.remove();
            document.querySelector(".bld-image-results")?.remove();
            document.querySelector('[data-bld-action="remove-image"]')?.remove();
        }
        if (input.id === "bld-note") this.draft.note = input.value;
        if (input.id === "bld-keyword") this.draft.keyword = input.value;
        if (input.id === "bld-image-url") this.draft.url = input.value;
        if (input.id === "bld-bulk-text") this.bulkText = input.value;
        if (input.id === "bld-answer" && this.question) this.question.answer = input.value;
        if (input.id === "bld-edge-letters") this.edgeDraft = input.value;
        if (input.id === "bld-corner-letters") this.cornerDraft = input.value;
        if (input.dataset.bldSequenceIndex !== undefined && this.sequence) this.sequence.answers[Number(input.dataset.bldSequenceIndex)] = input.value;
        if (input.id === "bld-search") { this.query = input.value; if ((event as InputEvent).isComposing) return;
            const start = input.selectionStart || 0; this.rerender(); const next = document.querySelector<HTMLInputElement>("#bld-search"); next?.focus(); next?.setSelectionRange(start, start); }
        if (["bld-word", "bld-keyword"].includes(input.id)) {
            const link = document.querySelector<HTMLAnchorElement>(".bld-image-tools a"); if (link) link.href = "https://www.bing.com/images/search?q=" + encodeURIComponent(this.draft.keyword || this.draft.word);
        }
    }
    private async change(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.id === "bld-entry-group") this.draft.group = input.value as BLDGroup;
        if (input.id === "bld-group") { this.store.group = input.value as BLDGroup; this.question = null; this.sequence = null; this.save(); this.nextEncoding(); }
        if (input.id === "bld-mode") { this.mode = input.value as Mode; this.question = null; this.sequence = null; this.rerender(); }
        if (input.id === "bld-filter") { this.filter = input.value; this.question = null; this.sequence = null; this.rerender(); }
        if (input.id === "bld-sequence-length") { this.sequenceLength = Number(input.value); this.sequence = null; this.rerender(); }
        if (input.id === "bld-scheme") { this.store.scheme = input.value as BLDScheme; this.question = null; this.sequence = null; this.save(); this.nextEncoding(); }
        if (input.id === "bld-import-file" && input.files?.[0]) {
            try {
                const file = input.files[0]; if (file.size > 5 * 1024 * 1024) throw new Error("词库文件不能超过5MB。");
                const value = JSON.parse(await file.text()), incoming = importBLD(value), before = this.store.entries.length;
                this.store.entries = mergeEntries(this.store.entries, incoming);
                if (value.app === "cube-studio-bld") {
                    const imported = loadBLDStore(JSON.stringify(value));
                    this.store.edgeLetters = imported.edgeLetters; this.store.cornerLetters = imported.cornerLetters; this.store.scheme = imported.scheme;
                    this.edgeDraft = this.store.edgeLetters.join(" "); this.cornerDraft = this.store.cornerLetters.join(" ");
                }
                this.notice = "导入完成，新增 " + (this.store.entries.length - before) + " 个词。"; this.save(); this.nextEncoding();
            } catch (error) { this.notice = error.message || "词库文件无法读取。"; this.rerender(); }
        }
    }
}
