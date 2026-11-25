// サイト全体の設定（ふだんは変更不要です）

// 公開URL。QRコードにはこのURL＋「/trip/番号/」が入ります。
export const SITE_URL = (process.env.SITE_URL || 'https://tabidex.github.io').replace(/\/+$/, '');

// サイト名（トップページやタブの名前に使います）
export const SITE_NAME = 'TABIDEX';

// フォルダの場所
export const TRIPS_DIR = 'trips';
export const ICONS_DIR = 'assets/icons';
export const OUT_DIR = '_site';

// 印刷用PNGの大きさ（ピクセル）
export const QR_PNG_SIZE = 2048;

// トップページの見出し（ふだんの旅 001〜／過去の旅 A01〜）
export const LABEL_MAIN = 'これからの旅';
export const LABEL_ARCHIVE = '過去の旅';
