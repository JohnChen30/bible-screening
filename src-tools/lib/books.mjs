/**
 * books.mjs — 66 卷规范书卷表 + 多来源别名解析
 *
 * 职责：
 *   1. 提供跨译本共享的 66 卷规范定义（OSIS 码 / 简繁中文名 / 英文名 / 缩写）；
 *   2. 把各数据源千奇怪的书卷标识（英文键、带空格文件名、USFM \id 码、中文名）
 *      统一解析为规范 osis 码；
 *   3. 预留简繁体：中文名与别名均收录简繁两种写法。
 *
 * 解析策略（resolveBook）：
 *   - 输入先归一化：小写、去空格/连字符/下划线；
 *   - 依次尝试：osis 直接命中 → 英文别名表 → 中文别名表（简/繁）；
 *   - 全部失败返回 null，由调用方决定是告警还是中断。
 */

/** @typedef {{osis:string,nameCn:string,nameCnTw:string,nameEn:string,abbr:string,testament:'old'|'new'}} BookDef */

/** @type {BookDef[]} */
export const BOOKS = [
  { osis: 'Gen',  nameCn: '创世记',     nameCnTw: '創世記',     nameEn: 'Genesis',          abbr: '创',   testament: 'old' },
  { osis: 'Exod', nameCn: '出埃及记',   nameCnTw: '出埃及記',   nameEn: 'Exodus',           abbr: '出',   testament: 'old' },
  { osis: 'Lev',  nameCn: '利未记',     nameCnTw: '利未記',     nameEn: 'Leviticus',        abbr: '利',   testament: 'old' },
  { osis: 'Num',  nameCn: '民数记',     nameCnTw: '民數記',     nameEn: 'Numbers',          abbr: '民',   testament: 'old' },
  { osis: 'Deut', nameCn: '申命记',     nameCnTw: '申命記',     nameEn: 'Deuteronomy',      abbr: '申',   testament: 'old' },
  { osis: 'Josh', nameCn: '约书亚记',   nameCnTw: '約書亞記',   nameEn: 'Joshua',           abbr: '书',   testament: 'old' },
  { osis: 'Judg', nameCn: '士师记',     nameCnTw: '士師記',     nameEn: 'Judges',           abbr: '士',   testament: 'old' },
  { osis: 'Ruth', nameCn: '路得记',     nameCnTw: '路得記',     nameEn: 'Ruth',             abbr: '得',   testament: 'old' },
  { osis: '1Sam', nameCn: '撒母耳记上', nameCnTw: '撒母耳記上', nameEn: '1 Samuel',         abbr: '撒上', testament: 'old' },
  { osis: '2Sam', nameCn: '撒母耳记下', nameCnTw: '撒母耳記下', nameEn: '2 Samuel',         abbr: '撒下', testament: 'old' },
  { osis: '1Kgs', nameCn: '列王纪上',   nameCnTw: '列王紀上',   nameEn: '1 Kings',          abbr: '王上', testament: 'old' },
  { osis: '2Kgs', nameCn: '列王纪下',   nameCnTw: '列王紀下',   nameEn: '2 Kings',          abbr: '王下', testament: 'old' },
  { osis: '1Chr', nameCn: '历代志上',   nameCnTw: '歷代志上',   nameEn: '1 Chronicles',     abbr: '代上', testament: 'old' },
  { osis: '2Chr', nameCn: '历代志下',   nameCnTw: '歷代志下',   nameEn: '2 Chronicles',     abbr: '代下', testament: 'old' },
  { osis: 'Ezra', nameCn: '以斯拉记',   nameCnTw: '以斯拉記',   nameEn: 'Ezra',             abbr: '拉',   testament: 'old' },
  { osis: 'Neh',  nameCn: '尼希米记',   nameCnTw: '尼希米記',   nameEn: 'Nehemiah',         abbr: '尼',   testament: 'old' },
  { osis: 'Esth', nameCn: '以斯帖记',   nameCnTw: '以斯帖記',   nameEn: 'Esther',           abbr: '斯',   testament: 'old' },
  { osis: 'Job',  nameCn: '约伯记',     nameCnTw: '約伯記',     nameEn: 'Job',              abbr: '伯',   testament: 'old' },
  { osis: 'Ps',   nameCn: '诗篇',       nameCnTw: '詩篇',       nameEn: 'Psalms',           abbr: '诗',   testament: 'old' },
  { osis: 'Prov', nameCn: '箴言',       nameCnTw: '箴言',       nameEn: 'Proverbs',         abbr: '箴',   testament: 'old' },
  { osis: 'Eccl', nameCn: '传道书',     nameCnTw: '傳道書',     nameEn: 'Ecclesiastes',     abbr: '传',   testament: 'old' },
  { osis: 'Song', nameCn: '雅歌',       nameCnTw: '雅歌',       nameEn: 'Song of Solomon',  abbr: '歌',   testament: 'old' },
  { osis: 'Isa',  nameCn: '以赛亚书',   nameCnTw: '以賽亞書',   nameEn: 'Isaiah',           abbr: '赛',   testament: 'old' },
  { osis: 'Jer',  nameCn: '耶利米书',   nameCnTw: '耶利米書',   nameEn: 'Jeremiah',         abbr: '耶',   testament: 'old' },
  { osis: 'Lam',  nameCn: '耶利米哀歌', nameCnTw: '耶利米哀歌', nameEn: 'Lamentations',     abbr: '哀',   testament: 'old' },
  { osis: 'Ezek', nameCn: '以西结书',   nameCnTw: '以西結書',   nameEn: 'Ezekiel',          abbr: '结',   testament: 'old' },
  { osis: 'Dan',  nameCn: '但以理书',   nameCnTw: '但以理書',   nameEn: 'Daniel',           abbr: '但',   testament: 'old' },
  { osis: 'Hos',  nameCn: '何西阿书',   nameCnTw: '何西阿書',   nameEn: 'Hosea',            abbr: '何',   testament: 'old' },
  { osis: 'Joel', nameCn: '约珥书',     nameCnTw: '約珥書',     nameEn: 'Joel',             abbr: '珥',   testament: 'old' },
  { osis: 'Amos', nameCn: '阿摩司书',   nameCnTw: '阿摩司書',   nameEn: 'Amos',             abbr: '摩',   testament: 'old' },
  { osis: 'Obad', nameCn: '俄巴底亚书', nameCnTw: '俄巴底亞書', nameEn: 'Obadiah',          abbr: '俄',   testament: 'old' },
  { osis: 'Jonah',nameCn: '约拿书',     nameCnTw: '約拿書',     nameEn: 'Jonah',            abbr: '拿',   testament: 'old' },
  { osis: 'Mic',  nameCn: '弥迦书',     nameCnTw: '彌迦書',     nameEn: 'Micah',            abbr: '弥',   testament: 'old' },
  { osis: 'Nah',  nameCn: '那鸿书',     nameCnTw: '那鴻書',     nameEn: 'Nahum',            abbr: '鸿',   testament: 'old' },
  { osis: 'Hab',  nameCn: '哈巴谷书',   nameCnTw: '哈巴谷書',   nameEn: 'Habakkuk',         abbr: '哈',   testament: 'old' },
  { osis: 'Zeph', nameCn: '西番亚书',   nameCnTw: '西番亞書',   nameEn: 'Zephaniah',        abbr: '番',   testament: 'old' },
  { osis: 'Hag',  nameCn: '哈该书',     nameCnTw: '哈該書',     nameEn: 'Haggai',           abbr: '该',   testament: 'old' },
  { osis: 'Zech', nameCn: '撒迦利亚书', nameCnTw: '撒迦利亞書', nameEn: 'Zechariah',        abbr: '亚',   testament: 'old' },
  { osis: 'Mal',  nameCn: '玛拉基书',   nameCnTw: '瑪拉基書',   nameEn: 'Malachi',          abbr: '玛',   testament: 'old' },
  { osis: 'Matt', nameCn: '马太福音',   nameCnTw: '馬太福音',   nameEn: 'Matthew',          abbr: '太',   testament: 'new' },
  { osis: 'Mark', nameCn: '马可福音',   nameCnTw: '馬可福音',   nameEn: 'Mark',             abbr: '可',   testament: 'new' },
  { osis: 'Luke', nameCn: '路加福音',   nameCnTw: '路加福音',   nameEn: 'Luke',             abbr: '路',   testament: 'new' },
  { osis: 'John', nameCn: '约翰福音',   nameCnTw: '約翰福音',   nameEn: 'John',             abbr: '约',   testament: 'new' },
  { osis: 'Acts', nameCn: '使徒行传',   nameCnTw: '使徒行傳',   nameEn: 'Acts',             abbr: '徒',   testament: 'new' },
  { osis: 'Rom',  nameCn: '罗马书',     nameCnTw: '羅馬書',     nameEn: 'Romans',           abbr: '罗',   testament: 'new' },
  { osis: '1Cor', nameCn: '哥林多前书', nameCnTw: '哥林多前書', nameEn: '1 Corinthians',    abbr: '林前', testament: 'new' },
  { osis: '2Cor', nameCn: '哥林多后书', nameCnTw: '哥林多後書', nameEn: '2 Corinthians',    abbr: '林后', testament: 'new' },
  { osis: 'Gal',  nameCn: '加拉太书',   nameCnTw: '加拉太書',   nameEn: 'Galatians',        abbr: '加',   testament: 'new' },
  { osis: 'Eph',  nameCn: '以弗所书',   nameCnTw: '以弗所書',   nameEn: 'Ephesians',        abbr: '弗',   testament: 'new' },
  { osis: 'Phil', nameCn: '腓立比书',   nameCnTw: '腓立比書',   nameEn: 'Philippians',      abbr: '腓',   testament: 'new' },
  { osis: 'Col',  nameCn: '歌罗西书',   nameCnTw: '歌羅西書',   nameEn: 'Colossians',       abbr: '西',   testament: 'new' },
  { osis: '1Thess',nameCn: '帖撒罗尼迦前书', nameCnTw: '帖撒羅尼迦前書', nameEn: '1 Thessalonians', abbr: '帖前', testament: 'new' },
  { osis: '2Thess',nameCn: '帖撒罗尼迦后书', nameCnTw: '帖撒羅尼迦後書', nameEn: '2 Thessalonians', abbr: '帖后', testament: 'new' },
  { osis: '1Tim', nameCn: '提摩太前书', nameCnTw: '提摩太前書', nameEn: '1 Timothy',        abbr: '提前', testament: 'new' },
  { osis: '2Tim', nameCn: '提摩太后书', nameCnTw: '提摩太後書', nameEn: '2 Timothy',        abbr: '提后', testament: 'new' },
  { osis: 'Titus',nameCn: '提多书',     nameCnTw: '提多書',     nameEn: 'Titus',            abbr: '多',   testament: 'new' },
  { osis: 'Phlm', nameCn: '腓利门书',   nameCnTw: '腓利門書',   nameEn: 'Philemon',         abbr: '门',   testament: 'new' },
  { osis: 'Heb',  nameCn: '希伯来书',   nameCnTw: '希伯來書',   nameEn: 'Hebrews',          abbr: '来',   testament: 'new' },
  { osis: 'Jas',  nameCn: '雅各书',     nameCnTw: '雅各書',     nameEn: 'James',            abbr: '雅',   testament: 'new' },
  { osis: '1Pet', nameCn: '彼得前书',   nameCnTw: '彼得前書',   nameEn: '1 Peter',          abbr: '彼前', testament: 'new' },
  { osis: '2Pet', nameCn: '彼得后书',   nameCnTw: '彼得後書',   nameEn: '2 Peter',          abbr: '彼后', testament: 'new' },
  { osis: '1John',nameCn: '约翰一书',   nameCnTw: '約翰一書',   nameEn: '1 John',           abbr: '约一', testament: 'new' },
  { osis: '2John',nameCn: '约翰二书',   nameCnTw: '約翰二書',   nameEn: '2 John',           abbr: '约二', testament: 'new' },
  { osis: '3John',nameCn: '约翰三书',   nameCnTw: '約翰三書',   nameEn: '3 John',           abbr: '约三', testament: 'new' },
  { osis: 'Jude', nameCn: '犹大书',     nameCnTw: '猶大書',     nameEn: 'Jude',             abbr: '犹',   testament: 'new' },
  { osis: 'Rev',  nameCn: '启示录',     nameCnTw: '啟示錄',     nameEn: 'Revelation',       abbr: '启',   testament: 'new' },
];

/** osis → BookDef */
export const BOOK_BY_OSIS = new Map(BOOKS.map((b, i) => [b.osis, { ...b, id: i + 1 }]));

/** 归一化：小写 + 去所有非字母数字字符（"1 Samuel"→"1samuel"，"1Samuel"→"1samuel"） */
function normalize(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[\s\-_.'’]/g, '');
}

/** 英文别名表：覆盖 CUV 键名（1Samuel/SongOfSolomon）、KJV/NIV 文件名与 book 字段、USFM \id */
const EN_ALIASES = new Map();
for (const b of BOOKS) {
  EN_ALIASES.set(normalize(b.nameEn), b.osis);            // "1samuel" / "songofsolomon"
  EN_ALIASES.set(normalize(b.osis), b.osis);              // "gen" / "1sam" / "rev"
  EN_ALIASES.set(normalize(b.nameCn), b.osis);            // 创世记 / 撒母耳记上
  EN_ALIASES.set(normalize(b.nameCnTw), b.osis);          // 創世記 / 撒母耳記上
}
// 常见异写补充
EN_ALIASES.set(normalize('Psalm'), 'Ps');
EN_ALIASES.set(normalize('Psalms'), 'Ps');
EN_ALIASES.set(normalize('Canticles'), 'Song');
EN_ALIASES.set(normalize('Song of Songs'), 'Song');
EN_ALIASES.set(normalize('The Revelation'), 'Rev');
EN_ALIASES.set(normalize('Revelations'), 'Rev');
EN_ALIASES.set(normalize('Apocalypse'), 'Rev');
EN_ALIASES.set(normalize('Acts of the Apostles'), 'Acts');
EN_ALIASES.set(normalize('The Acts'), 'Acts');

// USFM \id 三字母书卷码 → OSIS（当代译本等 USFM 数据源使用）
const USFM_ALIASES = {
  GEN: 'Gen', EXO: 'Exod', LEV: 'Lev', NUM: 'Num', DEU: 'Deut',
  JOS: 'Josh', JDG: 'Judg', RUT: 'Ruth',
  '1SA': '1Sam', '2SA': '2Sam', '1KI': '1Kgs', '2KI': '2Kgs',
  '1CH': '1Chr', '2CH': '2Chr', EZR: 'Ezra', NEH: 'Neh', EST: 'Esth',
  JOB: 'Job', PSA: 'Ps', PRO: 'Prov', ECC: 'Eccl', SNG: 'Song',
  ISA: 'Isa', JER: 'Jer', LAM: 'Lam', EZK: 'Ezek', DAN: 'Dan',
  HOS: 'Hos', JOL: 'Joel', AMO: 'Amos', OBA: 'Obad', JON: 'Jonah',
  MIC: 'Mic', NAM: 'Nah', HAB: 'Hab', ZEP: 'Zeph', HAG: 'Hag',
  ZEC: 'Zech', MAL: 'Mal',
  MAT: 'Matt', MRK: 'Mark', LUK: 'Luke', JHN: 'John', ACT: 'Acts', ROM: 'Rom',
  '1CO': '1Cor', '2CO': '2Cor', GAL: 'Gal', EPH: 'Eph', PHP: 'Phil', COL: 'Col',
  '1TH': '1Thess', '2TH': '2Thess', '1TI': '1Tim', '2TI': '2Tim',
  TIT: 'Titus', PHM: 'Phlm', HEB: 'Heb', JAS: 'Jas',
  '1PE': '1Pet', '2PE': '2Pet', '1JN': '1John', '2JN': '2John', '3JN': '3John',
  JUD: 'Jude', REV: 'Rev',
};

/**
 * 把任意书卷标识解析为规范 osis 码。
 * @param {string} raw 书卷标识（英文键 / 文件名 / USFM \id / 中文名，简繁均可）
 * @returns {string|null} osis 码，无法识别返回 null
 */
export function resolveBook(raw) {
  if (raw == null) return null;
  const key = normalize(raw);
  if (!key) return null;
  // 1) USFM \id 码（大写三字母，先查专用表）
  const upper = String(raw).trim().toUpperCase();
  if (USFM_ALIASES[upper]) return USFM_ALIASES[upper];
  // 2) 归一化英文 / 中文别名
  return EN_ALIASES.get(key) ?? null;
}

/** 66 卷完整性集合（用于缺失检测） */
export const ALL_OSIS = new Set(BOOKS.map((b) => b.osis));

/**
 * 依据采样文本推断语言（用于未知数据源的自动识别）。
 * @param {string} sample 文本样本
 * @returns {'zh-Hans'|'zh-Hant'|'en'}
 */
export function detectLanguage(sample) {
  const s = String(sample ?? '');
  const cjk = (s.match(/[\u4e00-\u9fff]/g) || []).length;
  if (cjk < 20) return 'en';
  // 繁体特征字命中数 vs 简体特征字命中数
  const tw = (s.match(/[們會來來說對著實現證無寫學門問間點樣體驗證經見到過後裡個當權東車馬鳥魚鳳龍雙發華戀嘆嘆歎豈聖醫鹽麗] /g) || []).length;
  const twChars = (s.match(/[們説來對實現證寫學問間點樣體驗見到過後裡個當權東車馬鳳龍雙發華歎豈聖醫鹽麗爲盡恥齒] /g) || []).length;
  return twChars > 0 ? 'zh-Hant' : 'zh-Hans';
}
