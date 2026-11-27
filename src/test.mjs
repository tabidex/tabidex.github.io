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
qr_icon: "plane"
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

const ICONS = ['plane.svg', 'car.svg', 'train.svg', 'ship.svg'];
const run = (text, file = 'trips/001.yml') => validateTrip({ file, text, iconNames: ICONS });
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
// ※ trips/ の旅のファイル（001.yml や A01.yml など）は、ここでは読まない。
//   中身はいつでも書き換えられるので、テストが旅の中身に左右されないようにするため。
//   （旅のファイルの書き間違いは、npm run build のチェックで見つけます）
const SAMPLE = fs.readFileSync(new URL('../trips/_見本.yml', import.meta.url), 'utf8');
test('見本ファイルは通る', () => {
  const r = validateTrip({ file: 'trips/002.yml', text: SAMPLE, iconNames: ICONS });
  assert.deepEqual(r.errors, []);
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
test('過去の旅の番号 A01', () => {
  const a = (num, file) => run(swap('"001"', num), file);
  assert.equal(a('"A01"', 'trips/A01.yml').trip.number, 'A01');
  assert.equal(a('A01', 'trips/A01.yml').trip.number, 'A01');
  assert.equal(a('"a01"', 'trips/A01.yml').trip.number, 'A01');
  assert.equal(a('"A1"', 'trips/A01.yml').trip.number, 'A01');
  assert.equal(a('"A99"', 'trips/A99.yml').trip.number, 'A99');
});
test('過去の旅の番号がおかしい', () => {
  expectError(swap('"001"', '"A00"'), /A01〜A99/, 1, 'trips/A01.yml');
  expectError(swap('"001"', '"B01"'), /A01〜A99/, 1, 'trips/A01.yml');
  expectError(swap('"001"', '"A100"'), /A01〜A99/, 1, 'trips/A01.yml');
  expectError(swap('"001"', '"A02"'), /合っていません/, 1, 'trips/A01.yml');
  expectError(swap('"001"', '"A01"'), /ファイル名/, undefined, 'trips/A001.yml');
});
test('過去の旅のQRが読み取れる', () => {
  const url = 'https://tabidex.github.io/trip/A01/';
  assert.ok(verifyQr(makeQrSvg(url, { color: '#3A7BD5', icon: null }), url));
});
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
test('アイコンが見つからない', () => expectError(swap('"plane"', '"rocket"'), /plane \/ car \/ train \/ ship/, 11));
test('アイコンは名前・ファイル名・日本語で選べる', () => {
  for (const [v, want] of [['car', 'car.svg'], ['train.svg', 'train.svg'], ['船', 'ship.svg'], ['ひこうき', 'plane.svg']])
    assert.equal(run(swap('"plane"', `"${v}"`)).trip.qrIcon, want, v);
  assert.equal(run(swap('"plane"', '""')).trip.qrIcon, null);
});
test('英語の地名に全角', () => expectError(swap('Ishigaki', 'Ｉｓｈｉｇａｋｉ'), /半角の英字/, 2));
test('空のファイル', () => expectError('', /空/));

const BOX = `number: "A02"
place_en: ""
place_ja: ""
start: ""
end: ""
color: ""
message: ""
album_url: ""
qr_color: "#000000"
qr_icon: "plane"
`;
test('準備中の箱（地名・日付が空）は通る', () => {
  const r = validateTrip({ file: 'trips/A02.yml', text: BOX, iconNames: ICONS });
  assert.deepEqual(r.errors, []);
  assert.equal(r.trip.placeholder, true);
  assert.equal(r.trip.qrColor, '#000000');
  assert.equal(r.trip.color, null);
});
test('準備中の箱は項目の行がなくてもOK', () => {
  const r = validateTrip({ file: 'trips/A02.yml', text: 'number: "A02"\n', iconNames: ICONS });
  assert.deepEqual(r.errors, []);
  assert.equal(r.trip.placeholder, true);
});
test('地名だけ書いて日付が空ならエラー', () => {
  const r = validateTrip({ file: 'trips/A02.yml', text: BOX.replace('place_en: ""', 'place_en: Miyako'), iconNames: ICONS });
  assert.equal(r.trip, null);
  assert.ok(r.errors.some((e) => /place_ja/.test(e.message)));
  assert.ok(r.errors.some((e) => /start/.test(e.message)));
});
test('ふつうの旅では色が必須', () => expectError(swap('color: "#3A7BD5"', 'color: ""'), /color.*空/, 6));
test('qr_color の " 忘れ', () => expectError(GOOD + 'qr_color: #000000\n', /qr_color.*「"」で囲んで/));
test('qr_color の形がおかしい', () => expectError(GOOD + 'qr_color: "black"\n', /qr_color.*6けた/));
test('qr_color は空ならテーマカラー（null）', () => assert.equal(run(GOOD + 'qr_color: ""\n').trip.qrColor, null));
test('見本の地名と日付を空にすると準備中の箱になる', () => {
  const text = SAMPLE.replace('place_en: Okinawa', 'place_en: ""')
    .replace('place_ja: 沖縄', 'place_ja: ""')
    .replace('start: 2026-01-01', 'start: ""')
    .replace('end: 2026-01-03', 'end: ""');
  const r = validateTrip({ file: 'trips/002.yml', text, iconNames: ICONS });
  assert.deepEqual(r.errors, []);
  assert.equal(r.trip.placeholder, true);
});

test('iPhoneの「“ ”」は自動で直す', () => {
  const r = run(swap('color: "#3A7BD5"', 'color: “#3A7BD5”').replace('number: "001"', 'number: ”001”'));
  assert.deepEqual(r.errors, []);
  assert.equal(r.trip.color, '#3A7BD5');
  assert.equal(r.trip.number, '001');
  assert.equal(r.warnings.filter((w) => /スマート句読点/.test(w.message)).length, 2);
});
test('片方だけ「”」・全角「＂」・「‘ ’」も直す', () => {
  assert.equal(run(swap('color: "#3A7BD5"', 'color: "#3A7BD5”')).trip.color, '#3A7BD5');
  assert.equal(run(swap('color: "#3A7BD5"', 'color: ＂#3A7BD5＂')).trip.color, '#3A7BD5');
  assert.equal(run(swap('color: "#3A7BD5"', 'color: ‘#3A7BD5’')).trip.color, '#3A7BD5');
  assert.equal(run(swap('"plane"', '“car”')).trip.qrIcon, 'car.svg');
});
test('URLの「“ ”」も直す', () =>
  assert.equal(
    run(swap('"https://photos.google.com/album/AF1QipABC123"', '“https://photos.google.com/album/AF1QipABC123”')).trip.albumUrl,
    'https://photos.google.com/album/AF1QipABC123',
  ));
test('一言の中の「“ ”」はそのまま', () => {
  const r = run(swap('message: |\n  青い海\n  星空\n', 'message: “最高”\n'));
  assert.deepEqual(r.trip.message, ['“最高”']);
  assert.equal(r.warnings.length, 0);
});
test('ふつうの「"」なら何も言わない', () => assert.equal(run(GOOD).warnings.length, 0));

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
test('中くらいの明るさの色のQRも濃くなる', () => {
  for (const c of ['#5B8C85', '#F06292']) {
    const q = qrColorFor(c);
    assert.ok(q.adjusted, c);
    const url = 'https://tabidex.github.io/trip/003/';
    assert.ok(verifyQr(makeQrSvg(url, { color: q.color, icon: null }), url), c);
  }
});
test('青のQRはそのまま', () => assert.equal(qrColorFor('#3A7BD5').color, '#3A7BD5'));

console.log('QRコード');
for (const name of ICONS) {
  const icon = { type: 'svg', data: fs.readFileSync(new URL(`../assets/icons/${name}`, import.meta.url), 'utf8') };
  test(`${name} 入りのQRが読み取れる（No.001 / 042 / 999）`, () => {
    for (const n of ['001', '042', '999']) {
      const url = `https://tabidex.github.io/trip/${n}/`;
      assert.ok(verifyQr(makeQrSvg(url, { color: '#3A7BD5', icon }), url), n);
    }
  });
}
test('アイコンなしのQRが読み取れる', () => {
  const url = 'https://tabidex.github.io/trip/001/';
  assert.ok(verifyQr(makeQrSvg(url, { color: '#3A7BD5', icon: null }), url));
});

console.log(`\nすべて OK（${passed} 件）`);
