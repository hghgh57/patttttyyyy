// Only pass through strings Discord will actually accept as a button/select
// emoji — a custom emoji reference like <:name:1234567890> or an actual
// emoji character. Anything else (plain text someone typed by mistake, for
// example) is dropped instead of throwing and crashing the whole panel.
function sanitizeEmoji(value) {
  if (!value) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;

  if (/^<a?:\w+:\d+>$/.test(trimmed)) return trimmed;
  if (/^(\p{Extended_Pictographic}|\u200d|\ufe0f)+$/u.test(trimmed)) return trimmed;

  return undefined;
}

module.exports = { sanitizeEmoji };
