// QRコードを作る（点は丸・四隅の目印は角丸・真ん中にアイコン・誤り訂正レベルH）

import QRCode from 'qrcode';
import AlignmentPattern from 'qrcode/lib/core/alignment-pattern.js';
import { Resvg } from '@resvg/resvg-js';
import jsQR from 'jsqr';

const U = 10; // 1マスの大きさ（SVGの単位）
const QUIET = 4; // 周りの余白（マス）。読み取りのために4マス残します

/**
 * QRコードのSVGを作る
 * @param {string} text  QRに入れる文字（URL）
 * @param {object} o
 * @param {string} o.color  点の色
 * @param {{type:'svg'|'png', data:string|Buffer}|null} o.icon  真ん中のアイコン
 */
export function makeQrSvg(text, { color, icon = null }) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'H' });
  const N = qr.modules.size;
  const dark = (r, c) => qr.modules.get(r, c) === 1 || qr.modules.get(r, c) === true;
  const total = (N + QUIET * 2) * U;
  const off = QUIET * U;

  // 四隅の目印（ファインダーパターン）の場所
  const inFinder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7);
  // 小さな位置合わせの目印（アライメントパターン）の場所。点ではなく角丸の四角で描きます
  const aligns = AlignmentPattern.getPositions(qr.version);
  const inAlign = (r, c) => aligns.some(([ar, ac]) => Math.abs(r - ar) <= 2 && Math.abs(c - ac) <= 2);

  // アイコンを置く場所（真ん中・奇数マス）。そこにある点は描かない
  let k = 0;
  if (icon) {
    k = Math.round(N * 0.24);
    if (k % 2 === 0) k += 1;
  }
  const lo = (N - k) / 2;
  const inIcon = (r, c) => k > 0 && r >= lo && r < lo + k && c >= lo && c < lo + k;

  // 丸い点（1本のpathにまとめて軽くする）
  const rad = U * 0.46;
  const f = (n) => Math.round(n * 100) / 100;
  let dots = '';
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (!dark(r, c) || inFinder(r, c) || inAlign(r, c) || inIcon(r, c)) continue;
      const cx = off + c * U + U / 2;
      const cy = off + r * U + U / 2;
      dots += `M${f(cx - rad)} ${f(cy)}a${f(rad)} ${f(rad)} 0 1 0 ${f(rad * 2)} 0a${f(rad)} ${f(rad)} 0 1 0 ${f(-rad * 2)} 0`;
    }
  }

  // 角丸の目印
  const roundRect = (x, y, w, rx) =>
    `M${x + rx} ${y}h${w - 2 * rx}a${rx} ${rx} 0 0 1 ${rx} ${rx}v${w - 2 * rx}a${rx} ${rx} 0 0 1 ${-rx} ${rx}` +
    `h${-(w - 2 * rx)}a${rx} ${rx} 0 0 1 ${-rx} ${-rx}v${-(w - 2 * rx)}a${rx} ${rx} 0 0 1 ${rx} ${-rx}z`;
  let finders = '';
  for (const [r, c] of [
    [0, 0],
    [0, N - 7],
    [N - 7, 0],
  ]) {
    const x = off + c * U;
    const y = off + r * U;
    finders += roundRect(x, y, 7 * U, 2.2 * U) + roundRect(x + U, y + U, 5 * U, 1.4 * U); // 外わく（ドーナツ形）
    finders += roundRect(x + 2 * U, y + 2 * U, 3 * U, 1 * U); // 中の四角
  }
  for (const [ar, ac] of aligns) {
    const x = off + (ac - 2) * U;
    const y = off + (ar - 2) * U;
    finders += roundRect(x, y, 5 * U, 1.6 * U) + roundRect(x + U, y + U, 3 * U, 0.9 * U);
    finders += roundRect(x + 2 * U, y + 2 * U, U, 0.5 * U);
  }

  // 真ん中のアイコン
  let iconSvg = '';
  if (icon) {
    const box = k * U;
    const bx = off + lo * U;
    const pad = U * 0.9;
    const inner = box - pad * 2;
    const ix = bx + pad;
    iconSvg += `<rect x="${bx + U * 0.3}" y="${bx + U * 0.3}" width="${box - U * 0.6}" height="${box - U * 0.6}" rx="${U * 1.6}" fill="#FFFFFF"/>`;
    if (icon.type === 'svg') iconSvg += embedSvg(icon.data, color, ix, ix, inner);
    else
      iconSvg += `<image x="${ix}" y="${ix}" width="${inner}" height="${inner}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${Buffer.from(icon.data).toString('base64')}"/>`;
  }

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total}" height="${total}">` +
    `<rect width="${total}" height="${total}" fill="#FFFFFF"/>` +
    `<path fill="${color}" fill-rule="evenodd" d="${finders}"/>` +
    `<path fill="${color}" d="${dots}"/>` +
    iconSvg +
    `</svg>\n`
  );
}

// アイコンのSVGを、指定の場所・大きさで埋め込む（currentColor はQRの色になります）
function embedSvg(src, color, x, y, size) {
  let s = String(src)
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim()
    .replace(/currentColor/g, color);
  s = s.replace(/<svg\b([^>]*)>/, (_, attrs) => {
    const cleaned = attrs.replace(/\s(x|y|width|height)="[^"]*"/g, '');
    return `<svg${cleaned} x="${x}" y="${y}" width="${size}" height="${size}">`;
  });
  return s;
}

/** アイコンのSVGとして使えるか確認する（使えないときは理由を返す） */
export function checkIconSvg(src) {
  const s = String(src);
  if (!/<svg\b/.test(s)) return 'SVGファイルとして読み取れません。';
  const root = s.match(/<svg\b[^>]*>/)[0];
  if (!/viewBox=/.test(root)) return 'SVGに viewBox がありません。viewBox のあるSVGを使ってください。';
  if (/<script\b/i.test(s)) return 'SVGの中にスクリプトが入っているため使えません。';
  return null;
}

/** SVGを高解像度のPNGにする */
export function svgToPng(svg, size) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: size }, background: '#FFFFFF' }).render().asPng();
}

/** 作ったQRが本当に読み取れるか、いくつかの大きさで試す */
export function verifyQr(svg, expected) {
  for (const size of [240, 480, 1000, 2048]) {
    const img = new Resvg(svg, { fitTo: { mode: 'width', value: size }, background: '#FFFFFF' }).render();
    const data = new Uint8ClampedArray(img.pixels);
    const result = jsQR(data, img.width, img.height);
    if (!result || result.data !== expected) return false;
  }
  return true;
}
