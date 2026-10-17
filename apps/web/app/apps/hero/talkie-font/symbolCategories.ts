/**
 * Symbol glyph categorization for Mono variant tuning.
 * Restricted to actual symbols and punctuation — letters and digits are
 * never categorized as symbols, so Symbol Tuning leaves alphanumerics
 * untouched. (The user's mental model: "symbols = parens and brackets,
 * not the bowl of an `o`.")
 */

export type SymbolCategory = 'curved' | 'angular' | 'letter' | 'straight';

// Curved symbols: parens, braces, ampersand, at — punctuation with bezier curves
const CURVED = new Set('(){}&@'.split(''));

// Angular symbols: brackets, slashes, angle brackets — punctuation with diagonals
const ANGULAR = new Set('[]/\\<>'.split(''));

// Straight symbols: pipes, dashes, underscores, equals, dots, marks
const STRAIGHT = new Set('|_-=+!:;,.~^#$%*?\'"` '.split(''));

export function getSymbolCategory(char: string): SymbolCategory {
  if (CURVED.has(char)) return 'curved';
  if (ANGULAR.has(char)) return 'angular';
  if (STRAIGHT.has(char)) return 'straight';
  return 'letter';
}

/** Returns true if the character is a symbol (not a plain letter/digit). */
export function isSymbolGlyph(char: string): boolean {
  const cat = getSymbolCategory(char);
  return cat !== 'letter';
}
