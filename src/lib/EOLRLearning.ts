import { EOLRCase } from "./EOLRCases";

export type CaseReference = { start: number; end: number; text: string; targetKey: string; conversion: boolean };
export type CaseDependency = { sourceKey: string; targetKey: string; conversion: boolean };
export type CategoryDependency = { source: string; target: string; count: number };
const key = (item: Pick<EOLRCase, "category" | "name">) => item.category + ":" + item.name;
const nameAliases: { [key: string]: string } = { "好的": "好", "堆叠": "堆积" };
const categoryAliases: { [category: string]: { [label: string]: string } } = { "1/1": { "相邻": "UF相邻" } };

export function caseReferences(text: string, cases: EOLRCase[]): CaseReference[] {
    const categories = Array.from(new Set(cases.map(item => item.category)));
    const references: CaseReference[] = [];
    const pattern = /(?:2[ao]\/[02]|[0134]\/[012])/g;
    let found: RegExpExecArray | null;
    while ((found = pattern.exec(text))) {
        const category = found[0];
        if (!categories.includes(category)) continue;
        const names = cases.filter(item => item.category === category).map(item => ({ label: item.name, name: item.name }));
        for (const alias of Object.keys(nameAliases)) {
            if (names.some(item => item.name === nameAliases[alias])) names.push({ label: alias, name: nameAliases[alias] });
        }
        for (const alias of Object.keys(categoryAliases[category] || {})) names.push({label:alias,name:categoryAliases[category][alias]});
        names.sort((a, b) => b.label.length - a.label.length);
        const prefix = text.slice(0, found.index), name = names.find(item => prefix.endsWith(item.label));
        if (!name) continue;
        const start = found.index - name.label.length, end = found.index + category.length;
        references.push({ start, end, text: text.slice(start, end), targetKey: category + ":" + name.name,
            conversion: /(?:转换为|转化为)$/.test(text.slice(0, start)) });
    }
    return references;
}

export function buildLearningGraph(cases: EOLRCase[], categories: string[]) {
    const byKey = new Map(cases.map(item => [key(item), item]));
    const references = new Map(cases.map(item => [key(item), caseReferences(item.solution, cases)]));
    const dependencies: CaseDependency[] = [];
    for (const item of cases) for (const reference of references.get(key(item)) || []) {
        dependencies.push({ sourceKey: key(item), targetKey: reference.targetKey, conversion: reference.conversion });
    }
    const counts = new Map<string, CategoryDependency>();
    for (const edge of dependencies.filter(edge => edge.conversion)) {
        const source = byKey.get(edge.sourceKey)!.category, target = byKey.get(edge.targetKey)!.category;
        const id = source + ":" + target;
        const existing = counts.get(id);
        if (existing) existing.count++;
        else counts.set(id, { source, target, count: 1 });
    }
    const categoryEdges = Array.from(counts.values());
    const prerequisites = new Map(categories.map(category => [category, categoryEdges.filter(edge => edge.source === category && edge.target !== category).map(edge => edge.target)]));
    // Collapse any cross-category cycles before ranking prerequisites. A cycle
    // is studied together; it is never presented as an impossible strict order.
    let nextIndex = 0;
    const indices = new Map<string, number>(), low = new Map<string, number>(), stack: string[] = [], active = new Set<string>();
    const groups: string[][] = [];
    function visit(category: string) {
        indices.set(category, nextIndex); low.set(category, nextIndex++); stack.push(category); active.add(category);
        for (const target of prerequisites.get(category) || []) {
            if (!indices.has(target)) { visit(target); low.set(category, Math.min(low.get(category)!, low.get(target)!)); }
            else if (active.has(target)) low.set(category, Math.min(low.get(category)!, indices.get(target)!));
        }
        if (low.get(category) === indices.get(category)) {
            const group: string[] = []; let member: string;
            do { member = stack.pop()!; active.delete(member); group.push(member); } while (member !== category);
            groups.push(group);
        }
    }
    categories.forEach(category => { if (!indices.has(category)) visit(category); });
    const groupByCategory = new Map<string, number>(); groups.forEach((group, i) => group.forEach(category => groupByCategory.set(category, i)));
    const levels = new Map<number, number>();
    function level(group: number): number {
        if (levels.has(group)) return levels.get(group)!;
        const parents = new Set(groups[group].flatMap(category => prerequisites.get(category) || []).map(category => groupByCategory.get(category)!).filter(index => index !== group));
        const result = parents.size ? 1 + Math.max(...Array.from(parents).map(level)) : 0;
        levels.set(group, result); return result;
    }
    const incoming = (category: string) => categoryEdges.filter(edge => edge.target === category && edge.source !== category).reduce((sum, edge) => sum + edge.count, 0);
    const caseCount = (category: string) => cases.filter(item => item.category === category).length;
    const order = [...categories].sort((a, b) => level(groupByCategory.get(a)!) - level(groupByCategory.get(b)!) || incoming(b) - incoming(a) || caseCount(a) - caseCount(b) || categories.indexOf(a) - categories.indexOf(b));
    return { byKey, references, dependencies, categoryEdges, prerequisites, order,
        levels: new Map(categories.map(category => [category, level(groupByCategory.get(category)!)])),
        cycles: groups.filter(group => group.length > 1), incoming,
        crossCategoryCount: categoryEdges.filter(edge => edge.source !== edge.target).reduce((sum, edge) => sum + edge.count, 0),
        withinCategoryCount: categoryEdges.filter(edge => edge.source === edge.target).reduce((sum, edge) => sum + edge.count, 0) };
}
