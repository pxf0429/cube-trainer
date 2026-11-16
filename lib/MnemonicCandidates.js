import wordsJson from "../data/BLDCandidates.js?v=f8d64e55bc0a";
import imagesJson from "../data/BLDCandidateImages.js?v=f8d64e55bc0a";
import { parseCode, sanitizeImage } from "./Blindfold.js?v=f8d64e55bc0a";
const reference = wordsJson;
const imageReference = imagesJson;
const normalize = (word) => word.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, "").trim();
const imageAliases = new Map();
Object.keys(imageReference.words).forEach(word => {
    // Exact source labels always take precedence over explanatory aliases.
    imageAliases.set(normalize(word), word);
});
Object.keys(imageReference.words).forEach(word => {
    const short = word.replace(/[（(][^）)]*[）)]/g, "").trim();
    if (short && !imageAliases.has(normalize(short)))
        imageAliases.set(normalize(short), word);
});
export function mnemonicWords(code) {
    try {
        return [...(reference.codes[parseCode(code)] || [])];
    }
    catch {
        return [];
    }
}
export function mnemonicImages(word) {
    const key = imageAliases.get(normalize(word));
    if (!key)
        return [];
    return imageReference.words[key].images.map(sanitizeImage).filter((image) => !!image && !!image.cachedUrl);
}
