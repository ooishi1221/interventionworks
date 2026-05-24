/**
 * NG Word Filter — Moto-Logos Admin
 *
 * サーバーサイドの NGワードフィルター。
 * スポット名やレビューコメントに不適切な語句が含まれていないかチェックする。
 */

/** NGワードリスト（パターン含む） */
export const NG_WORDS: string[] = [
  // ── 暴力・攻撃 ──
  '死ね',
  'しね',
  '殺す',
  'ころす',
  '殺してやる',
  '潰す',
  'つぶす',

  // ── 侮辱・罵倒 ──
  'バカ',
  'ばか',
  'アホ',
  'あほ',
  'クソ',
  'くそ',
  'うざい',
  'きもい',
  'キモい',
  'ゴミ',
  'ごみ',
  'カス',
  'かす',
  'ボケ',
  'ぼけ',
  'クズ',
  'くず',
  'ブス',
  'ぶす',
  'デブ',
  'でぶ',
  'チビ',
  'ちび',

  // ── 差別的表現 ──
  '障害者',
  'ガイジ',
  'がいじ',
  '池沼',
  'キチガイ',
  'きちがい',
  '土人',
  'チョン',

  // ── 性的表現 ──
  'セックス',
  'エロ',
  'えろ',
  'ポルノ',

  // ── スパム・広告パターン ──
  'http://',
  'https://',
  'www.',
  '.com/',
  '.jp/',
  '.net/',
  '無料で稼',
  '副業',
  '儲かる',
  '稼げる',
  '出会い系',
  'LINE@',
  'line@',

  // ── 連続文字スパム（5文字以上同一文字の繰り返し） ──
  'ああああああ',
  'wwwww',
  '！！！！！',
];

/**
 * NGワードに対する正規表現パターンを生成する。
 * 通常の文字列はエスケープしてそのまま部分一致で検索。
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * テキスト内の NG ワードをチェックする。
 *
 * @param text - チェック対象の文字列
 * @param wordList - NG ワードリスト（省略時はデフォルトリストを使用）
 * @returns blocked が true の場合、matchedWord に検出された NG ワードを返す
 */
export function checkNgWords(
  text: string,
  wordList: string[] = NG_WORDS,
): { blocked: boolean; matchedWord?: string } {
  if (!text || text.trim().length === 0) {
    return { blocked: false };
  }

  // ひらがな・カタカナ統一のため、カタカナをひらがなに変換して両方チェック
  const normalizedText = text.toLowerCase();
  const hiraganaText = katakanaToHiragana(normalizedText);

  for (const word of wordList) {
    const normalizedWord = word.toLowerCase();
    const hiraganaWord = katakanaToHiragana(normalizedWord);
    const pattern = new RegExp(escapeRegExp(hiraganaWord), 'i');

    // 元テキストとひらがな変換テキストの両方でチェック
    if (pattern.test(normalizedText) || pattern.test(hiraganaText)) {
      return { blocked: true, matchedWord: word };
    }
  }

  // 追加: 連続文字パターン（同一文字が5回以上繰り返し）
  if (/(.)\1{4,}/u.test(text)) {
    return { blocked: true, matchedWord: '(連続文字スパム)' };
  }

  return { blocked: false };
}

/**
 * カタカナをひらがなに変換するヘルパー。
 * Unicode のカタカナ範囲 (U+30A1..U+30F6) を対応するひらがな (U+3041..U+3096) にシフトする。
 */
function katakanaToHiragana(str: string): string {
  return str.replace(/[\u30A1-\u30F6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}
