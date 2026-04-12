/**
 * クライアントサイド NG ワードフィルター — Moto-Logos
 *
 * 即時フィードバック用の軽量版。
 * サーバー側（Admin API）が最終的なゲートキーパーとなるため、
 * ここでは最も重大な NG ワード（上位30件）のみチェックする。
 */

const NG_WORDS_CLIENT: string[] = [
  // ── 暴力・攻撃 ──
  '死ね',
  'しね',
  '殺す',
  'ころす',

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
  'クズ',
  'くず',

  // ── 差別的表現 ──
  'ガイジ',
  'がいじ',
  'キチガイ',
  'きちがい',

  // ── スパム・広告パターン ──
  'http://',
  'https://',
  'www.',
  '無料で稼',
  '副業',
  '出会い系',
];

/**
 * カタカナをひらがなに変換するヘルパー
 */
function katakanaToHiragana(str: string): string {
  return str.replace(/[\u30A1-\u30F6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * テキストに NG ワードが含まれるかチェックする（クライアント用）。
 *
 * @param text - チェック対象の文字列
 * @returns true なら NG ワードを含む
 */
export function isNgWord(text: string): boolean {
  if (!text || text.trim().length === 0) return false;

  const normalizedText = text.toLowerCase();
  const hiraganaText = katakanaToHiragana(normalizedText);

  for (const word of NG_WORDS_CLIENT) {
    const normalizedWord = word.toLowerCase();
    const hiraganaWord = katakanaToHiragana(normalizedWord);
    const pattern = new RegExp(escapeRegExp(hiraganaWord), 'i');

    if (pattern.test(normalizedText) || pattern.test(hiraganaText)) {
      return true;
    }
  }

  // 連続文字パターン（同一文字が5回以上）
  if (/(.)\1{4,}/u.test(text)) {
    return true;
  }

  return false;
}
