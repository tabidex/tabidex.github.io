// 結果のお知らせ：画面（ログ）・GitHub Actions の注釈・まとめページ（Summary）に出します

import fs from 'node:fs';

const inActions = !!process.env.GITHUB_ACTIONS;

const escData = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escProp = (s) => escData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

function annotate(level, { file, line, message }, title) {
  if (!inActions) return;
  const props = [file && `file=${escProp(file)}`, line && `line=${line}`, `title=${escProp(title)}`].filter(Boolean).join(',');
  console.log(`::${level} ${props}::${escData(message)}`);
}

const where = ({ file, line }) => [file, line ? `${line}行目` : null].filter(Boolean).join(' の ');

function summary(md) {
  const p = process.env.GITHUB_STEP_SUMMARY;
  if (p) fs.appendFileSync(p, md + '\n');
}

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** 書き間違いがあったとき */
export function reportFailure(errors, warnings) {
  console.log('');
  console.log('==================================================');
  console.log(` ✗ 設定ファイルに直すところが ${errors.length} 件あります`);
  console.log('   サイトは更新していません（前回の状態のままです）');
  console.log('==================================================');
  for (const e of errors) {
    console.log(`\n● ${where(e) || '全体'}\n  ${e.message}`);
    annotate('error', e, '直すところがあります');
  }
  for (const w of warnings) annotate('warning', w, '確認してください');

  summary(
    [
      '## ✗ 直すところがあります',
      '',
      `設定ファイルに直すところが **${errors.length} 件** あります。`,
      '**サイトは更新していません**（前回の正しい状態のままなので、カードのQRはこれまで通り使えます）。',
      '',
      '| ファイル | 行 | 直すところ |',
      '|---|---|---|',
      ...errors.map((e) => `| ${cell(e.file || '-')} | ${e.line || '-'} | ${cell(e.message)} |`),
      '',
      '直し方：GitHub でそのファイルを開き、右上の鉛筆マーク（✏️）から書き直して「Commit changes」を押すと、もう一度自動でチェックされます。',
      warnings.length ? warningTable(warnings) : '',
    ].join('\n'),
  );
}

/** うまくいったとき */
export function reportSuccess(trips, warnings, notices, siteUrl) {
  console.log('');
  console.log(` ✓ ${trips.length} 件の旅でサイトを作りました`);
  for (const t of trips) console.log(`   No.${t.number} ${t.placeEn} → ${siteUrl}/trip/${t.number}/`);
  for (const w of warnings) {
    console.log(`\n△ ${where(w)}\n  ${w.message}`);
    annotate('warning', w, '確認してください');
  }
  for (const n of notices) {
    console.log(`\n・${where(n)}\n  ${n.message}`);
    annotate('notice', n, 'お知らせ');
  }

  summary(
    [
      '## ✓ サイトを作りました',
      '',
      'このあと「deploy」が終わると、1〜2分でサイトに反映されます。',
      '',
      '| 番号 | 地名 | 表紙ページ | 印刷用QR |',
      '|---|---|---|---|',
      ...trips.map(
        (t) =>
          `| No.${t.number} | ${cell(t.placeEn)} / ${cell(t.placeJa)} | ${siteUrl}/trip/${t.number}/ | [SVG](${siteUrl}/trip/${t.number}/qr.svg) ・ [PNG](${siteUrl}/trip/${t.number}/qr.png) |`,
      ),
      warnings.length ? warningTable(warnings) : '',
      notices.length
        ? ['', '### お知らせ', '', ...notices.map((n) => `- ${cell(n.file)}：${cell(n.message)}`)].join('\n')
        : '',
    ].join('\n'),
  );
}

function warningTable(warnings) {
  return [
    '',
    '### △ 確認してください（公開はされます）',
    '',
    '| ファイル | 行 | 内容 |',
    '|---|---|---|',
    ...warnings.map((w) => `| ${cell(w.file || '-')} | ${w.line || '-'} | ${cell(w.message)} |`),
  ].join('\n');
}
