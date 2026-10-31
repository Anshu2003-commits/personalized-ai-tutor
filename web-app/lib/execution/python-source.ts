const PYTHON_INDENT_SIZE = 4;
const ZERO_WIDTH_CHARS = /[\u200B-\u200D\uFEFF]/g;
const PYTHON_COMPILE_ERROR = /\b(?:SyntaxError|IndentationError|TabError)\b/;
const INDENTATION_ERROR = /\b(?:IndentationError|TabError)\b/;

function expandLeadingIndent(line: string): string {
  let column = 0;
  let out = "";
  let i = 0;

  while (i < line.length) {
    const ch = line[i];
    if (ch === " ") {
      out += " ";
      column += 1;
      i += 1;
      continue;
    }
    if (ch === "\u00a0") {
      out += " ";
      column += 1;
      i += 1;
      continue;
    }
    if (ch === "\t") {
      const spaces = PYTHON_INDENT_SIZE - (column % PYTHON_INDENT_SIZE);
      out += " ".repeat(spaces);
      column += spaces;
      i += 1;
      continue;
    }
    break;
  }

  return out + line.slice(i);
}

export function normalizePythonSourceWhitespace(source: string): string {
  return source
    .replace(/\r\n?/g, "\n")
    .replace(ZERO_WIDTH_CHARS, "")
    .split("\n")
    .map(expandLeadingIndent)
    .join("\n");
}

export function isPythonCompileError(stderr: string): boolean {
  return PYTHON_COMPILE_ERROR.test(stderr);
}

export function appendPythonIndentationHint(stderr: string): string {
  if (!INDENTATION_ERROR.test(stderr) || stderr.includes("Onlearn hint:")) {
    return stderr;
  }

  return `${stderr}\n\nOnlearn hint: Python indentation errors usually come from mixed tabs/spaces or pasted invisible whitespace. The editor normalizes indentation before running, but check changed def/class blocks if this still appears.`;
}
