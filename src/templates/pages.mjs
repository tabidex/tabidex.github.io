// ページのひな形（表紙ページ・トップページ・見つからないページ）

import { SITE_NAME } from '../config.mjs';

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const FONT_URL = 'https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@500;800&display=swap';

function head({ title, themeColor, cssPath }) {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<!-- 検索エンジンに出さない設定 -->
<meta name="robots" content="noindex, nofollow, noarchive, noimageindex">
<meta name="googlebot" content="noindex, nofollow, noarchive, noimageindex">
<!-- リンク先（Googleフォト）にこのページのURLを伝えない -->
<meta name="referrer" content="no-referrer">
<meta name="format-detection" content="telephone=no">
<meta name="theme-color" content="${esc(themeColor)}">
<title>${esc(title)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONT_URL}">
<link rel="stylesheet" href="${esc(cssPath)}">
</head>`;
}

// 文字数に合わせて地名の大きさを決める（長い地名ははみ出さないよう小さく）
const sizeEn = (text, max, base) => Math.min(max, base / Math.max(text.length, 1)).toFixed(2);
const sizeJa = (text) => Math.min(8.5, 76 / Math.max(text.length, 1)).toFixed(2);

const ICON_PLAY = `<svg class="btn__icon" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="currentColor" opacity=".16"/><path d="M13 10.2v11.6a1 1 0 0 0 1.5.86l9.3-5.8a1 1 0 0 0 0-1.72l-9.3-5.8a1 1 0 0 0-1.5.86z" fill="currentColor"/></svg>`;
const ICON_LOCK = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="2.5" y="7" width="11" height="8" rx="2.2" fill="currentColor"/></svg>`;

/** 表紙ページ */
export function tripPage(t, { cssPath }) {
  const style = `--bg:${t.color};--fg:${t.fg};--k-en:${sizeEn(t.placeEn, 17, 136)};--k-ja:${sizeJa(t.placeJa)}`;
  const message = t.message.length
    ? `\n      <p class="cover__message">${t.message.map(esc).join('<br>')}</p>`
    : '';
  const button = t.albumUrl
    ? `<a class="btn" href="${esc(t.albumUrl)}" rel="noopener noreferrer">${ICON_PLAY}<span>動画を見る</span></a>`
    : `<span class="btn btn--disabled" aria-disabled="true">動画は準備中です</span>`;

  return `${head({ title: `No.${t.number} ${t.placeEn} | ${SITE_NAME}`, themeColor: t.color, cssPath })}
<body class="cover-page" style="${style}">
  <main class="cover">
    <div class="cover__watermark" aria-hidden="true">${esc(t.number)}</div>
    <p class="cover__label"><span>TRAVEL</span><span class="cover__no">No.${esc(t.number)}</span></p>
    <div class="cover__main">
      <h1 class="cover__en">${esc(t.placeEn)}</h1>
      <p class="cover__ja">${esc(t.placeJa)}</p>
      <hr class="cover__rule">
      <p class="cover__period"><time datetime="${esc(t.start)}">${esc(t.period)}</time></p>${message}
    </div>
    <div class="cover__action">
      ${button}
      <p class="cover__note">${ICON_LOCK}家族のみ閲覧できます</p>
      <div><a class="cover__back" href="/">すべての旅を見る</a></div>
    </div>
  </main>
</body>
</html>
`;
}

/** トップページ（全旅行の一覧）。groups = [{ label, note, trips }]、空のグループは出さない */
export function indexPage(groups, { cssPath }) {
  const card = (t) => `      <li>
        <a class="card" href="/trip/${esc(t.number)}/" style="--bg:${t.color};--fg:${t.fg};--k-en:${sizeEn(t.placeEn, 19, 150)}">
          <span class="card__watermark" aria-hidden="true">${esc(t.number)}</span>
          <span class="card__no">No.${esc(t.number)}</span>
          <span class="card__body">
            <span class="card__en">${esc(t.placeEn)}</span>
            <span class="card__ja">${esc(t.placeJa)}</span>
            <span class="card__period">${esc(t.period)}</span>
          </span>
        </a>
      </li>`;

  const shown = groups.filter((g) => g.trips.length);
  const total = shown.reduce((n, g) => n + g.trips.length, 0);
  const sections = shown
    .map(
      (g) => `    <section class="group">
      <h2 class="group__title">${esc(g.label)}${g.note ? `<small class="group__note">${esc(g.note)}</small>` : ''}<span class="group__count">${g.trips.length}件</span></h2>
      <ul class="cards">
${g.trips.map(card).join('\n')}
      </ul>
    </section>`,
    )
    .join('\n');

  return `${head({ title: `${SITE_NAME} | 旅の記録`, themeColor: '#F4F1EA', cssPath })}
<body>
  <main class="index">
    <header class="index__head">
      <h1 class="index__title">${SITE_NAME}</h1>
      <p class="index__sub">ぜんぶで ${total}件</p>
    </header>
${total ? sections : '    <p class="empty">まだ旅がありません</p>'}
  </main>
</body>
</html>
`;
}

/** 見つからないページ（404） */
export function notFoundPage({ cssPath }) {
  return `${head({ title: `ページが見つかりません | ${SITE_NAME}`, themeColor: '#F4F1EA', cssPath })}
<body>
  <main class="notfound">
    <h1>ページが見つかりません</h1>
    <p>URLが変わったか、まだ公開されていない旅かもしれません。</p>
    <p><a href="/">すべての旅を見る</a></p>
  </main>
</body>
</html>
`;
}
