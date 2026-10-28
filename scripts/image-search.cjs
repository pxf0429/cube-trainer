const normalize = text => String(text || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
function selectEntities(query, results) {
  return (results || []).filter(entity => /^Q\d+$/.test(entity.id) &&
    [entity.match?.text, entity.label].some(text => normalize(text) === normalize(query))).slice(0, 4);
}
function representativeFiles(query, candidates, entities) {
  const files = [];
  candidates.forEach((candidate, candidateIndex) => {
    const entity = entities[candidate.id];
    if (!entity || entity.claims?.P31?.some(claim => claim.mainsnak?.datavalue?.value?.id === 'Q4167410')) return;
    const images = (entity.claims?.P18 || []).filter(claim => claim.rank !== 'deprecated' && typeof claim.mainsnak?.datavalue?.value === 'string')
      .sort((a, b) => Number(b.rank === 'preferred') - Number(a.rank === 'preferred')).slice(0, 2);
    images.forEach(claim => files.push({ title: 'File:' + claim.mainsnak.datavalue.value,
      match: { kind: 'entity', recommended: candidateIndex === 0, entity: candidate.id, query,
        label: candidate.label || entity.labels?.zh?.value || query,
        description: candidate.description || entity.descriptions?.zh?.value || entity.descriptions?.en?.value || '' } }));
  });
  return files;
}
function decodeHtml(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|quot|amp|apos|lt|gt);/gi, (_, entity) => {
    if (entity[0] === '#') { const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''; }
    return {quot:'"',amp:'&',apos:"'",lt:'<',gt:'>'}[entity.toLowerCase()];
  });
}
function parseBingImages(html, query) {
  const pages = [], seen = new Set();
  for (const match of html.matchAll(/\bm=(['"])([\s\S]*?)\1/g)) {
    try {
      const image = JSON.parse(decodeHtml(match[2]));
      if (!image.turl || !image.purl) continue;
      const thumb = new URL(image.turl), source = new URL(image.purl);
      if (!/^(?:tse|ts)[1-4]\.mm\.bing\.net$/.test(thumb.hostname) || !['http:','https:'].includes(source.protocol) || thumb.username || thumb.password || source.username || source.password) continue;
      thumb.protocol = 'https:'; source.protocol = 'https:';
      thumb.hostname = thumb.hostname.replace(/^ts([1-4])\./, 'tse$1.');
      thumb.searchParams.set('pid', 'Api');
      const key = image.murl || thumb.href;
      if (seen.has(key) || seen.has(source.href)) continue;
      seen.add(key); seen.add(source.href);
      const title = String(image.t || query).replace(/[\ue000-\uf8ff]/g, '').slice(0, 200);
      pages.push({ title, index: pages.length, memoryMatch: {kind:'candidate',recommended:false,query,label:title,description:''},
        imageinfo: [{mime:'image/jpeg',thumburl:thumb.href,descriptionurl:source.href,extmetadata:{Artist:{value:source.hostname},LicenseShortName:{value:'许可见原网页'}}}] });
      if (pages.length >= 32) break;
    } catch { /* Ignore malformed image metadata, never evaluate remote scripts. */ }
  }
  const score = page => (normalize(page.title).startsWith(normalize(query)) ? 40 : 0) + (normalize(page.title).includes(normalize(query)) ? 15 : 0) - (/合成|拼贴|海报|美女/.test(page.title) ? 35 : 0);
  return pages.sort((a,b)=>score(b)-score(a)).slice(0,8).map((page,index)=>({...page,index}));
}
async function searchImages(query, json, forceCandidates = false, html) {
  const language = /[\u3400-\u9fff]/.test(query) ? 'zh' : 'en';
  let representative = [];
  let rateLimit;
  try {
    const lookup = await json('https://www.wikidata.org/w/api.php?' + new URLSearchParams({ action: 'wbsearchentities', search: query, language, uselang: language, limit: '6', format: 'json' }));
    const candidates = selectEntities(query, lookup.search);
    if (candidates.length) {
      const data = await json('https://www.wikidata.org/w/api.php?' + new URLSearchParams({ action: 'wbgetentities', ids: candidates.map(e => e.id).join('|'), props: 'claims|labels|descriptions', languages: 'zh|en', format: 'json' }));
      const files = representativeFiles(query, candidates, data.entities || {});
      if (files.length) {
        const response = await json('https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ action: 'query', titles: [...new Set(files.map(f => f.title))].join('|'),
          prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: '640', format: 'json', formatversion: '2' }));
        representative = files.map((file, index) => {
          const page = response.query?.pages?.find(page => normalize(page.title?.replace(/_/g, ' ')) === normalize(file.title.replace(/_/g, ' ')));
          return page?.imageinfo?.[0] ? { ...page, index, memoryMatch: file.match } : null;
        }).filter(Boolean);
      }
    }
  } catch (error) { if (error.status === 429) rateLimit = error; /* An independent Chinese search can still serve unresolved words. */ }
  if (!forceCandidates && representative.some(page => page.memoryMatch.recommended)) return { query: { pages: representative } };
  if (html) {
    try {
      const candidates = parseBingImages(await html('https://www.bing.com/images/search?' + new URLSearchParams({q:query,form:'HDRSC3',first:'1',count:'12',adlt:'strict'})), query);
      if (candidates.length) return { query: { pages: [...representative, ...candidates.map((page, i) => ({...page,index:representative.length + i}))] } };
    } catch { /* Keep the representative and filename-search alternatives available. */ }
  }
  if (rateLimit) throw rateLimit;
  let pages = [];
  try {
    // Restrict matching to the filename instead of incidental words in a
    // description, e.g. a flower photo merely mentioning an apple tree.
    const term = query.replace(/["\\]/g, ' ').trim();
    const result = await json('https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: 'intitle:"' + term + '" filetype:bitmap',
      gsrnamespace: '6', gsrlimit: '6', prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: '640', format: 'json', formatversion: '2' }));
    pages = (result.query?.pages || []).map((page, i) => ({ ...page, index: representative.length + (page.index || i), memoryMatch: { kind: 'candidate', recommended: false, query } }));
  } catch (error) { if (!representative.length) throw error; }
  const seen = new Set();
  return { query: { pages: [...representative, ...pages].filter(page => !seen.has(page.title) && seen.add(page.title)) } };
}
module.exports = { searchImages, selectEntities, representativeFiles, parseBingImages };
