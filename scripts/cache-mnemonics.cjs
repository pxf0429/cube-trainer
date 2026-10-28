// Resumable image preparation for the supplied reference words.
// Images remain separate from user entries and keep their source attribution.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { requestRemote } = require('./memory-images.cjs');
const { parseBingImages } = require('./image-search.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public', 'assets', 'memory');
const manifestFile = path.join(root, 'src', 'data', 'BLDCandidateImages.json');
const progressFile = path.join(root, '.cache', 'mnemonic-image-progress.json');
const reference = require('../src/data/BLDCandidates.json');
const overrides = {
  'i:--': '字母 i', '卡': '卡牌', '安倍': '安倍晋三', 'NANA': 'NANA 动漫', 'Q＆A': '问答 Q&A',
  '伊奥': '伊奥 神话', '教官': '军训 教官', '孔明': '诸葛亮 孔明', '肉球': '猫咪 肉球', '课文': '语文 课文',
  '女巫': '女巫 卡通', '安欣': '狂飙 安欣', '奶昔': 'strawberry milkshake', '拖鞋': 'slippers',
  '办公自动化(OA）': '办公自动化 OA', 'AI（人工智能）': '人工智能 AI', 'biccyle自行车': '自行车',
  'I carry魔方': 'i carry 智能魔方', 'ID身份证': '身份证', 'ND减光镜': 'ND 减光镜',
  'AE软件': 'Adobe After Effects 软件', '海尔（兄弟）': '海尔兄弟 动画', 'IE浏览器': 'Internet Explorer 图标',
  '普洱（茶）': '普洱茶', '索尔（雷神）': '雷神 索尔 漫威', '罗恩': '罗恩 韦斯莱', '蓉儿': '黄蓉',
  'we(我们）': '我们 朋友 合影', 'AF（自动对焦）': '相机 自动对焦 AF', 'if': 'if 条件语句',
  '加菲（猫）': '加菲猫', '阿甘': '阿甘正传', 'in house': '房屋 室内', '欧皇': '欧皇 表情包',
  '呕吼': '呕吼 表情包', '滴~': '汽车喇叭', 'fifa足球': 'FIFA 足球', 'hi-': '打招呼 卡通',
  'ii罗马二': '罗马数字 II', '看I 看欸': '字母 I', 'oil（油）': '食用油', '屁': '放屁 卡通',
  '日': '太阳', '寺': '寺庙', '梯': '梯子', '旗': '旗帜', '洗': '洗手', '翼': '翅膀', 'yif': 'YIF 魔术师',
  'in July': '七月 日历', '强奸': '反性侵 公益 标志', 'ikun': '蔡徐坤', '欧克': '欧克 手势',
  'ill有病': '生病 卡通', '艾琳': '艾琳 王者荣耀', '艾玛（沃特森）': 'Emma Watson',
  '肛门': '人体 肛门 解剖示意图', '班纳（绿巨人）cn': '绿巨人 班纳', 'in': '英文 in 卡片',
  'on（开机/向前）': '电源开关 on', '啊哦': '啊哦 表情包', 'east东欧': '东欧 地图', '佛': '佛像',
  'IOS': 'Apple iOS 图标', '奇偶': '奇数 偶数', 'KO': '拳击 KO', '雷欧': '雷欧 奥特曼',
  '一氧化氮': '一氧化氮 分子', '噢噢': '噢噢 表情包', '肉': '猪肉', '脱欧': '英国 脱欧',
  '亚欧': '亚欧大陆 地图', '中欧（班列）': '中欧班列', '苹果apple': '苹果 水果', 'cp': '情侣 卡通',
  '坡坡': '坡坡', '阿Q': '阿Q正传', '情商eq': '情商 EQ', 'iq智商': '智商 IQ',
  'QQ': '腾讯 QQ 企鹅', '穆青': '穆青 记者', 'iran伊朗': '伊朗', 'org（跪地哭）': '跪地哭 表情包',
  '情人（电影女主）': '电影 情人 珍玛琪', '人肉': '人体 肌肉 解剖示意图', '死人': '墓碑 卡通',
  'WR': '世界纪录 奖杯', '傲速': '傲速 魔方', 'is': '英文 is 卡片', '哦斯！': '哦斯 泽塔奥特曼',
  '奥特（曼）': '奥特曼', 'CT': 'CT 扫描仪', 'IT（信息技术': '信息技术 计算机',
  'iw译文': '译文 出版社', '欧文(公社': '罗伯特 欧文', 'ix（罗马九）': '罗马数字 IX',
  'iy哎呀': '哎呀 表情包', '屁眼': '人体 肛门 解剖示意图', 'iz组合': 'IZ 乐队', 'nazi纳粹': '纳粹 历史 博物馆',
  'MC（我的世界）': '我的世界 游戏', 'OC（原创角色）': '原创角色 设定图', 'PC（个人电脑)': '个人电脑',
  'WC（厕所）': '厕所', '汤姆猫': '汤姆猫 动画', '郑大': '郑州大学', '高清': '高清 电视',
};

function keyword(word) {
  if (overrides[word]) return overrides[word];
  return word.replace(/[（(]([^）)]*)[）)]/g, '$1').trim();
}
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function validFile(image) {
  return typeof image.cachedUrl === 'string' && /^\.\/assets\/memory\/[a-f0-9]{24}\.(jpg|png|webp)$/.test(image.cachedUrl)
    && fs.existsSync(path.join(root, 'public', image.cachedUrl.slice(2)));
}
async function cacheImage(page, word, query) {
  const info = page.imageinfo[0];
  const remote = await requestRemote(info.thumburl || info.url);
  const type = remote.type.split(';')[0];
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type];
  if (!extension || remote.body.length < 150) throw new Error('Invalid image');
  const filename = crypto.createHash('sha256').update(remote.body).digest('hex').slice(0, 24) + '.' + extension;
  fs.writeFileSync(path.join(output, filename), remote.body);
  return { url: info.thumburl || info.url, cachedUrl: './assets/memory/' + filename,
    source: info.descriptionurl || '', title: page.title || word, author: info.extmetadata?.Artist?.value || '',
    license: info.extmetadata?.LicenseShortName?.value || '', match: 'candidate', meaning: query };
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  fs.mkdirSync(path.dirname(progressFile), { recursive: true });
  const manifest = readJson(progressFile, readJson(manifestFile, { version: 1, words: {} }));
  const allWords = [...new Set(Object.values(reference.codes).flat())];
  const limitIndex = process.argv.indexOf('--limit');
  const limit = limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) : Infinity;
  const jobs = allWords.filter(word => !manifest.words[word]?.images?.length || !manifest.words[word].images.every(validFile)).slice(0, limit);
  let cursor = 0, completed = 0, failed = 0;
  const save = () => fs.writeFileSync(progressFile, JSON.stringify(manifest, null, 2) + '\n');
  async function worker() {
    while (cursor < jobs.length) {
      const word = jobs[cursor++], query = keyword(word);
      try {
        const url = 'https://www.bing.com/images/search?' + new URLSearchParams({ q: query, form: 'HDRSC3', first: '1', count: '15', adlt: 'strict' });
        const pages = parseBingImages((await requestRemote(url)).body.toString('utf8'), query);
        const images = [];
        for (const page of pages.slice(0, 6)) {
          try { images.push(await cacheImage(page, word, query)); } catch { /* Try the next thumbnail. */ }
          if (images.length === 3) break;
        }
        if (!images.length) throw new Error('No usable images');
        manifest.words[word] = { keyword: query, images };
        completed++;
      } catch (error) {
        failed++; manifest.words[word] = { keyword: query, images: [], error: error.message };
      }
      save();
      if ((completed + failed) % 10 === 0) console.log(JSON.stringify({ processed: completed + failed, jobs: jobs.length, cached: completed, failed }));
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  // Publish one complete metadata snapshot rather than triggering a rebuild per word.
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ totalWords: allWords.length, ready: allWords.filter(word => manifest.words[word]?.images?.length).length,
    remaining: allWords.filter(word => !manifest.words[word]?.images?.length) }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
