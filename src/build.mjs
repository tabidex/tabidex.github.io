// サイトを作るプログラム
//   1. trips/ の設定ファイルをすべてチェック
//   2. 1つでも直すところがあれば、何も公開せずに終了（サイトは前回のまま）
//   3. 問題なければ、表紙ページ・トップページ・QRコードを _site/ に作る

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { SITE_URL, TRIPS_DIR, ICONS_DIR, OUT_DIR, QR_PNG_SIZE, LABEL_MAIN, NOTE_MAIN, LABEL_ARCHIVE, NOTE_ARCHIVE } from './config.mjs';
import { validateTrip } from './validate.mjs';
import { textColorFor, qrColorFor } from './color.mjs';
import { makeQrSvg, svgToPng, verifyQr, checkIconSvg } from './qr.mjs';
import { tripPage, indexPage, notFoundPage } from './templates/pages.mjs';
import { reportFailure, reportSuccess } from './report.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r = (...p) => path.join(ROOT, ...p);

// trips/ の中で、設定ファイルとして扱うもの（「_」「.」で始まるもの、README は対象外）
function listTripFiles() {
  if (!fs.existsSync(r(TRIPS_DIR))) return [];
  return fs
    .readdirSync(r(TRIPS_DIR), { withFileTypes: true })
    .filter((d) => d.isFile() && !/^[_.]/.test(d.name) && !/^readme/i.test(d.name))
    .map((d) => d.name)
    .sort();
}

const iconNames = fs.existsSync(r(ICONS_DIR)) ? fs.readdirSync(r(ICONS_DIR)).sort(iconOrder) : [];

// アイコンの表示順（乗り物を先に）
function iconOrder(a, b) {
  const first = ['plane.svg', 'car.svg', 'train.svg', 'ship.svg'];
  const ia = first.indexOf(a) === -1 ? 99 : first.indexOf(a);
  const ib = first.indexOf(b) === -1 ? 99 : first.indexOf(b);
  return ia - ib || a.localeCompare(b);
}

function main() {
  const errors = [];
  const warnings = [];
  const notices = [];
  const trips = [];

  // ---- 1. チェック ----
  for (const name of listTripFiles()) {
    const file = `${TRIPS_DIR}/${name}`;
    const text = fs.readFileSync(r(file), 'utf8').replace(/^﻿/, '');
    const res = validateTrip({ file, text, iconNames });
    errors.push(...res.errors);
    warnings.push(...res.warnings);
    if (res.trip) trips.push(res.trip);
  }

  // 同じ番号の旅が2つないか（例：a01.yml と A01.yml）
  const seen = new Map();
  for (const t of trips) {
    if (seen.has(t.number))
      errors.push({ file: t.file, message: `番号「${t.number}」は ${seen.get(t.number)} でも使われています。どちらかの番号を変えてください。` });
    else seen.set(t.number, t.file);
  }

  // アイコンの中身のチェック
  for (const t of trips) {
    if (!t.qrIcon) continue;
    const buf = fs.readFileSync(r(ICONS_DIR, t.qrIcon));
    if (t.qrIcon.toLowerCase().endsWith('.svg')) {
      const problem = checkIconSvg(buf.toString('utf8'));
      if (problem) errors.push({ file: t.file, message: `「qr_icon」（QRのアイコン）の ${t.qrIcon}：${problem}` });
      t.icon = { type: 'svg', data: buf.toString('utf8') };
    } else {
      t.icon = { type: 'png', data: buf };
    }
  }

  if (errors.length) {
    reportFailure(errors, warnings);
    process.exit(1);
  }

  // ---- 2. 色とQRの準備（QRが読み取れるかもここで確かめる） ----
  for (const t of trips) {
    t.fg = textColorFor(t.color).fg;
    const qc = qrColorFor(t.color);
    if (qc.adjusted)
      warnings.push({
        file: t.file,
        message: `テーマカラーのままだとQRコードが読み取りにくいため、QRの色だけ少し濃い ${qc.color} にしました（ページの色はそのままです）。`,
      });
    const url = `${SITE_URL}/trip/${t.number}/`;
    t.qrSvg = makeQrSvg(url, { color: qc.color, icon: t.icon || null });
    if (!verifyQr(t.qrSvg, url)) {
      errors.push({
        file: t.file,
        message: 'QRコードがうまく読み取れませんでした。「qr_icon」を "" にしてアイコンを外すか、テーマカラーを濃い色にしてください。',
      });
    }
    if (!t.albumUrl)
      notices.push({ file: t.file, message: '「album_url」がまだ空なので、ボタンは「動画は準備中です」と表示されます。' });
  }

  if (errors.length) {
    reportFailure(errors, warnings);
    process.exit(1);
  }

  // ---- 3. サイトを作る ----
  const out = r(OUT_DIR);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  const css = fs.readFileSync(r('src/templates/style.css'), 'utf8');
  const cssHash = crypto.createHash('sha256').update(css).digest('hex').slice(0, 10);
  const cssPath = `/style.css?v=${cssHash}`;
  fs.writeFileSync(path.join(out, 'style.css'), css);

  const favicon = fs.readFileSync(r(ICONS_DIR, 'plane.svg'), 'utf8').replace(/currentColor/g, '#3A7BD5');
  fs.writeFileSync(path.join(out, 'favicon.svg'), favicon);

  trips.sort((a, b) => a.number.localeCompare(b.number));
  for (const t of trips) {
    const dir = path.join(out, 'trip', t.number);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), tripPage(t, { cssPath }));
    fs.writeFileSync(path.join(dir, 'qr.svg'), t.qrSvg);
    fs.writeFileSync(path.join(dir, 'qr.png'), svgToPng(t.qrSvg, QR_PNG_SIZE));
  }
  // トップページ：「旅の記録（001〜）」の下に「過去の旅の記録（A01〜）」。
  // どちらも番号の大きい順（新しく作ったカードが上）
  const desc = (list) => [...list].sort((a, b) => b.number.localeCompare(a.number));
  const groups = [
    { label: LABEL_MAIN, note: NOTE_MAIN, trips: desc(trips.filter((t) => !t.number.startsWith('A'))) },
    { label: LABEL_ARCHIVE, note: NOTE_ARCHIVE, trips: desc(trips.filter((t) => t.number.startsWith('A'))) },
  ];
  fs.writeFileSync(path.join(out, 'index.html'), indexPage(groups, { cssPath }));
  fs.writeFileSync(path.join(out, '404.html'), notFoundPage({ cssPath }));

  reportSuccess(trips, warnings, notices, SITE_URL);
}

main();
