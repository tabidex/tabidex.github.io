// 自動テスト：わざと書き間違えた設定で、正しくエラーが出るかを確かめます。
// 実行：npm test

import fs from 'node:fs';
import assert from 'node:assert/strict';
import { validateTrip, checkAlbumUrl } from './validate.mjs';
import { textColorFor, qrColorFor, contrast } from './color.mjs';
import { makeQrSvg, verifyQr } from './qr.mjs';

const GOOD = `number: "001"
place_en: Ishigaki
place_ja: 石垣島
start: 2025-09-25
end: 2025-09-28
color: "#3A7BD5"
message: |
  青い海
  星空
album_url: "https://photos.google.com/album/AF1QipABC123"
qr_icon: "default.svg"
`;

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.log(`  ✗ ${name}`);
    throw e;
  }
}

const run = (text, file = 'trips/001.yml') => validateTrip({ file, text, iconExists: (n) => n === 'default.svg' });
const expectError = (text, pattern, line, file) => {
  const r = run(text, file);
  assert.equal(r.trip, null, '失敗するはずが成功した');
  const hit = r.errors.find((e) => pattern.test(e.message));
  assert.ok(hit, `期待したエラーがない。実際：${JSON.stringify(r.errors, null, 1)}`);
  if (line !== undefined) assert.equal(hit.line, line);
};
const swap = (from, to) => GOOD.replace(from, to);

console.log('設定ファイルのチェック');
test('正しいファイルは通る', () => {
  const r = run(GOOD);
  assert.deepEqual(r.errors, []);
  assert.equal(r.trip.number, '001');
  assert.equal(r.trip.period, '2025.09.25 - 09.28');
  assert.deepEqual(r.trip.message, ['青い海', '星空']);
});
test('見本ファイルとNo.001は通る', () => {
  for (const f of ['trips/_見本.yml', 'trips/001.yml']) {
    const text = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    const r = validateTrip({ file: f.replace('_見本', '002'), text, iconExists: () => true });
    assert.deepEqual(r.errors, [], f);
  }
});
test('色を " で囲み忘れ', () => expectError(swap('color: "#3A7BD5"', 'color: #3A7BD5'), /「"」で囲んで/, 6));
test('色の形がおかしい', () => expectError(swap('#3A7BD5', '#3A7BZ5'), /6けたの英数字/, 6));
test('色の # なし・3けたはOK', () => {
  assert.equal(run(swap('"#3A7BD5"', '"3a7bd5"')).trip.color, '#3A7BD5');
  assert.equal(run(swap('"#3A7BD5"', '"#fa0"')).trip.color, '#FFAA00');
});
test('全角のコロン', () => expectError(swap('place_ja: 石垣島', 'place_ja：石垣島'), /全角/, 3));
test('コロンの後ろにスペースなし', () => expectError(swap('place_en: Ishigaki', 'place_en:Ishigaki'), /半角スペースを1つ/, 2));
test('項目名のつづり間違い', () => expectError(swap('album_url:', 'album_ur:'), /album_url.*つづり/, 10));
test('必要な項目がない', () => expectError(swap('place_en: Ishigaki\n', ''), /place_en.*ありません/));
test('同じ項目が2回', () => expectError(GOOD + 'place_ja: 京都\n', /2回/));
test('番号とファイル名がちがう', () => expectError(GOOD, /合っていません/, 1, 'trips/002.yml'));
test('ファイル名がおかしい', () => expectError(GOOD, /ファイル名/, undefined, 'trips/001 copy.yml'));
test('番号は " なしでもOK', () => assert.equal(run(swap('"001"', '001')).trip.number, '001'));
test('日付の形がおかしい', () => expectError(swap('2025-09-25', '9月25日'), /年-月-日/, 4));
test('ない日付', () => expectError(swap('2025-09-28', '2025-09-31'), /カレンダーにない/, 5));
test('終わりが始まりより前', () => expectError(swap('2025-09-28', '2025-09-20'), /より前/, 5));
test('スラッシュの日付はOK', () => assert.equal(run(swap('2025-09-25', '2025/9/25')).trip.start, '2025-09-25'));
test('年をまたぐ期間の表示', () =>
  assert.equal(run(swap('2025-09-25', '2025-12-30').replace('2025-09-28', '2026-01-02')).trip.period, '2025.12.30 - 2026.01.02'));
test('日帰りの表示', () => assert.equal(run(swap('2025-09-28', '2025-09-25')).trip.period, '2025.09.25'));
test('一言が4行', () => expectError(swap('  星空\n', '  星空\n  3\n  4\n'), /3行まで/, 7));
test('一言のインデント忘れ', () => expectError(swap('  青い海\n  星空\n', '青い海\n星空\n'), /先頭に半角スペースを2つ/, 8));
test('色の " 忘れと全角コロンを同時に知らせる', () => {
  const r = run(swap('color: "#3A7BD5"', 'color: #3A7BD5').replace('place_ja: ', 'place_ja：'));
  assert.equal(r.errors.length, 2);
});
test('一言は空でもOK', () => assert.deepEqual(run(swap('message: |\n  青い海\n  星空\n', 'message: ""\n')).trip.message, []));
test('URLは空でもOK', () => assert.equal(run(swap('"https://photos.google.com/album/AF1QipABC123"', '""')).trip.albumUrl, null));
test('URLがGoogleフォトではない', () => expectError(swap('https://photos.google.com/album/AF1QipABC123', 'https://example.com/x'), /GoogleフォトのURLではない/, 10));
test('先頭に全角スペース', () => expectError(swap('place_en:', '　place_en:'), /全角スペース/, 2));
test('タブ文字', () => expectError(swap('  青い海', '\t青い海'), /タブ/, 8));
test('アイコンが見つからない', () => expectError(swap('default.svg', 'plane.svg'), /見つかりません/, 11));
test('英語の地名に全角', () => expectError(swap('Ishigaki', 'Ｉｓｈｉｇａｋｉ'), /半角の英字/, 2));
test('空のファイル', () => expectError('', /空/));

console.log('GoogleフォトのURL');
test('album の形', () => assert.ok(checkAlbumUrl('https://photos.google.com/album/AF1QipXYZ').url));
test('share の形（key つき）', () =>
  assert.equal(checkAlbumUrl('https://photos.google.com/share/AF1QipXYZ?key=abc').url, 'https://photos.google.com/share/AF1QipXYZ?key=abc'));
test('共有リンクの形', () => assert.ok(checkAlbumUrl('https://photos.app.goo.gl/abcDEF').url));
test('/u/1/ は外す', () => {
  const r = checkAlbumUrl('https://photos.google.com/u/1/album/AF1QipXYZ');
  assert.equal(r.url, 'https://photos.google.com/album/AF1QipXYZ');
  assert.ok(r.warning);
});
test('写真1枚のURL', () => assert.match(checkAlbumUrl('https://photos.google.com/album/AF1/photo/AF2').error, /写真1枚/));
test('トップページのURL', () => assert.ok(checkAlbumUrl('https://photos.google.com/').error));
test('空白入り', () => assert.ok(checkAlbumUrl('https://photos.google.com/album/AF 1').error));

console.log('色');
test('青は白文字', () => assert.equal(textColorFor('#3A7BD5').fg, '#FFFFFF'));
test('黄色は濃い文字', () => {
  const { fg, isLight } = textColorFor('#FFE066');
  assert.ok(isLight);
  assert.ok(contrast(fg, '#FFE066') >= 7);
});
test('白は濃い文字', () => assert.ok(textColorFor('#FFFFFF').isLight));
test('明るい色のQRは濃くなる', () => {
  const q = qrColorFor('#FFE066');
  assert.ok(q.adjusted);
  assert.ok(contrast(q.color, '#FFFFFF') >= 4);
});
test('青のQRはそのまま', () => assert.equal(qrColorFor('#3A7BD5').color, '#3A7BD5'));

console.log('QRコード');
const icon = { type: 'svg', data: fs.readFileSync(new URL('../assets/icons/default.svg', import.meta.url), 'utf8') };
for (const n of ['001', '042', '999']) {
  test(`No.${n} のQRが読み取れる（アイコンあり・なし）`, () => {
    const url = `https://tabidex.github.io/trip/${n}/`;
    assert.ok(verifyQr(makeQrSvg(url, { color: '#3A7BD5', icon }), url));
    assert.ok(verifyQr(makeQrSvg(url, { color: '#3A7BD5', icon: null }), url));
  });
}

console.log(`\nすべて OK（${passed} 件）`);
