import casesJson from "../data/EOLR.json";
import recognitionRulesJson from "../data/EOLRRecognitionRulesFinal.json";
import { CubieCube, MoveSeq } from "./CubeLib";

export type EOLRCase = {
    category: string;
    name: string;
    position: string;
    scramble: string;
    recognition: string;
    solution: string;
};

type EdgePosition = "UF" | "UL" | "UB" | "UR" | "DF" | "DB";
type PositionGroup = EdgePosition | "U" | "D" | "M" | "side" | "any";
type EdgeCondition = { positions: PositionGroup[]; orientation?: "correct" | "wrong" };
type RuleCondition = {
    edges?: [EdgeCondition, EdgeCondition];
    relation?: "adjacent" | "opposite" | "above";
    mLayerCount?: number;
};
type RecognitionRule = {
    category: string;
    name: string;
    recognition: string;
    rule: RuleCondition & { anyOf?: RuleCondition[]; fallback?: boolean };
};

export type EOLRMatch = EOLRCase & {
    // y2 is an internal comparison frame; auf is the top-layer setup for the notes.
    recognitionView: { y2: boolean; auf: string };
};

const slots: EdgePosition[] = ["UF", "UL", "UB", "UR", "DF", "DB"];
const indices = [0, 1, 2, 3, 4, 6];
const aufMoves = ["", "U", "U2", "U'"];
const aliases: { [key: string]: string } = { arrow: "3/1", "6flip": "4/2" };

// U turns preserve the category. In 1/1 the bad D edge is viewed at DB;
// in 3/1 it is at DF, with the arrow tip at UF. y2 handles the other D view.
const canonicalEO: { [key: string]: string } = {
    solved: "000000",
    "4/0": "111100",
    "2o/2": "010111",
    "4/2": "111111",
    "0/2": "000011",
    "2a/2": "011011",
    "2a/0": "011000",
    "2o/0": "101000",
    "1/1": "100001",
    "3/1": "110110",
};

export function getEOLRCategory(cube: CubieCube): string | undefined {
    const eo = indices.map(i => cube.eo[i]);
    if (eo.some(value => value !== 0 && value !== 1) || eo.reduce((a, b) => a + b, 0) % 2) {
        return undefined;
    }
    const top = eo.slice(0, 4).reduce((a, b) => a + b, 0);
    const bottom = eo[4] + eo[5];
    if (top === 0 && bottom === 0) return "solved";
    if (top === 1 && bottom === 1) return "1/1";
    if (top === 3 && bottom === 1) return "3/1";
    if (top === 2 && (bottom === 0 || bottom === 2)) {
        const opposite = (eo[0] === 1 && eo[2] === 1) || (eo[1] === 1 && eo[3] === 1);
        return `2${opposite ? "o" : "a"}/${bottom}`;
    }
    return `${top}/${bottom}`;
}

function canonicalView(cube: CubieCube, category: string) {
    const y2 = (category === "1/1" && cube.eo[4] === 1)
        || (category === "3/1" && cube.eo[6] === 1);
    const viewed = y2 ? cube.changeBasis(new MoveSeq("y2")) : cube;
    for (const auf of aufMoves) {
        const aligned = viewed.apply(auf);
        if (indices.map(i => aligned.eo[i]).join("") === canonicalEO[category]) {
            return { cube: aligned, recognitionView: { y2, auf } };
        }
    }
    return undefined;
}

type LREdge = { position: EdgePosition; correct: boolean };
function inGroup(position: EdgePosition, group: PositionGroup): boolean {
    if (group === "any") return true;
    if (group === "U" || group === "D") return position[0] === group;
    if (group === "side") return position === "UL" || position === "UR";
    if (group === "M") return position !== "UL" && position !== "UR";
    return position === group;
}

function matchesEdge(edge: LREdge, condition: EdgeCondition): boolean {
    return condition.positions.some(group => inGroup(edge.position, group))
        && (!condition.orientation || edge.correct === (condition.orientation === "correct"));
}

function matchesCondition(edges: [LREdge, LREdge], condition: RuleCondition): boolean {
    const [a, b] = edges;
    if (condition.edges && !(
        (matchesEdge(a, condition.edges[0]) && matchesEdge(b, condition.edges[1]))
        || (matchesEdge(b, condition.edges[0]) && matchesEdge(a, condition.edges[1]))
    )) return false;
    if (condition.mLayerCount !== undefined
        && edges.filter(edge => inGroup(edge.position, "M")).length !== condition.mLayerCount) return false;
    if (condition.relation === "above") {
        return (a.position === "UF" && b.position === "DF")
            || (b.position === "UF" && a.position === "DF")
            || (a.position === "UB" && b.position === "DB")
            || (b.position === "UB" && a.position === "DB");
    }
    if (condition.relation) {
        if (!inGroup(a.position, "U") || !inGroup(b.position, "U")) return false;
        const distance = Math.abs(slots.indexOf(a.position) - slots.indexOf(b.position));
        return condition.relation === "opposite" ? distance === 2 : distance === 1 || distance === 3;
    }
    return true;
}

const rules = recognitionRulesJson as RecognitionRule[];
const cases = casesJson as EOLRCase[];
const caseByKey = new Map(cases.map(c => [`${c.category}\u0000${c.name}`, c]));

export function findEOLRCase(cube: CubieCube, category?: string): EOLRMatch | undefined {
    const actualCategory = getEOLRCategory(cube);
    // A supplied category is a constraint, never permission to search another group.
    if (!actualCategory || (category && (aliases[category] || category) !== actualCategory)) return undefined;
    const candidates = rules.filter(rule => rule.category === actualCategory);
    if (!candidates.length) return undefined;
    const view = canonicalView(cube, actualCategory);
    if (!view) return undefined;
    const lrIndices = [1, 3].map(piece => view.cube.ep.indexOf(piece));
    if (lrIndices.some(index => !indices.includes(index))) return undefined;
    const edges = lrIndices.map(index => ({
        position: slots[indices.indexOf(index)],
        correct: view.cube.eo[index] === 0,
    })) as [LREdge, LREdge];
    const matches = candidates.filter(({ rule }) => !rule.fallback
        && matchesCondition(edges, rule)
        && (!rule.anyOf || rule.anyOf.some(condition => matchesCondition(edges, condition))));
    // Conflicting rules must not silently depend on table order.
    if (matches.length > 1) return undefined;
    const match = matches[0] || candidates.find(({ rule }) => rule.fallback);
    const source = match && caseByKey.get(`${match.category}\u0000${match.name}`);
    return source ? { ...source, recognitionView: view.recognitionView } : undefined;
}

export function formatEOLRCase(case_: EOLRCase | EOLRMatch): string {
    const auf = "recognitionView" in case_ ? case_.recognitionView.auf : "";
    return `${auf ? `U层调整：${auf}\n` : ""}大类：${case_.category}\n名称：${case_.name}\n识别：${case_.recognition}\n解法：${case_.solution}`;
}

