// 色の計算：背景色から読みやすい文字色を決める・QR用の色を決める
// 見やすさの基準には WCAG のコントラスト比（1〜21。大きいほど見やすい）を使います。

const WHITE = '#FFFFFF';
const FALLBACK_DARK = '#1A1A1A';

// 白文字を使う最低ライン（太い大きな文字向けの基準 3:1）
const WHITE_TEXT_MIN = 3.0;
// QRの点の色と白背景の最低ライン。これより低いと自動で濃くします。
// （テストで、これより低い中くらいの明るさの色は読み取りに失敗しやすかったため）
const QR_MIN = 4.2;
const QR_TARGET = 4.5;

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// 色を黒に近づける（amount: 0〜1）
function darken(hex, amount) {
  return rgbToHex(hexToRgb(hex).map((v) => v * (1 - amount)));
}

/**
 * 背景色に合う文字色を返す。
 * 基本は白。白が読みにくい明るい色なら、テーマカラーを濃くした色（だめなら黒に近い色）。
 */
export function textColorFor(bg) {
  if (contrast(WHITE, bg) >= WHITE_TEXT_MIN) return { fg: WHITE, isLight: false };
  for (let a = 0.6; a <= 0.9; a += 0.02) {
    const c = darken(bg, a);
    if (contrast(c, bg) >= 7) return { fg: c, isLight: true };
  }
  return { fg: FALLBACK_DARK, isLight: true };
}

/**
 * QRの点の色を返す。テーマカラーが明るすぎて読み取りにくいときは自動で濃くする。
 */
export function qrColorFor(theme) {
  if (contrast(theme, WHITE) >= QR_MIN) return { color: theme, adjusted: false };
  for (let a = 0.02; a <= 1; a += 0.02) {
    const c = darken(theme, a);
    if (contrast(c, WHITE) >= QR_TARGET) return { color: c, adjusted: true };
  }
  return { color: FALLBACK_DARK, adjusted: true };
}
