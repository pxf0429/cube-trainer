import { LSEEngine } from "./lib/LSEEngine";
let engine: LSEEngine;
const channel = self as any;
channel.onmessage = (event: MessageEvent) => {
    const { type, id, categories, caseKey } = event.data;
    try {
        if (type === "init") {
            engine = new LSEEngine();
            channel.postMessage({ type: "ready", count: engine.practiceStateCount });
        } else if (type === "generate") {
            if (!engine) throw new Error("出题器尚未就绪");
            channel.postMessage({ type: "case", id, ...engine.sample(categories, caseKey) });
        }
    } catch (error) {
        channel.postMessage({ type: "error", id, message: error.message || "出题失败，请重试" });
    }
};
