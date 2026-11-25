// 設定ファイル（trips/○○○.yml）の書き間違いをチェックして、日本語でお知らせします。

import path from 'node:path';
import { parseDocument, LineCounter, isMap, isScalar } from 'yaml';

// 項目名と日本語の呼び名
export const FIELDS = {
  number: '旅の番号',
  place_en: '英語の地名',
  place_ja: '日本語の地名',
  start: '旅の始まりの日',
  end: '旅の終わりの日',
  color: 'テーマカラー',
  message: '一言',
  album_url: 'GoogleフォトのURL',
  qr_icon: 'QRのアイコン',
};

const label = (key) => `「${key}」（${FIELDS[key]}）`;

const MAX_MESSAGE_LINES = 3;

// QRのアイコンは日本語の名前でも選べるようにする
const ICON_ALIASES = {
  飛行機: 'plane',
  ひこうき: 'plane',
  車: 'car',
  くるま: 'car',
  電車: 'train',
  でんしゃ: 'train',
  船: 'ship',
  ふね: 'ship',
};

// 選べるアイコンの一覧（エラー文用）。.svg は名前だけ、.png はファイル名で表示
function iconChoices(iconNames) {
  const list = iconNames.filter((n) => /\.(svg|png)$/i.test(n)).map((n) => n.replace(/\.svg$/i, ''));
  return list.length ? list.join(' / ') : '（assets/icons/ にアイコンがありません）';
}

/**
 * 1つの設定ファイルをチェックする。
 * @param {object} p
 * @param {string} p.file  例：trips/001.yml
 * @param {string} p.text  ファイルの中身
 * @param {string[]} p.iconNames  assets/icons/ にあるファイルの名前の一覧
 * @returns {{trip: object|null, errors: Array, warnings: Array}}
 */
export function validateTrip({ file, text, iconNames = [] }) {
  const errors = [];
  const warnings = [];
  const err = (message, line) => {
    if (!errors.some((e) => e.line === line && e.message === message)) errors.push({ file, line, message });
  };
  const warn = (message, line) => warnings.push({ file, line, message });

  // ---- 1. ファイル名 ----
  const base = path.basename(file);
  const nameMatch = base.match(/^(\d{3}|[Aa]\d{2})\.yml$/);
  if (!nameMatch) {
    let hint = '';
    if (/\.yaml$/i.test(base)) hint = '拡張子は「.yaml」ではなく「.yml」にしてください。';
    else if (/\s/.test(base)) hint = 'ファイル名に空白が入っています。';
    else if (/[０-９]/.test(base)) hint = '数字が全角になっています。半角数字にしてください。';
    err(`ファイル名「${base}」は「3けたの半角数字.yml」（例：002.yml）か、過去の旅なら「A＋2けたの数字.yml」（例：A01.yml）にしてください。${hint}`);
  }
  const fileNumber = nameMatch ? nameMatch[1].toUpperCase() : null;

  // ---- 2. よくある書き間違い（YAMLとして読む前に1行ずつ見る） ----
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let inMessage = false; // 「message: |」の中にいるか
  lines.forEach((ln, i) => {
    const n = i + 1;
    if (inMessage) {
      if (/^ *\t/.test(ln)) return err('行の先頭にタブ文字があります。半角スペースに直してください。', n);
      if (ln.trim() === '' || /^ /.test(ln)) return; // 一言の中身（行頭スペースあり）
      if (/^[A-Za-z_]+[ 　]*[:：]/.test(ln) || /^#/.test(ln)) inMessage = false; // 次の項目
      else {
        err('「message」（一言）の文章の行は、先頭に半角スペースを2つ入れてください。', n);
        return;
      }
    }
    if (/^message[ 　]*[:：][ 　]*[|>][-+]?[ 　]*(#.*)?$/.test(ln)) inMessage = true;
    if (/^\s*#/.test(ln)) return; // コメント行は気にしない
    if (/^color:[ 　]*[#＃]/.test(ln))
      err(`${label('color')}が読み取れません。「#」から後ろはメモ扱いになってしまうため、"#3A7BD5" のように前後を「"」で囲んでください。`, n);
    if (/^[ 　]*\t/.test(ln)) err('行の先頭にタブ文字があります。半角スペースに直してください。', n);
    if (/^　/.test(ln)) err('行の先頭に全角スペースがあります。消すか、半角スペースに直してください。', n);
    const fw = ln.match(/^([A-Za-z_]+)[ 　]*：/);
    if (fw) err(`「${fw[1]}」の後ろの「：」が全角になっています。半角の「:」に直してください。`, n);
    const noSpace = ln.match(/^([A-Za-z_]+):(?![ \n]|$)/);
    if (noSpace && FIELDS[noSpace[1]])
      err(`「${noSpace[1]}:」の後ろに半角スペースを1つ入れてください（例：${noSpace[1]}: 値）。`, n);
  });

  // ---- 3. YAMLとして読む ----
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, uniqueKeys: true, prettyErrors: false });
  const lineOf = (offset) => (offset == null ? undefined : lineCounter.linePos(offset).line);

  if (doc.errors.length) {
    for (const e of doc.errors) {
      const line = lineOf(e.pos?.[0]);
      if (errors.some((x) => x.line === line)) continue; // 同じ行はすでに説明済み
      if (e.code === 'DUPLICATE_KEY') {
        err('同じ項目が2回書かれています。どちらか一方を消してください。', line);
      } else {
        err(
          'ファイルの書き方（YAML）が読み取れません。この行かその少し前で、' +
            '「項目名: 値」の形になっているか、行の先頭のスペースがずれていないか、' +
            '「"」の閉じ忘れがないかを確認してください。' +
            `（詳細コード：${e.code}）`,
          line,
        );
      }
    }
    return { trip: null, errors, warnings };
  }
  if (errors.length) return { trip: null, errors, warnings };

  const root = doc.contents;
  if (!root || !isMap(root)) {
    err('設定が見つかりません。ファイルが空か、形がくずれています。見本（trips/_見本.yml）を参考にしてください。', 1);
    return { trip: null, errors, warnings };
  }

  // ---- 4. 項目を取り出す ----
  const values = {};
  for (const pair of root.items) {
    const key = isScalar(pair.key) ? String(pair.key.value) : String(pair.key);
    const keyLine = lineOf(pair.key?.range?.[0]);
    if (!FIELDS[key]) {
      const s = suggest(key);
      err(`知らない項目「${key}」があります。${s ? `「${s}」のつづり間違いではありませんか？` : '項目名を確認してください。'}`, keyLine);
      continue;
    }
    const node = pair.value;
    const value = node == null ? null : isScalar(node) ? node.value : node.toJSON();
    values[key] = { value, line: keyLine, rawLine: lines[(keyLine || 1) - 1] || '' };
  }

  const missing = (key) => err(`${label(key)}の行がありません。見本（trips/_見本.yml）からコピーして追加してください。`);
  const isEmpty = (v) => v == null || (typeof v === 'string' && v.trim() === '');

  // 文字の項目（必須）
  const requiredText = (key) => {
    const f = values[key];
    if (!f) return missing(key), null;
    if (isEmpty(f.value)) return err(`${label(key)}が空です。`, f.line), null;
    if (typeof f.value === 'object') return err(`${label(key)}は1つの文字列で書いてください。`, f.line), null;
    return String(f.value).trim();
  };

  // ---- number ----
  let number = null;
  if (!values.number) missing('number');
  else {
    const { value, line } = values.number;
    const s = isEmpty(value) ? '' : String(value).trim().toUpperCase();
    const archive = s.match(/^A(\d{1,2})$/); // 過去の旅（A01〜A99）
    if (s === '') err(`${label('number')}が空です。`, line);
    else if (archive ? Number(archive[1]) === 0 : !/^\d{1,3}$/.test(s) || Number(s) === 0)
      err(
        `${label('number')}は、ふだんの旅なら 001〜999、過去の旅なら A01〜A99 の半角で書いてください（例：number: "002" / number: "A01"）。`,
        line,
      );
    else {
      number = archive ? `A${archive[1].padStart(2, '0')}` : s.padStart(3, '0');
      if (fileNumber && number !== fileNumber)
        err(`番号「${number}」とファイル名「${base}」が合っていません。どちらかを同じ番号に直してください。`, line);
    }
  }

  // ---- 地名 ----
  const placeEn = requiredText('place_en');
  if (placeEn != null) {
    if (!/^[\x20-\x7E]+$/.test(placeEn))
      err(`${label('place_en')}は半角の英字で書いてください（例：Ishigaki）。全角の文字が入っています。`, values.place_en.line);
    else if (placeEn.length > 18) warn(`${label('place_en')}が長いので、表紙では文字が小さくなります。`, values.place_en.line);
  }
  const placeJa = requiredText('place_ja');
  if (placeJa != null && placeJa.length > 12)
    warn(`${label('place_ja')}が長いので、表紙では文字が小さくなります。`, values.place_ja.line);

  // ---- 日付 ----
  const start = parseDate('start');
  const end = parseDate('end');
  if (start && end) {
    if (end.str < start.str) err(`${label('end')}が${label('start')}より前になっています。`, values.end.line);
    else if (daysBetween(start, end) > 60)
      warn(`旅の期間が ${daysBetween(start, end)} 日あります。年や月の書き間違いがないか確認してください。`, values.end.line);
  }

  function parseDate(key) {
    const f = values[key];
    if (!f) return missing(key), null;
    let v = f.value;
    if (v instanceof Date) v = v.toISOString().slice(0, 10);
    if (isEmpty(v)) return err(`${label(key)}が空です（例：${key}: 2025-09-25）。`, f.line), null;
    const s = String(v).trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (!m) return err(`${label(key)}は「年-月-日」の形で書いてください（例：${key}: 2025-09-25）。`, f.line), null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d)
      return err(`${label(key)}の「${s}」は、カレンダーにない日付です。`, f.line), null;
    if (y < 1900 || y > 2200) return err(`${label(key)}の年「${y}」を確認してください。`, f.line), null;
    return { y, m: mo, d, str: `${m[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
  }

  // ---- color ----
  let color = null;
  if (!values.color) missing('color');
  else {
    const { value, line, rawLine } = values.color;
    if (isEmpty(value)) {
      if (/#/.test(rawLine))
        err(`${label('color')}が読み取れません。「#」から後ろはメモ扱いになってしまうため、"#3A7BD5" のように前後を「"」で囲んでください。`, line);
      else err(`${label('color')}が空です（例：color: "#3A7BD5"）。`, line);
    } else {
      let s = String(value).trim().replace(/＃/g, '#').replace(/^#/, '');
      if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.split('').map((c) => c + c).join('');
      if (/^[0-9a-fA-F]{6}$/.test(s)) color = '#' + s.toUpperCase();
      else
        err(`${label('color')}「${value}」は、「#」と6けたの英数字（0〜9 と A〜F）で書いてください（例：color: "#3A7BD5"）。`, line);
    }
  }

  // ---- message ----
  let message = [];
  if (values.message && !isEmpty(values.message.value)) {
    const { value, line } = values.message;
    if (typeof value === 'object') err(`${label('message')}は文章で書いてください。`, line);
    else {
      message = String(value)
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((s) => s.trim());
      while (message.length && message[0] === '') message.shift();
      while (message.length && message[message.length - 1] === '') message.pop();
      if (message.length > MAX_MESSAGE_LINES)
        err(`${label('message')}は${MAX_MESSAGE_LINES}行までにしてください（今は${message.length}行あります）。`, line);
      else if (message.some((s) => s.length > 20))
        warn(`${label('message')}の1行が長いので、スマホでは途中で折り返されます。`, line);
    }
  }

  // ---- album_url ----
  let albumUrl = null;
  if (values.album_url && !isEmpty(values.album_url.value)) {
    const { value, line } = values.album_url;
    const r = checkAlbumUrl(String(value).trim());
    if (r.error) err(`${label('album_url')}：${r.error}`, line);
    else {
      albumUrl = r.url;
      if (r.warning) warn(`${label('album_url')}：${r.warning}`, line);
    }
  }

  // ---- qr_icon ----
  let qrIcon = null;
  if (values.qr_icon && !isEmpty(values.qr_icon.value)) {
    const { value, line } = values.qr_icon;
    const raw = String(value).trim();
    const s = ICON_ALIASES[raw] || raw;
    const choices = iconChoices(iconNames);
    const found = /\.(svg|png)$/i.test(s)
      ? iconNames.find((n) => n === s)
      : [`${s}.svg`, `${s}.png`].find((n) => iconNames.includes(n));
    if (!/^[A-Za-z0-9_\-.]+$/.test(s) || s.startsWith('.') || !found)
      err(`${label('qr_icon')}：「${raw}」というアイコンはありません。使えるのは ${choices} です（なしにするときは ""）。`, line);
    else qrIcon = found;
  }

  if (errors.length) return { trip: null, errors, warnings };

  return {
    trip: {
      file,
      number,
      placeEn,
      placeJa,
      start: start.str,
      end: end.str,
      period: formatPeriod(start, end),
      color,
      message,
      albumUrl,
      qrIcon,
    },
    errors,
    warnings,
  };
}

/** GoogleフォトのURLをチェックする */
export function checkAlbumUrl(input) {
  if (/[^\x21-\x7E]/.test(input))
    return { error: 'URLの中に空白や全角の文字が入っています。アドレスバーのURLをそのまま貼り付けてください。' };
  let u;
  try {
    u = new URL(input);
  } catch {
    return { error: 'URLの形になっていません。「https://」から始まるURLを貼り付けてください。' };
  }
  let warning = null;
  if (u.protocol === 'http:') {
    u.protocol = 'https:';
    warning = '「http://」を「https://」に直して使います。';
  } else if (u.protocol !== 'https:') {
    return { error: '「https://」から始まるURLを貼り付けてください。' };
  }

  const host = u.hostname.toLowerCase();
  if (host === 'photos.google.com') {
    // 2つ目以降のGoogleアカウントで開くと「/u/1/」が入るので外す（家族が自分のアカウントで開けるように）
    const multi = u.pathname.match(/^\/u\/\d+(\/.*)$/);
    if (multi) {
      u.pathname = multi[1];
      warning = 'URLに入っていた「/u/数字」（アカウントの切り替え情報）は外して使います。';
    }
    if (/^\/(album|share)\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)) return { url: u.toString(), warning };
    if (/^\/(album|share)\/[^/]+\/photo\//.test(u.pathname))
      return { error: '写真1枚を開いたときのURLになっています。アルバムの一覧の画面に戻ってから、アドレスバーのURLをコピーしてください。' };
    return { error: 'アルバムのURLではないようです。「https://photos.google.com/album/…」の形のURLを貼り付けてください。' };
  }
  if (host === 'photos.app.goo.gl' && u.pathname.length > 1) return { url: u.toString(), warning };
  return { error: 'GoogleフォトのURLではないようです。「https://photos.google.com/album/…」の形のURLを貼り付けてください。' };
}

/** 期間の表示：2025.09.25 - 09.28 */
export function formatPeriod(s, e) {
  const p = (n) => String(n).padStart(2, '0');
  const first = `${s.y}.${p(s.m)}.${p(s.d)}`;
  if (s.str === e.str) return first;
  if (s.y !== e.y) return `${first} - ${e.y}.${p(e.m)}.${p(e.d)}`;
  return `${first} - ${p(e.m)}.${p(e.d)}`;
}

function daysBetween(a, b) {
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

// つづり間違いの候補を探す
function suggest(key) {
  const k = key.toLowerCase();
  let best = null;
  let bestD = Infinity;
  for (const f of Object.keys(FIELDS)) {
    const d = distance(k, f);
    if (d < bestD) [best, bestD] = [f, d];
  }
  return bestD <= Math.max(2, Math.floor(key.length / 3)) ? best : null;
}

function distance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
