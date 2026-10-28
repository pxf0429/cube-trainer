import { MemoryImage, sanitizeImage } from "./Blindfold";
const plain = (text: string) => text.replace(/<[^>]*>/g, "").replace(/&[a-z#0-9]+;/gi, " ").trim();
export function parseImageResults(data: any): MemoryImage[] {
    const pages = data?.query?.pages;
    if (!Array.isArray(pages)) return [];
    return [...pages].sort((a, b) => (a.index || 0) - (b.index || 0)).map(page => {
        const info = page.imageinfo?.[0];
        const rasterizedSvg = info?.mime === "image/svg+xml" && /\.png(?:\?|$)/i.test(info.thumburl || "");
        if (!info || (info.mime && !/^image\/(jpeg|png|webp)$/.test(info.mime) && !rasterizedSvg)) return undefined;
        return sanitizeImage({ url: info.thumburl || info.url, source: info.descriptionurl, title: page.title?.replace(/^File:/, ""),
            author: plain(info.extmetadata?.Artist?.value || ""), license: plain(info.extmetadata?.LicenseShortName?.value || ""),
            match: page.memoryMatch?.kind === "entity" ? "entity" : "candidate", recommended: page.memoryMatch?.recommended === true,
            meaning: [page.memoryMatch?.label, page.memoryMatch?.description].filter(Boolean).join(" · ") });
    }).filter((value): value is MemoryImage => !!value);
}
export async function searchMemoryImages(keyword: string, signal?: AbortSignal, more = false): Promise<MemoryImage[]> {
    const query = keyword.trim().slice(0, 100);
    if (!query) throw new Error("先输入联想词或搜索关键词。");
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    const timer = window.setTimeout(cancel, 25000);
    try {
        const params = new URLSearchParams({ action: "query", generator: "search", gsrsearch: query + " filetype:bitmap", gsrnamespace: "6", gsrlimit: "8",
            prop: "imageinfo", iiprop: "url|mime|extmetadata", iiurlwidth: "480", format: "json", formatversion: "2", origin: "*" });
        const commonsUrl = "https://commons.wikimedia.org/w/api.php?" + params.toString();
        const staticSite = typeof location !== "undefined" && location.hostname.endsWith(".github.io");
        let response = await fetch(staticSite ? commonsUrl : "./api/memory-images?q=" + encodeURIComponent(query) + (more ? "&more=1" : ""), { signal: controller.signal, credentials: "omit" });
        // A static deployment can use the public CORS API directly.
        if (response.status === 404 && !staticSite) response = await fetch(commonsUrl, { signal: controller.signal, credentials: "omit" });
        if (response.status === 429) throw new Error("图片服务请求较多，请稍后重试，词条已保留。");
        if (!response.ok) throw new Error("图片服务暂时不可用，请稍后重试。");
        const data = await response.json();
        if (data.error) throw new Error("图片搜索未完成，请换一个关键词。");
        return parseImageResults(data);
    } catch (error) {
        if (signal?.aborted) throw new Error("已停止搜索。");
        if (error.name === "AbortError") throw new Error("图片搜索超时，可重试、换英文关键词，或填写图片地址。");
        throw new Error(error.message === "Failed to fetch" ? "暂时连不上图片服务，可重试或使用外部图片搜索。" : error.message);
    } finally { window.clearTimeout(timer); signal?.removeEventListener("abort", cancel); }
}
