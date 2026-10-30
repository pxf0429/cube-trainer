import casesJson from "./data/EOLR.json";
import { CubieCube } from "./lib/CubeLib";
import { EOLRCase, EOLRMatch } from "./lib/EOLRCases";
import { CATEGORIES, EO_PATTERNS, Stored, Favorite, Rating, hasAlignedCenters, keyForCase, loadStored, parseScramble, summarize } from "./lib/Practice";
import { cubeMarkup, hiddenFaces, mappedFacesMarkup } from "./CubeView";
import { icon } from "./Icons";
import { CUBE_COLORS, ColorPart, DEFAULT_CUBE_COLORS, changeCubeColor, cubePalette } from "./lib/CubeColors";
import { BlindfoldTrainer } from "./BlindfoldTrainer";
import { buildLearningGraph } from "./lib/EOLRLearning";

const cases = casesJson as EOLRCase[];
const learning = buildLearningGraph(cases, CATEGORIES);
const orderedCases = [...cases].sort((a, b) => learning.order.indexOf(a.category) - learning.order.indexOf(b.category));
const app = document.querySelector<HTMLDivElement>("#app")!;
const STORAGE_KEY = "eolr-studio:v1";
const BACKGROUND_KEY = "cube-studio:background:v1";
const DEFAULT_BACKGROUND = { start: "#d8e9ff", end: "#f9dce9" };
let background = { ...DEFAULT_BACKGROUND };
try {
    const saved = JSON.parse(localStorage.getItem(BACKGROUND_KEY) || "null");
    if (saved && /^#[0-9a-f]{6}$/i.test(saved.start) && /^#[0-9a-f]{6}$/i.test(saved.end)) {
        const wasDefault = saved.start.toLowerCase() === "#eef6ff" && saved.end.toLowerCase() === "#fff1f7";
        if (!wasDefault) background = { start: saved.start, end: saved.end };
    }
} catch { /* Use the default gradient if the setting cannot be read. */ }
function applyBackground() {
    document.body.style.setProperty("--background-start", background.start);
    document.body.style.setProperty("--background-end", background.end);
}
function saveBackground() {
    applyBackground();
    try { localStorage.setItem(BACKGROUND_KEY, JSON.stringify(background)); }
    catch { toast("背景颜色暂时无法保存。"); }
}
const entities: { [key: string]: string } = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char => entities[char]);
const newId = () => Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16).padStart(8, "0")).join("");
let stored: Stored;
try { stored = loadStored(localStorage.getItem(STORAGE_KEY)); } catch { stored = loadStored(null); }
let trainingModule: "home" | "eolr" | "bld" = "home";
let eolrPausedAt = performance.now();
const blindfold = new BlindfoldTrainer(() => render(), toast);
let tab: "practice" | "library" | "history" = "practice";
let modal: "scramble" | "help" | "case" | null = null;
let referenceStack: string[] = [];
let previousFocus: HTMLElement | null = null;
let ready = false, busy = true, errorMessage = "", requestId = 0, sequence = 0;
let favoriteMode = false, activeCase: string | undefined, search = "";
let netView = false, pitch = -27, yaw = -34, dragging: { x: number; y: number; pitch: number; yaw: number } | null = null;
let colorSettingsOpen = false;
let cube = new CubieCube(), snapshots: CubieCube[] = [], moveHistory: string[] = [];
let current: { id: string; scramble: string; match: EOLRMatch; started: number; elapsed: number; revealed: boolean; recorded: boolean; custom: boolean } | null = null;
let worker: Worker;
let toastTimer: number | undefined;
let modalError = "";

function toast(message: string) {
    const node = document.querySelector<HTMLDivElement>("#toast")!;
    node.textContent = message;
    node.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => node.classList.remove("visible"), 2500);
}
function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); }
    catch { toast("浏览器暂时无法保存记录，本次练习仍可继续。"); }
}
function selectedLabel() {
    if (activeCase) return activeCase.replace(":", " · ");
    return stored.categories.length === CATEGORIES.length ? "全部 9 个大类" : stored.categories.join(" / ");
}
function eoIcon(category: string) {
    const eo = EO_PATTERNS[category] || "000000";
    return '<span class="eo-mini" aria-hidden="true">' + eo.split("").map((bit, i) =>
        '<i class="' + (bit === "1" ? "bad" : "") + (i >= 4 ? " lower" : "") + '"></i>'
    ).join("") + '</span>';
}
function isFavorite() { return !!current && stored.favorites.some(f => f.scramble === current!.scramble); }
function availableFavorites(): Favorite[] {
    return stored.favorites.filter(f => hasAlignedCenters(new CubieCube().apply(f.scramble)));
}
function eligibleFavorites(): Favorite[] {
    return availableFavorites().filter(f => stored.categories.includes(f.key.split(":")[0]) && (!activeCase || activeCase === f.key));
}
function statCards() {
    const stats = summarize(stored.attempts);
    return '<div class="top-stats"><div>' + icon("bolt") + '<span>今日练习<b>' + stats.count + '<small> 题</small></b></span></div><div>' +
        icon("clock") + '<span>平均识别<b>' + (stats.count ? (stats.average / 1000).toFixed(1) : "—") +
        '<small> 秒</small></b></span></div></div>';
}
function moduleNavigation() {
    return '<nav class="module-navigation" aria-label="训练项目">' + (["home", "eolr", "bld"] as const).map(module =>
        '<button data-module="' + module + '" class="' + (module === trainingModule ? "active" : "") + '" aria-current="' +
        (module === trainingModule ? "page" : "false") + '">' + icon(({ home: "home", eolr: "cube", bld: "memory" }[module])) +
        '<span>' + ({ home: "训练首页", eolr: "EOLR 识别", bld: "盲拧记忆" }[module]) + '</span>' + icon("chevron") + '</button>').join("") + '</nav>';
}
function sidebar() {
    const brand = '<header class="site-bar"><a class="brand" href="./" aria-label="魔方训练器首页"><span class="brand-symbol"><img class="brand-logo" src="./favicon.svg?v=2" width="36" height="36" alt="">' +
        '</span><span>CUBE<span class="brand-sub">魔方训练器</span></span></a>' + moduleNavigation() + '</header>';
    if (trainingModule !== "eolr") {
        return brand;
    }
    return brand + '<aside class="sidebar">' +
        '<div class="sidebar-caption">EO 分类索引</div><button class="category all-category ' +
        (stored.categories.length === 9 && !favoriteMode ? "active" : "") + '" data-action="all">' + icon("library") +
        '<span>全部大类</span><span class="count">51</span></button><div class="category-list" aria-label="选择EO大类">' +
        learning.order.map(category => '<button class="category ' + (stored.categories.includes(category) ? "selected" : "") +
            '" data-category="' + category + '" title="' + escape((learning.prerequisites.get(category) || []).length ? "先掌握：" + learning.prerequisites.get(category)!.join("、") : "基础大类") + '" aria-pressed="' + stored.categories.includes(category) + '">' + eoIcon(category) +
            '<span>' + category + '</span><span class="count">' + cases.filter(c => c.category === category).length + '</span><i class="selection-dot"></i></button>').join("") +
        '</div><div class="sidebar-rule"></div><button class="category favorite-category ' + (favoriteMode ? "active" : "") +
        '" data-action="favorites" aria-pressed="' + favoriteMode + '">' + icon("star") + '<span>收藏复习</span><span class="count">' +
        availableFavorites().length + '</span></button>' + (activeCase ? '<div class="target-notice">正在定向练习<br><b>' +
        escape(activeCase.replace(":", " · ")) + '</b><button data-action="clear-target">取消定向 ' + icon("close") + '</button></div>' : "") +
        '<div class="sidebar-bottom"><div class="sidebar-spec"><b>U / M</b><span>LAST SIX EDGES<br>9 大类 · 51 种情形</span></div>' +
        '<button class="help-link" data-action="help">' + icon("help") + ' 使用说明与快捷键</button></div></aside>';
}
function homeView() {
    return '<section class="practice-home" aria-label="训练首页">' +
        '<div class="practice-home-center"><h1>开始练习</h1>' +
        '<div class="practice-home-actions"><button data-module="eolr">EOLR <span>棱块识别</span>' + icon("arrow") + '</button>' +
        '<button data-module="bld">BLD <span>编码记忆</span>' + icon("arrow") + '</button></div></div>' +
        '<section class="background-settings" aria-label="背景颜色设置"><div class="background-settings-heading"><span>背景颜色</span>' +
        '<button class="text-button" data-action="reset-background">恢复默认</button></div><div class="background-colors">' +
        '<label><input type="color" data-background="start" value="' + escape(background.start) + '" aria-label="渐变起始颜色"><span>起始色</span></label>' +
        '<label><input type="color" data-background="end" value="' + escape(background.end) + '" aria-label="渐变结束颜色"><span>结束色</span></label>' +
        '</div></section></section>';
}
function header() {
    return '<div class="trainer-navigation"><header class="page-header">' + statCards() + '</header><nav class="page-tabs" aria-label="主导航">' +
        (["practice", "library", "history"] as const).map(name => '<button class="' + (tab === name ? "active" : "") +
            '" data-tab="' + name + '" aria-current="' + (tab === name ? "page" : "false") + '">' +
            ({ practice: "开始练习", library: "情形图鉴", history: "练习记录" }[name]) + '</button>').join("") +
        '</nav></div>';
}
function answerPanel() {
    const revealed = current && current.revealed;
    const canRate = revealed && !busy;
    const match = current && current.match;
    let body = '<div class="answer-empty"><h3>判断这个状态</h3>' +
        '<p>先判断 EO 大类。<br>再看两块 LR 棱的位置与色相。</p><div class="observation-steps"><span>EO 大类</span><span>LR 位置</span><span>处理方法</span></div>' +
        '<button class="primary reveal-button" data-action="reveal" ' + (!current || busy ? "disabled" : "") + '>' + icon("eye") +
        ' 揭晓识别与解法 <kbd>Space</kbd></button><small>按空格揭晓，再标记掌握程度。</small></div>';
    if (revealed && match) {
        const auf = match.recognitionView.auf;
        body = '<div class="answer-revealed"><div class="case-heading"><span class="case-badge">' + escape(match.category) + '</span><span class="recognition-time">' +
            icon("clock") + (current!.elapsed / 1000).toFixed(1) + 's</span></div><h2>' + escape(match.name) + '</h2>' +
            (auf ? '<div class="basis-note">' + icon("reset") + '<div><b>U 层调整</b><p>先做 <strong>' + escape(auf) + '</strong></p></div></div>' : '') +
            '<div class="answer-section"><span class="section-label"><i></i>如何识别</span><p>' +
            escape(match.recognition) + '</p></div><div class="answer-section solution-section"><span class="section-label"><i></i>怎么处理</span><p>' +
            solutionMarkup(match) + '</p></div><div class="answer-footnote">答案对应初始打乱。</div></div>';
    }
    return '<section class="answer-card"><div class="card-top"><span>' + icon("library") + ' 识别笔记</span><span class="soft-label">' +
        (revealed ? "已揭晓" : "待观察") + '</span></div>' + body + '<div class="rating-section"><span>这一题，掌握得怎么样？</span><div><button class="rating again" data-rating="again" ' +
        (!canRate ? "disabled" : "") + '>' + icon("reset") + ' 还需练习<kbd>2</kbd></button><button class="rating known" data-rating="known" ' +
        (!canRate ? "disabled" : "") + '>' + icon("check") + ' 已掌握<kbd>1</kbd></button></div></div></section>';
}
function colorSettings() {
    if (!colorSettingsOpen) return "";
    const palette = cubePalette(stored.cubeColors);
    const fields: { part: ColorPart; label: string; color: number }[] = [
        { part: "left", label: "左桥", color: palette[4] },
        { part: "right", label: "右桥", color: palette[5] },
        { part: "bottom", label: "底面", color: palette[1] },
    ];
    return '<section class="color-settings" id="cube-colors" aria-label="魔方配色设置"><div class="color-settings-heading"><b>魔方配色</b>' +
        '<button class="text-button" data-action="reset-colors">恢复默认</button></div><p>按复原状态设置。左右桥相对，其余面自动匹配。</p>' +
        '<div class="color-fields">' + fields.map(field => '<label><span>' + field.label + '</span><div class="color-select"><i style="--swatch:' +
            CUBE_COLORS[field.color].hex + '" aria-hidden="true"></i><select data-color-part="' + field.part + '" aria-label="' + field.label + '颜色">' +
            CUBE_COLORS.map((color, index) => field.part !== "bottom" && (index === palette[0] || index === palette[1]) ? "" :
                '<option value="' + index + '" ' + (index === field.color ? "selected" : "") + '>' + color.name + '</option>').join("") +
            '</select></div></label>').join("") + '</div><div class="color-scheme-preview" aria-label="当前六面配色">' +
        ["顶", "底", "前", "后", "左", "右"].map((name, i) => '<span><i style="--swatch:' + CUBE_COLORS[palette[i]].hex +
            '"></i>' + name + ' · ' + CUBE_COLORS[palette[i]].name + '</span>').join("") + '</div></section>';
}
function practiceView() {
    if (favoriteMode && !eligibleFavorites().length) return '<section class="empty-page"><span class="empty-icon">' + icon("star") +
        '</span><h2>' + (availableFavorites().length ? "当前筛选内还没有收藏" : stored.favorites.length ? "暂无可练习的收藏" : "还没有收藏题目") +
        '</h2><p>' + (availableFavorites().length ? "选择全部大类，查看收藏题目。" : stored.favorites.length ? "练习打乱的顶底色中心需位于顶面和底面。" : "点击练习题右上角的星标，加入收藏。") +
        '</p><button class="primary" data-action="' + (availableFavorites().length ? "all-favorites" : "favorites") + '">' +
        (availableFavorites().length ? "查看全部收藏" : "返回随机练习") + '</button></section>';
    const disabled = !current || busy;
    const isCustom = current?.custom && !busy;
    const rangeCount = isCustom || activeCase ? 1 : cases.filter(c => stored.categories.includes(c.category)).length;
    return '<div class="practice-toolbar"><div><span class="session-dot"></span><b>' + (isCustom ? "自定义练习" : favoriteMode ? "收藏复习" : "自由练习") +
        '</b><span class="toolbar-separator"></span><span>' + escape(isCustom ? "你的打乱" : selectedLabel()) + '</span><span class="soft-label">' + rangeCount +
        ' 种情形</span></div><button class="text-button" data-action="custom">' + icon("keyboard") + ' 输入打乱</button></div>' +
        '<section class="scramble-card"><span class="section-label">打乱</span><div class="scramble-text">' +
        (busy ? '<span class="loading-line">' + (ready ? "正在准备下一题…" : "正在准备题目…") + '</span>' : current ? escape(current.scramble) :
            '<span class="error-inline">' + escape(errorMessage || "暂时没有题目") + '</span>') + '</div><button class="icon-button" data-action="copy" aria-label="复制打乱" title="复制打乱" ' +
        (disabled ? "disabled" : "") + '>' + icon("copy") + '</button></section>' +
        '<div class="practice-grid"><section class="cube-card"><div class="cube-card-top"><span class="case-number">魔方观察</span>' +
        '<div class="view-switch"><button data-view="3d" class="' + (!netView ? "active" : "") +
        '" aria-pressed="' + !netView + '">立体视图</button><button data-view="net" class="' + (netView ? "active" : "") + '" aria-pressed="' +
        netView + '">六面展开</button></div><button class="icon-button favorite-button ' + (isFavorite() ? "is-favorite" : "") +
        '" data-action="star" aria-label="' + (isFavorite() ? "取消收藏当前题目" : "收藏当前题目") + '" aria-pressed="' + isFavorite() +
        '" title="收藏当前题目" ' + (disabled ? "disabled" : "") + '>' + icon("star") + '</button></div>' +
        '<div class="cube-stage ' + (busy ? "is-loading" : "") + '">' +
        (busy ? '<div class="stage-loading"><div class="loading-cube">' + icon("cube") + '</div><span>正在生成题目…</span></div>' :
            current ? cubeMarkup(cube, netView, stored.focusLR, pitch, yaw, stored.cubeColors) : '<div class="stage-error">' + icon("help") + '<p>' + escape(errorMessage) +
            '</p><button class="primary" data-action="retry">重新准备</button></div>') +
        '<div class="stage-top-line"><span>' + (moveHistory.length ? "已操作 " + moveHistory.length + " 步" : "观察 EO，再寻找 LR") +
        '</span><span class="stage-time">' + icon("clock") + '<b data-timer>0.0</b><small>s</small></span></div>' +
        (!netView && current && !busy ? '<div class="camera-hint">拖动魔方旋转视角 <span>·</span> <button data-camera="home">复位视角</button></div>' : "") + '</div>' +
        '<div class="cube-options"><label class="switch-label"><input type="checkbox" id="focus-lr" ' + (stored.focusLR ? "checked" : "") +
        '><span class="toggle-track"></span>聚焦 LR 色块</label><div class="camera-actions"><button class="color-settings-toggle ' + (colorSettingsOpen ? 'active' : '') +
        '" data-action="colors" aria-expanded="' + colorSettingsOpen + '" aria-controls="cube-colors">' + icon("palette") + ' 配色</button>' +
        '<button data-camera="back" title="观察背面">背面</button><button data-camera="bottom" title="观察底面">底面</button>' +
        '<button data-action="reset" ' + (disabled ? "disabled" : "") + '>' + icon("reset") + ' 重置</button></div></div>' +
        colorSettings() +
        '<div class="move-controls" aria-label="操作虚拟魔方">' + ["U", "U'", "U2", "M", "M'", "M2"].map((move, i) =>
            '<button data-move="' + move + '" ' + (disabled ? "disabled" : "") + '><b>' + move + '</b><kbd>' + ["J", "F", "⇧J", "K", "I", "⇧K"][i] +
            '</kbd></button>').join("") + '<button class="undo-button" data-action="undo" aria-label="撤销一步" title="撤销一步" ' +
            (!moveHistory.length || busy ? "disabled" : "") + '>' + icon("reset") + '</button></div></section>' + answerPanel() + '</div>' +
        '<div class="session-footer"><div>' + icon("keyboard") + '<span><kbd>Space</kbd> 揭晓 / 下一题 <span class="footer-dot">·</span> <kbd>Enter</kbd> 重置魔方</span></div>' +
        '<button class="next-button" data-action="next" ' + (busy ? "disabled" : "") + '>' + (current && current.revealed ? "下一题" : "跳过这一题") +
        ' ' + icon("arrow") + '</button></div>' + (errorMessage && current ? '<div class="inline-warning" role="alert">' + escape(errorMessage) + '</div>' : "") +
        '<div class="mobile-actionbar" aria-label="手机练习操作">' + (current?.revealed
            ? '<button class="rating again" data-rating="again" ' + (busy ? "disabled" : "") + '>' + icon("reset") +
              ' 还需练习</button><button class="rating known" data-rating="known" ' + (busy ? "disabled" : "") + '>' + icon("check") +
              ' 已掌握</button><button class="icon-button" data-action="next" aria-label="下一题" ' + (busy ? "disabled" : "") + '>' + icon("arrow") + '</button>'
            : '<button class="primary" data-action="reveal" ' + (disabled ? "disabled" : "") + '>' + icon("eye") +
              ' 揭晓识别与解法</button><button class="icon-button" data-action="next" aria-label="跳过这一题" ' + (busy ? "disabled" : "") + '>' + icon("arrow") + '</button>') + '</div>';
}
function caseReferenceLink(targetKey: string, label?: string) {
    const target = learning.byKey.get(targetKey);
    if (!target) return escape(label || targetKey);
    return '<a class="case-reference" aria-haspopup="dialog" href="#eolr-case=' + encodeURIComponent(targetKey) + '" data-case-reference="' + escape(targetKey) +
        '" title="查看' + escape(target.category + ' · ' + target.name) + '的做法">' + escape(label || target.category + " · " + target.name) + '</a>';
}
function solutionMarkup(item: EOLRCase) {
    const references = learning.references.get(keyForCase(item)) || [];
    let cursor = 0, result = "";
    for (const reference of references) {
        result += escape(item.solution.slice(cursor, reference.start)).replace(/\n/g, "<br>") + caseReferenceLink(reference.targetKey, reference.text);
        cursor = reference.end;
    }
    return result + escape(item.solution.slice(cursor)).replace(/\n/g, "<br>");
}
function libraryGroups() {
    const term = search.trim().toLowerCase();
    const filtered = orderedCases.filter(c => stored.categories.includes(c.category)
        && (!term || (c.category + c.name + c.recognition).toLowerCase().includes(term)));
    if (!filtered.length) return '<div class="search-empty" role="status">没有找到相关情形，试试其他关键词或选择其他大类。</div>';
    return '<div class="library-result-count" role="status">' + (term ? '找到 ' : '当前显示 ') + filtered.length + ' 种情形</div>' +
        learning.order.map(category => {
            const items = filtered.filter(item => item.category === category);
            if (!items.length) return "";
            const headingId = "library-category-" + category.replace(/\//g, "-");
            return '<section class="library-group" aria-labelledby="' + headingId + '"><header class="library-group-heading"><div>' + eoIcon(category) +
                '<h3 id="' + headingId + '">' + category + '</h3><span>EO 大类</span></div><span>' + items.length + ' 种情形</span></header>' +
                '<div class="library-columns" aria-hidden="true"><span>情形</span><span>识别条件</span></div>' +
                items.map(item => '<details class="library-entry" data-case-details="' + escape(keyForCase(item)) + '"><summary><span class="library-entry-name">' +
                    escape(item.name) + '</span><span class="library-recognition">' + escape(item.recognition) + '</span><span class="library-disclosure">' + icon("chevron") +
                    '</span></summary><div class="library-entry-body"><span class="library-solution-label">处理思路</span><div class="library-solution">' + solutionMarkup(item) +
                    '</div><button class="text-button" data-train-case="' + escape(keyForCase(item)) + '">练习这一情形 ' + icon("arrow") + '</button></div></details>').join("") + '</section>';
        }).join("");
}
function libraryView() {
    return '<div class="section-heading library-heading"><div><h2>情形图鉴</h2><p>按大类查阅，点开情形查看处理思路。</p></div>' +
        '<label class="search-box">' + icon("search") + '<input id="library-search" type="search" placeholder="搜索名称、识别线索…" value="' + escape(search) +
        '" aria-label="搜索情形"></label></div><div class="library-index" id="library-index">' + libraryGroups() + '</div>';
}
function historyView() {
    const summary = summarize(stored.attempts);
    const recent = stored.attempts.slice(-12).reverse();
    return '<div class="section-heading"><div><h2>练习记录</h2><p>查看识别耗时与掌握情况。记录仅保存在当前浏览器，可导出备份。</p></div><div class="backup-actions"><button class="text-button" data-action="import">' +
        icon("reset") + ' 导入备份</button><button class="outline-button" data-action="export">' + icon("download") + ' 导出记录</button></div></div>' +
        '<div class="history-stats"><div><span>今日已练</span><b>' + summary.count + '<small> 题</small></b></div><div><span>今日自评掌握率</span><b>' +
        summary.rate + '<small> %</small></b></div><div><span>累计覆盖情形</span><b>' + new Set(stored.attempts.map(a => a.key)).size +
        '<small> / 51</small></b></div><div><span>收藏待复习</span><b>' + availableFavorites().length + '<small> 题</small></b></div></div>' +
        '<section class="history-card"><div class="card-top"><span>各大类练习情况</span><span class="soft-label">累计记录</span></div><div class="table-scroll"><table><thead><tr><th>EO 大类</th><th>练习次数</th><th>已覆盖情形</th><th>平均识别</th><th>自评掌握率</th><th></th></tr></thead><tbody>' +
        learning.order.map(category => {
            const items = stored.attempts.filter(a => a.category === category);
            const rated = items.filter(a => a.rating !== "viewed");
            const rate = rated.length ? Math.round(rated.filter(a => a.rating === "known").length / rated.length * 100) : 0;
            return '<tr><td><span class="table-category">' + eoIcon(category) + '<b>' + category + '</b></span></td><td>' + items.length + '</td><td>' +
                new Set(items.map(a => a.key)).size + ' / ' + cases.filter(c => c.category === category).length + '</td><td>' +
                (items.length ? (items.reduce((sum, a) => sum + a.elapsed, 0) / items.length / 1000).toFixed(1) + 's' : '—') +
                '</td><td><span class="progress-track"><i style="width:' + rate + '%"></i></span><span>' + (rated.length ? rate + "%" : "—") +
                '</span></td><td><button class="text-button" data-practice-category="' + category + '">去练习 ' + icon("arrow") + '</button></td></tr>';
        }).join("") + '</tbody></table></div></section>' +
        '<section class="history-card recent-card"><div class="card-top"><span>最近练过</span><span class="soft-label">最近 12 题</span></div>' +
        (recent.length ? '<div class="recent-list">' + recent.map(a => '<div>' + eoIcon(a.category) + '<span><b>' + escape(a.category + " · " + a.name) +
            '</b><small>' + new Date(a.at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) +
            '</small></span><span class="recent-time">' + (a.elapsed / 1000).toFixed(1) + 's</span><span class="rating-tag ' + a.rating + '">' +
            ({ known: "已掌握", again: "还需练习", viewed: "已查看" }[a.rating]) + '</span></div>').join("") + '</div>' :
            '<div class="history-empty">完成第一题后，你的练习记录会出现在这里。</div>') + '</section>' +
        '<input id="backup-file" type="file" accept=".json,application/json" hidden>';
}
function modalView() {
    if (!modal) return "";
    if (modal === "case") {
        const targetKey = referenceStack[referenceStack.length - 1], item = learning.byKey.get(targetKey);
        if (!item) return "";
        return '<div class="modal-backdrop"><section class="modal case-reference-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><h2 id="modal-title">' +
            escape(item.category + " · " + item.name) + '</h2><button class="icon-button" data-action="close-modal" aria-label="关闭">' + icon("close") + '</button></div>' +
            (referenceStack.length > 1 ? '<button class="text-button reference-back" data-action="reference-back">' + icon("arrow") + ' 返回上一情形</button>' : '') +
            '<div class="reference-case-body"><section><h3>如何识别</h3><p>' + escape(item.recognition) + '</p></section><section><h3>怎么处理</h3><p>' + solutionMarkup(item) + '</p></section></div>' +
            '<div class="reference-case-actions"><button class="primary" data-train-case="' + escape(targetKey) + '">练习这一情形 ' + icon("arrow") + '</button><button class="text-button" data-action="close-modal">返回</button></div></section></div>';
    }
    return '<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><h2 id="modal-title">' +
        (modal === "scramble" ? "输入打乱" : "使用说明与快捷键") + '</h2><button class="icon-button" data-action="close-modal" aria-label="关闭">' +
        icon("close") + '</button></div>' + (modal === "scramble" ? '<p>仅支持 U / M 转动，顶底色中心需位于顶面和底面。</p><label class="input-label" for="custom-scramble">打乱公式</label>' +
        '<textarea id="custom-scramble" rows="4" placeholder="例如：M\' U M2 U M\'" spellcheck="false"></textarea><div class="modal-error" role="alert">' + escape(modalError) +
        '</div><button class="primary" data-action="submit-scramble">开始这道题 ' + icon("arrow") + '</button>' :
        '<p>观察 EO → 识别 LR → 想好解法。按空格揭晓，完成后标记掌握程度。</p><div class="shortcut-list"><div><span>揭晓 / 下一题</span><kbd>Space</kbd></div><div><span>重置初始打乱</span><kbd>Enter</kbd></div>' +
        '<div><span>U / U\'</span><kbd>J / F</kbd></div><div><span>M / M\'</span><kbd>K / I</kbd></div><div><span>U2 / M2</span><kbd>Shift + J / K</kbd></div><div><span>已掌握 / 还需练习</span><kbd>1 / 2</kbd></div><div><span>撤销一步</span><kbd>←</kbd></div></div>' +
        '<div class="help-note">“聚焦 LR”保留其他色块的彩色边框，帮助你同时辨认 EO。答案对应初始打乱。</div>' +
        '<div class="credits"><a href="./NOTICE.md" target="_blank" rel="noreferrer">关于与致谢</a> · <a href="./LICENSE" target="_blank" rel="noreferrer">开源许可</a></div>') + '</section></div>';
}
function render() {
    const expandedCases = new Set(Array.from(app.querySelectorAll<HTMLDetailsElement>('details[data-case-details][open]')).map(node=>node.dataset.caseDetails));
    app.innerHTML = '<div class="app-shell module-' + trainingModule + '">' + sidebar() + '<main>' +
        (trainingModule === "home" ? homeView() : trainingModule === "bld" ? blindfold.markup() : header() +
        (tab === "practice" ? practiceView() : tab === "library" ? libraryView() : historyView()) +
        '<footer class="page-footnote"><button data-action="help">使用说明与许可</button></footer>') + '</main></div>' + modalView();
    app.querySelectorAll<HTMLDetailsElement>('details[data-case-details]').forEach(node=>node.open=expandedCases.has(node.dataset.caseDetails));
    const bldRoot = app.querySelector<HTMLElement>("#bld-app"); if (bldRoot) blindfold.mount(bldRoot);
    updateTimer();
}
function updateTimer() {
    const node = app.querySelector<HTMLElement>("[data-timer]");
    if (node) node.textContent = current && !busy
        ? ((current.revealed ? current.elapsed : performance.now() - current.started) / 1000).toFixed(1) : "0.0";
}
window.setInterval(updateTimer, 100);

function setCase(scramble: string, custom = false) {
    try {
        const parsed = parseScramble(scramble);
        current = { id: newId(), scramble: parsed.scramble, match: parsed.match, started: performance.now(), elapsed: 0, revealed: false, recorded: false, custom };
        cube = parsed.cube;
        snapshots = [cube];
        moveHistory = [];
        errorMessage = "";
        busy = false;
        if (trainingModule !== "eolr") eolrPausedAt = performance.now();
        sequence++;
        pitch = -27; yaw = -34;
        render();
        if (trainingModule === "eolr" && tab === "practice" && sequence > 1 && window.matchMedia("(max-width: 700px)").matches) {
            app.querySelector(".scramble-card")?.scrollIntoView({ block: "start" });
        }
    } catch (error) {
        busy = false;
        errorMessage = error.message;
        render();
    }
}
function record(rating: Rating) {
    if (!current || !current.revealed) return;
    if (current.recorded) {
        if (rating === "viewed") return;
        const existing = stored.attempts.find(attempt => attempt.id === current!.id);
        if (existing) { existing.rating = rating; save(); }
        return;
    }
    stored.attempts.push({ id: current.id, key: keyForCase(current.match), category: current.match.category,
        name: current.match.name, elapsed: current.elapsed, rating, at: Date.now() });
    stored.attempts = stored.attempts.slice(-1000);
    current.recorded = true;
    save();
}
function next(force = false) {
    if (!ready || (busy && !force)) return;
    record("viewed");
    errorMessage = "";
    requestId++;
    if (favoriteMode) {
        const pool = eligibleFavorites();
        if (!pool.length) { toast("当前筛选内没有收藏，试试选择全部大类。"); render(); return; }
        const alternatives = pool.filter(f => f.scramble !== current?.scramble);
        const source = alternatives.length ? alternatives : pool;
        setCase(source[Math.floor(Math.random() * source.length)].scramble);
        return;
    }
    busy = true;
    render();
    worker.postMessage({ type: "generate", id: requestId, categories: stored.categories, caseKey: activeCase });
}
function reveal() {
    if (!current || current.revealed || busy) return;
    current.elapsed = performance.now() - current.started;
    current.revealed = true;
    record("viewed");
    render();
    if (window.matchMedia("(max-width: 700px)").matches) app.querySelector(".answer-card")?.scrollIntoView({ block: "start" });
}
function move(value: string) {
    if (!current || busy || modal || tab !== "practice" || trainingModule !== "eolr") return;
    cube = cube.apply(value);
    moveHistory.push(value);
    snapshots.push(cube);
    render();
}
function reset() {
    if (!current || busy) return;
    cube = new CubieCube().apply(current.scramble);
    snapshots = [cube]; moveHistory = [];
    render();
}
function openModal(value: "scramble" | "help") {
    previousFocus = document.activeElement as HTMLElement;
    modal = value; modalError = ""; render();
    window.requestAnimationFrame(() => app.querySelector<HTMLElement>(value === "scramble" ? "#custom-scramble" : ".modal [data-action=close-modal]")?.focus());
}
function closeModal() {
    modal = null; modalError = ""; render();
    // Restore focus to an equivalent button after re-rendering.
    const action = previousFocus?.dataset.action;
    if (action) app.querySelector<HTMLElement>('[data-action="' + action + '"]')?.focus();
    const reference = previousFocus?.dataset.caseReference;
    if (reference) Array.from(app.querySelectorAll<HTMLElement>('[data-case-reference]')).find(node => node.dataset.caseReference === reference)?.focus();
}
function openCaseReference(targetKey: string) {
    if (!learning.byKey.has(targetKey)) return;
    if (modal !== "case") { previousFocus = document.activeElement as HTMLElement; referenceStack = [targetKey]; }
    else {
        const index = referenceStack.indexOf(targetKey);
        referenceStack = index === -1 ? [...referenceStack, targetKey] : referenceStack.slice(0, index + 1);
    }
    modal = "case"; render();
    window.requestAnimationFrame(() => app.querySelector<HTMLElement>('.case-reference-modal [data-action="close-modal"]')?.focus());
}
function initializeWorker() {
    worker?.terminate();
    ready = false; busy = true; errorMessage = ""; render();
    worker = new Worker("./generator.worker.js", { type: "module" });
    worker.onmessage = event => {
        const message = event.data;
        if (message.type === "ready") { ready = true; busy = false; if (!current) next(); else render(); }
        else if (message.type === "case" && message.id === requestId) setCase(message.scramble);
        else if (message.type === "error" && (!message.id || message.id === requestId)) {
            busy = false; errorMessage = message.message; render();
        }
    };
    worker.onerror = () => { ready = false; busy = false; errorMessage = "出题器未能启动，请点击重新准备。"; render(); };
    worker.postMessage({ type: "init" });
}

app.addEventListener("click", async event => {
    const target = (event.target as Element).closest<HTMLElement>("button, a[data-case-reference]");
    if (!target || target.hasAttribute("disabled")) return;
    if (target.dataset.action === "reset-background") {
        background = { ...DEFAULT_BACKGROUND }; saveBackground(); render();
        app.querySelector<HTMLElement>('[data-action="reset-background"]')?.focus(); return;
    }
    if (target.dataset.module) {
        const nextModule = target.dataset.module as typeof trainingModule;
        if (nextModule === trainingModule) return;
        if (trainingModule === "eolr") eolrPausedAt = performance.now();
        if (nextModule === "eolr" && current && !current.revealed) current.started += Math.max(0, performance.now() - eolrPausedAt);
        trainingModule = nextModule; modal = null; render();
        if (trainingModule === "eolr" && !worker) initializeWorker();
        window.scrollTo({ top: 0 }); return;
    }
    if (trainingModule !== "eolr") return;
    if (target.dataset.caseReference) { event.preventDefault(); openCaseReference(target.dataset.caseReference); return; }
    if (target.dataset.tab) {
        const previousTab = tab;
        tab = target.dataset.tab as typeof tab;
        render();
        if (tab === "practice" && previousTab !== "practice") next(true);
        return;
    }
    if (target.dataset.category) {
        const category = target.dataset.category;
        if (stored.categories.length === 9) stored.categories = [category];
        else if (stored.categories.includes(category)) {
            if (stored.categories.length === 1) { toast("至少保留一个大类，或点击“全部大类”。"); return; }
            stored.categories = stored.categories.filter(c => c !== category);
        } else stored.categories.push(category);
        activeCase = undefined; save(); render();
        if (tab === "practice") next(true);
        return;
    }
    if (target.dataset.trainCase) {
        modal = null;
        activeCase = target.dataset.trainCase;
        stored.categories = [activeCase.split(":")[0]]; favoriteMode = false; tab = "practice";
        save(); render(); next(true); return;
    }
    if (target.dataset.practiceCategory) {
        stored.categories = [target.dataset.practiceCategory]; activeCase = undefined; favoriteMode = false; tab = "practice";
        save(); render(); next(true); return;
    }
    if (target.dataset.move) { move(target.dataset.move); return; }
    if (target.dataset.rating) { record(target.dataset.rating as Rating); next(); return; }
    if (target.dataset.view) { netView = target.dataset.view === "net"; render(); return; }
    if (target.dataset.camera) {
        [pitch, yaw] = target.dataset.camera === "back" ? [-25, 145] : target.dataset.camera === "bottom" ? [55, -35] : [-27, -34];
        netView = false; render(); return;
    }
    switch (target.dataset.action) {
        case "all": stored.categories = [...CATEGORIES]; activeCase = undefined; favoriteMode = false; save(); render(); if (tab === "practice") next(true); break;
        case "favorites": favoriteMode = !favoriteMode; activeCase = undefined; stored.categories = [...CATEGORIES]; tab = "practice"; save(); render(); next(true); break;
        case "all-favorites": stored.categories = [...CATEGORIES]; activeCase = undefined; save(); render(); next(true); break;
        case "clear-target": activeCase = undefined; render(); if (tab === "practice") next(true); break;
        case "reveal": reveal(); break;
        case "next": next(); break;
        case "reset": reset(); break;
        case "colors": colorSettingsOpen = !colorSettingsOpen; render(); app.querySelector<HTMLElement>('[data-action="colors"]')?.focus(); break;
        case "reset-colors": stored.cubeColors = { ...DEFAULT_CUBE_COLORS }; save(); render(); app.querySelector<HTMLElement>('[data-action="reset-colors"]')?.focus(); break;
        case "undo": if (snapshots.length > 1) { snapshots.pop(); moveHistory.pop(); cube = snapshots[snapshots.length - 1]; render(); } break;
        case "retry": initializeWorker(); break;
        case "custom": openModal("scramble"); break;
        case "help": openModal("help"); break;
        case "close-modal": closeModal(); break;
        case "reference-back": referenceStack.pop(); render(); app.querySelector<HTMLElement>('.case-reference-modal [data-action="close-modal"]')?.focus(); break;
        case "submit-scramble": {
            const textarea = app.querySelector<HTMLTextAreaElement>("#custom-scramble")!;
            try {
                const parsed = parseScramble(textarea.value);
                requestId++; record("viewed"); modal = null; favoriteMode = false;
                activeCase = undefined; setCase(parsed.scramble, true);
            } catch (error) {
                modalError = error.message;
                const node = app.querySelector<HTMLElement>(".modal-error"); if (node) node.textContent = modalError;
                textarea.focus();
            }
            break;
        }
        case "star": if (current) {
            if (isFavorite()) stored.favorites = stored.favorites.filter(f => f.scramble !== current!.scramble);
            else stored.favorites.push({ id: newId(), key: keyForCase(current.match), scramble: current.scramble, at: Date.now() });
            save(); render(); toast(isFavorite() ? "已收藏，可在“收藏复习”中再练。" : "已取消收藏");
        } break;
        case "copy": if (current) {
            try { await navigator.clipboard.writeText(current.scramble); toast("打乱已复制"); }
            catch { toast("复制不可用，可以直接选中打乱文字复制。"); }
        } break;
        case "export": {
            const blob = new Blob([JSON.stringify({ app: "eolr-studio", version: 1, ...stored }, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob), link = document.createElement("a");
            link.href = url; link.download = "eolr-practice-" + new Date().toISOString().slice(0, 10) + ".json";
            link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            toast("练习记录与收藏已导出"); break;
        }
        case "import": app.querySelector<HTMLInputElement>("#backup-file")?.click(); break;
    }
});
app.addEventListener("change", async event => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.background === "start" || input.dataset.background === "end") {
        if (/^#[0-9a-f]{6}$/i.test(input.value)) { background[input.dataset.background] = input.value; saveBackground(); }
        return;
    }
    if (trainingModule !== "eolr") return;
    if (input.dataset.colorPart) {
        const part = input.dataset.colorPart as ColorPart;
        stored.cubeColors = changeCubeColor(stored.cubeColors, part, Number(input.value));
        save(); render();
        app.querySelector<HTMLElement>('[data-color-part="' + part + '"]')?.focus();
    }
    if (input.id === "focus-lr") { stored.focusLR = input.checked; save(); render(); }
    if (input.id === "backup-file" && input.files?.[0]) {
        try {
            const file = input.files[0];
            if (file.size > 2 * 1024 * 1024) throw new Error("备份文件不能超过2MB");
            const raw = JSON.parse(await file.text());
            if (raw.app !== "eolr-studio" || raw.version !== 1) throw new Error("请选择本练习室导出的记录文件");
            const imported = loadStored(JSON.stringify(raw));
            stored.attempts = Array.from(new Map([...stored.attempts, ...imported.attempts].map(a => [a.id, a])).values()).sort((a, b) => a.at - b.at).slice(-1000);
            stored.favorites = Array.from(new Map([...stored.favorites, ...imported.favorites].map(f => [f.scramble, f])).values()).slice(-500);
            save(); render(); toast("记录与收藏已合并");
        } catch (error) { toast(error.message || "文件无法读取"); }
    }
});
app.addEventListener("input", event => {
    if (trainingModule !== "eolr") return;
    const input = event.target as HTMLInputElement;
    if (input.id === "library-search") {
        search = input.value;
        const expanded = new Set(Array.from(app.querySelectorAll<HTMLDetailsElement>('details[data-case-details][open]')).map(node=>node.dataset.caseDetails));
        app.querySelector("#library-index")!.innerHTML = libraryGroups();
        app.querySelectorAll<HTMLDetailsElement>('details[data-case-details]').forEach(node=>node.open=expanded.has(node.dataset.caseDetails));
    }
});
app.addEventListener("pointerdown", event => {
    if (!(event.target as Element).closest("[data-cube-drag]")) return;
    dragging = { x: event.clientX, y: event.clientY, pitch, yaw };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
});
app.addEventListener("pointermove", event => {
    if (!dragging) return;
    pitch = Math.max(-85, Math.min(85, dragging.pitch - (event.clientY - dragging.y) * 0.45));
    yaw = dragging.yaw + (event.clientX - dragging.x) * 0.45;
    const rig = app.querySelector<HTMLElement>(".cube-rig");
    if (rig) rig.style.transform = "rotateX(" + pitch + "deg) rotateY(" + yaw + "deg)";
    const mappings = app.querySelector<HTMLElement>(".cube-mappings");
    const faces = hiddenFaces(pitch, yaw).join(",");
    if (mappings && mappings.dataset.faces !== faces) {
        mappings.dataset.faces = faces;
        mappings.innerHTML = mappedFacesMarkup(cube, stored.focusLR, pitch, yaw, stored.cubeColors);
    }
});
app.addEventListener("pointerup", () => dragging = null);
app.addEventListener("pointercancel", () => dragging = null);
window.addEventListener("keydown", event => {
    if (event.key === "Escape" && modal) { event.preventDefault(); closeModal(); return; }
    if (modal && event.key === "Tab") {
        const elements = Array.from(app.querySelectorAll<HTMLElement>(".modal button, .modal textarea, .modal a"));
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || modal || tab !== "practice" || trainingModule !== "eolr") return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable=true]") || (target.closest("button") && (event.key === " " || event.key === "Enter"))) return;
    if (event.key === " ") { event.preventDefault(); current?.revealed ? next() : reveal(); }
    else if (event.key === "Enter") { event.preventDefault(); reset(); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); if (snapshots.length > 1) { snapshots.pop(); moveHistory.pop(); cube = snapshots[snapshots.length - 1]; render(); } }
    else if (event.key === "1" && current?.revealed && !busy) { record("known"); next(); }
    else if (event.key === "2" && current?.revealed && !busy) { record("again"); next(); }
    else {
        const key = event.key.toLowerCase();
        const mapping: { [key: string]: string } = { j: event.shiftKey ? "U2" : "U", f: "U'", k: event.shiftKey ? "M2" : "M", i: "M'", e: "M'", d: "M" };
        if (mapping[key]) { event.preventDefault(); move(mapping[key]); }
    }
});
applyBackground();
render();

