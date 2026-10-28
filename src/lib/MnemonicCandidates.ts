import wordsJson from "../data/BLDCandidates.json";
import imagesJson from "../data/BLDCandidateImages.json";
import { MemoryImage, parseCode, sanitizeImage } from "./Blindfold";

type WordReference = { codes: { [code: string]: string[] } };
type ImageReference = { words: { [word: string]: { keyword: string; images: unknown[] } } };
const reference = wordsJson as WordReference;
const imageReference = imagesJson as ImageReference;
const normalize = (word: string) => word.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, "").trim();
const imageAliases = new Map<string, string>();
Object.keys(imageReference.words).forEach(word => {
    // Exact source labels always take precedence over explanatory aliases.
    imageAliases.set(normalize(word), word);
});
Object.keys(imageReference.words).forEach(word => {
    const short = word.replace(/[（(][^）)]*[）)]/g, "").trim();
    if (short && !imageAliases.has(normalize(short))) imageAliases.set(normalize(short), word);
});

export function mnemonicWords(code: string): string[] {
    try { return [...(reference.codes[parseCode(code)] || [])]; } catch { return []; }
}

export function mnemonicImages(word: string): MemoryImage[] {
    const key = imageAliases.get(normalize(word));
    if (!key) return [];
    return imageReference.words[key].images.map(sanitizeImage).filter((image): image is MemoryImage => !!image && !!image.cachedUrl);
}

