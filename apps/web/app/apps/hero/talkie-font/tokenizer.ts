/**
 * Simple TS/JS tokenizer for syntax-highlighted code preview.
 * Regex-based, no parser — good enough for preview rendering.
 */

export type TokenType = 'keyword' | 'string' | 'number' | 'comment' | 'function' | 'punctuation' | 'default';

export interface Token {
  type: TokenType;
  text: string;
}

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'do', 'switch', 'case', 'break', 'continue', 'new', 'this', 'class',
  'extends', 'import', 'export', 'default', 'from', 'as', 'type', 'interface',
  'enum', 'async', 'await', 'yield', 'throw', 'try', 'catch', 'finally',
  'typeof', 'instanceof', 'in', 'of', 'void', 'delete', 'null', 'undefined',
  'true', 'false', 'string', 'number', 'boolean', 'any',
]);

const PUNCTUATION = new Set('(){}[]<>;:,.=+-*/%!&|^~?@#$\\'.split(''));

/** Tokenize a single line of TS/JS code. */
export function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < line.length) {
    // Whitespace
    if (line[i] === ' ' || line[i] === '\t') {
      let j = i;
      while (j < line.length && (line[j] === ' ' || line[j] === '\t')) j++;
      tokens.push({ type: 'default', text: line.slice(i, j) });
      i = j;
      continue;
    }

    // Line comment
    if (line[i] === '/' && line[i + 1] === '/') {
      tokens.push({ type: 'comment', text: line.slice(i) });
      break;
    }

    // Template literal
    if (line[i] === '`') {
      let j = i + 1;
      while (j < line.length && line[j] !== '`') {
        if (line[j] === '\\') j++; // skip escaped
        j++;
      }
      tokens.push({ type: 'string', text: line.slice(i, j + 1) });
      i = j + 1;
      continue;
    }

    // String (double or single quote)
    if (line[i] === '"' || line[i] === "'") {
      const q = line[i];
      let j = i + 1;
      while (j < line.length && line[j] !== q) {
        if (line[j] === '\\') j++;
        j++;
      }
      tokens.push({ type: 'string', text: line.slice(i, j + 1) });
      i = j + 1;
      continue;
    }

    // Number
    if (/[0-9]/.test(line[i]) || (line[i] === '.' && i + 1 < line.length && /[0-9]/.test(line[i + 1]))) {
      let j = i;
      while (j < line.length && /[0-9.xXa-fA-F_]/.test(line[j])) j++;
      tokens.push({ type: 'number', text: line.slice(i, j) });
      i = j;
      continue;
    }

    // Arrow =>
    if (line[i] === '=' && line[i + 1] === '>') {
      tokens.push({ type: 'punctuation', text: '=>' });
      i += 2;
      continue;
    }

    // Identifier or keyword
    if (/[a-zA-Z_$]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j])) j++;
      const word = line.slice(i, j);

      if (KEYWORDS.has(word)) {
        tokens.push({ type: 'keyword', text: word });
      } else {
        // Check if next non-space char is '(' → function name
        let k = j;
        while (k < line.length && line[k] === ' ') k++;
        if (line[k] === '(') {
          tokens.push({ type: 'function', text: word });
        } else {
          tokens.push({ type: 'default', text: word });
        }
      }
      i = j;
      continue;
    }

    // Punctuation
    if (PUNCTUATION.has(line[i])) {
      tokens.push({ type: 'punctuation', text: line[i] });
      i++;
      continue;
    }

    // Fallback: single char
    tokens.push({ type: 'default', text: line[i] });
    i++;
  }

  return tokens;
}

/** Color palette for syntax highlighting on dark canvas. */
export const TOKEN_COLORS: Record<TokenType, string> = {
  keyword: '#C792EA',
  string: '#C3E88D',
  number: '#F78C6C',
  comment: '#5C6370',
  function: '#82AAFF',
  punctuation: '#7A6E5C',
  default: '#F4EFE6',
};
