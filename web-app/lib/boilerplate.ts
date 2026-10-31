import type { FunctionSignature } from "./types";
import { RESULT_MARKER } from "./execution/io";

// Per-language starter-code generation from a question's FunctionSignature.
//
// Two surfaces (see EXECUTION_V2.md):
//   - generateStub + generateDriver - FUNCTION MODE. The editor shows only the
//     function; a hidden driver (prefix + user fn + suffix) reads stdin, calls
//     the function, and prints the return value as canonical JSON after the
//     RESULT_MARKER. The learner never touches I/O. Python + JavaScript.
//   - generateBoilerplate - STDIO MODE full program (the learner reads stdin /
//     writes stdout), used for void/in-place or no-structure problems and for
//     languages without a function-mode driver yet.
//
// The stdin contract (fixed by the test cases) is line-based:
//   - scalar (int/float/double/bool/string/char): one value on its own line
//   - list<T> (1-D):  a line with the length N, then a line of N space-separated values
//   - list<list<T>> (matrix): a line "<rows> <cols>", then <rows> lines of values
//   - ListNode / TreeNode: a count line, then a values line (TreeNode is
//     level-order with -1 = null)

export type BoilerplateLanguage =
  | "python"
  | "javascript"
  | "cpp"
  | "c"
  | "go"
  | "java";

/** Languages we can generate a stub for, in display order. */
export const BOILERPLATE_LANGUAGES: BoilerplateLanguage[] = [
  "python",
  "javascript",
  "cpp",
  "c",
  "go",
  "java",
];

// Full-program generator (stdio mode: the learner reads stdin / writes stdout).
// Function mode uses generateStub + generateDriver instead.
export function generateBoilerplate(
  language: BoilerplateLanguage,
  structure: FunctionSignature | undefined,
): string {
  switch (language) {
    case "python":
      return generatePythonBoilerplate(structure);
    case "javascript":
      return generateJavascriptBoilerplate(structure);
    case "cpp":
      return generateCppBoilerplate(structure);
    case "c":
      return generateCBoilerplate(structure);
    case "go":
      return generateGoBoilerplate(structure);
    case "java":
      return generateJavaBoilerplate(structure);
  }
}

// JavaScript full-program scaffold for stdio mode. Reads all of stdin, leaves
// the parsing + printing to the learner (used only for void / no-structure
// problems; structured DSA problems use function mode).
function generateJavascriptBoilerplate(s: FunctionSignature | undefined): string {
  const name = s?.function_name ?? "solve";
  const args = (s?.input_fields ?? []).map((f) => f.name).join(", ");
  return [
    "const _input = (typeof __stdin__ !== 'undefined' ? __stdin__ : '');",
    "const lines = _input.split('\\n');",
    "",
    `function ${name}(${args}) {`,
    "  // Your code here",
    "}",
    "",
    "// Parse `lines`, call your function, and console.log the result.",
    "",
  ].join("\n");
}

/* ===================================================================== */
/* shared type model                                                     */
/* ===================================================================== */

type ScalarName = "int" | "float" | "double" | "bool" | "string" | "char" | "void";

type ParsedType =
  | { kind: "scalar"; name: ScalarName }
  | { kind: "list"; of: ParsedType }
  | { kind: "node"; name: "ListNode" | "TreeNode" };

// Return type for a signature with no output field (e.g. an in-place `void`).
const VOID_TYPE: ParsedType = { kind: "scalar", name: "void" };

/** Node types referenced anywhere in the signature (for emitting their defs). */
function usedNodeTypes(s: FunctionSignature): Set<"ListNode" | "TreeNode"> {
  const used = new Set<"ListNode" | "TreeNode">();
  const visit = (raw: string) => {
    const p = parseType(raw);
    let cur: ParsedType = p;
    while (cur.kind === "list") cur = cur.of;
    if (cur.kind === "node") used.add(cur.name);
  };
  for (const f of s.input_fields ?? []) visit(f.type);
  for (const f of s.output_fields ?? []) visit(f.type);
  return used;
}

function parseType(raw: string): ParsedType {
  const t = raw.trim();
  if (t.startsWith("list<") && t.endsWith(">")) {
    return { kind: "list", of: parseType(t.slice(5, -1)) };
  }
  if (t === "ListNode" || t === "TreeNode") return { kind: "node", name: t };
  const scalars: ScalarName[] = [
    "int",
    "float",
    "double",
    "bool",
    "string",
    "char",
    "void",
  ];
  return {
    kind: "scalar",
    name: scalars.includes(t as ScalarName) ? (t as ScalarName) : "string",
  };
}

/* ===================================================================== */
/* Python - preserved verbatim (the only runtime-verified path)          */
/* ===================================================================== */

const NO_STRUCTURE_FALLBACK = `# Write your solution below.\n# Use input() to read stdin and print() to write to stdout.\n\n`;

export function generatePythonBoilerplate(
  s: FunctionSignature | undefined,
): string {
  if (!s) return NO_STRUCTURE_FALLBACK;

  const fnName = s.function_name;
  const inputs = s.input_fields ?? [];
  const output = s.output_fields?.[0];

  const lines: string[] = [];
  lines.push(`def ${fnName}(${inputs.map((f) => f.name).join(", ")}):`);
  lines.push(`    # Your code here`);
  lines.push(`    pass`);
  lines.push(``);
  lines.push(`if __name__ == "__main__":`);

  if (inputs.length === 0) {
    lines.push(`    ${fnName}()`);
    return lines.join("\n");
  }

  for (const f of inputs) {
    if (f.type === "list<int>") {
      lines.push(`    _n = int(input())`);
      lines.push(`    ${f.name} = list(map(int, input().split()))`);
    } else if (f.type === "int") {
      lines.push(`    ${f.name} = int(input())`);
    } else {
      lines.push(`    ${f.name} = input()`);
    }
  }

  const args = inputs.map((f) => f.name).join(", ");
  if (output?.type?.startsWith("list<")) {
    lines.push(`    print(*${fnName}(${args}))`);
  } else {
    lines.push(`    print(${fnName}(${args}))`);
  }

  return lines.join("\n");
}

/* ===================================================================== */
/* C++                                                                   */
/* ===================================================================== */

function cppType(t: ParsedType): string {
  if (t.kind === "node") return `${t.name}*`;
  if (t.kind === "list") return `vector<${cppType(t.of)}>`;
  switch (t.name) {
    case "int":
      return "int";
    case "float":
      return "float";
    case "double":
      return "double";
    case "bool":
      return "bool";
    case "string":
      return "string";
    case "char":
      return "char";
    case "void":
      return "void";
  }
}

const CPP_INCLUDES = [
  "#include <cstdlib>",
  "#include <iomanip>",
  "#include <iostream>",
  "#include <queue>",
  "#include <sstream>",
  "#include <string>",
  "#include <vector>",
].join("\n");

function generateCppBoilerplate(s: FunctionSignature | undefined): string {
  if (!s) {
    return `${CPP_INCLUDES}\nusing namespace std;\n\nint main() {\n    // Read from cin, write to cout.\n    return 0;\n}\n`;
  }
  const inputs = s.input_fields ?? [];
  const out = s.output_fields?.[0];
  const ret = out ? parseType(out.type) : VOID_TYPE;

  const params = inputs
    .map((f) => `${cppType(parseType(f.type))} ${f.name}`)
    .join(", ");

  const L: string[] = [];
  L.push(CPP_INCLUDES);
  L.push("using namespace std;");
  L.push("");
  const nodes = usedNodeTypes(s);
  if (nodes.has("ListNode"))
    L.push(
      "struct ListNode { int val; ListNode *next; ListNode(int x) : val(x), next(nullptr) {} };",
      "",
    );
  if (nodes.has("TreeNode"))
    L.push(
      "struct TreeNode { int val; TreeNode *left; TreeNode *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };",
      "",
    );
  L.push(`${cppType(ret)} ${s.function_name}(${params}) {`);
  L.push("    // Your code here");
  if (ret.kind !== "scalar" || ret.name !== "void") L.push("    return {};");
  L.push("}");
  L.push("");
  L.push("int main() {");
  for (const f of inputs) L.push(...cppReader(parseType(f.type), f.name, "    "));
  const call = `${s.function_name}(${inputs.map((f) => f.name).join(", ")})`;
  L.push(...cppPrinter(ret, call, "    "));
  L.push("    return 0;");
  L.push("}");
  return L.join("\n");
}

function cppReader(t: ParsedType, name: string, ind: string): string[] {
  if (t.kind === "scalar" && t.name !== "void") {
    return [`${ind}${cppType(t)} ${name}; cin >> ${name};`];
  }
  // 1-D list: <n> then n values.
  if (t.kind === "list" && t.of.kind === "scalar") {
    return [
      `${ind}int ${name}_n; cin >> ${name}_n;`,
      `${ind}${cppType(t)} ${name}(${name}_n);`,
      `${ind}for (auto& x : ${name}) cin >> x;`,
    ];
  }
  // matrix of scalars: "<rows> <cols>" then rows*cols values.
  if (t.kind === "list" && t.of.kind === "list" && t.of.of.kind === "scalar") {
    const cell = cppType(t.of.of);
    return [
      `${ind}int ${name}_r, ${name}_c; cin >> ${name}_r >> ${name}_c;`,
      `${ind}${cppType(t)} ${name}(${name}_r, vector<${cell}>(${name}_c));`,
      `${ind}for (auto& row : ${name}) for (auto& x : row) cin >> x;`,
    ];
  }
  return [
    `${ind}${cppType(t)} ${name}; // TODO: parse ${name} from stdin`,
  ];
}

function cppPrinter(t: ParsedType, call: string, ind: string): string[] {
  if (t.kind === "scalar" && t.name === "void") return [`${ind}${call};`];
  if (t.kind === "scalar") {
    if (t.name === "bool")
      return [`${ind}cout << (${call} ? "true" : "false") << endl;`];
    return [`${ind}cout << ${call} << endl;`];
  }
  if (t.kind === "list" && t.of.kind === "scalar") {
    return [
      `${ind}auto _res = ${call};`,
      `${ind}for (size_t i = 0; i < _res.size(); i++) cout << _res[i] << " \\n"[i + 1 == _res.size()];`,
    ];
  }
  return [`${ind}auto _res = ${call};`, `${ind}// TODO: print _res`];
}

/* ===================================================================== */
/* C                                                                     */
/* ===================================================================== */

// C has no first-class string/list, so 1-D lists become a pointer + length and
// strings become char buffers. Roughest of the set, but the signature is honest.
function cType(t: ParsedType): string {
  if (t.kind === "node") return `struct ${t.name}*`;
  if (t.kind === "list") return `${cType(t.of)}*`;
  switch (t.name) {
    case "int":
      return "int";
    case "float":
      return "float";
    case "double":
      return "double";
    case "bool":
      return "int";
    case "string":
      return "char*";
    case "char":
      return "char";
    case "void":
      return "void";
  }
}

function generateCBoilerplate(s: FunctionSignature | undefined): string {
  if (!s) {
    return "#include <stdio.h>\n\nint main(void) {\n    // Read from stdin, write to stdout.\n    return 0;\n}\n";
  }
  const inputs = s.input_fields ?? [];
  const out = s.output_fields?.[0];
  const ret = out ? parseType(out.type) : VOID_TYPE;

  // 1-D list params also carry a trailing length argument.
  const params: string[] = [];
  for (const f of inputs) {
    const t = parseType(f.type);
    params.push(`${cType(t)} ${f.name}`);
    if (t.kind === "list") params.push(`int ${f.name}Size`);
  }

  const L: string[] = [];
  L.push("#include <stdio.h>");
  L.push("#include <stdlib.h>");
  L.push("#include <string.h>");
  L.push("");
  const nodes = usedNodeTypes(s);
  if (nodes.has("ListNode"))
    L.push("struct ListNode { int val; struct ListNode* next; };", "");
  if (nodes.has("TreeNode"))
    L.push(
      "struct TreeNode { int val; struct TreeNode *left, *right; };",
      "",
    );
  L.push(`${cType(ret)} ${s.function_name}(${params.join(", ")}) {`);
  L.push("    // Your code here");
  if (!(ret.kind === "scalar" && ret.name === "void")) L.push("    return 0;");
  L.push("}");
  L.push("");
  L.push("int main(void) {");
  L.push("    // TODO: read inputs from stdin, call the function, print the result.");
  L.push("    return 0;");
  L.push("}");
  return L.join("\n");
}

/* ===================================================================== */
/* Go (Yaegi interpreter - needs package main + func main)               */
/* ===================================================================== */

function goType(t: ParsedType): string {
  if (t.kind === "node") return `*${t.name}`;
  if (t.kind === "list") return `[]${goType(t.of)}`;
  switch (t.name) {
    case "int":
      return "int";
    case "float":
      return "float64";
    case "double":
      return "float64";
    case "bool":
      return "bool";
    case "string":
      return "string";
    case "char":
      return "byte";
    case "void":
      return "";
  }
}

function generateGoBoilerplate(s: FunctionSignature | undefined): string {
  if (!s) {
    return 'package main\n\nimport "fmt"\n\nfunc main() {\n\t// Read from stdin, write to stdout.\n\tfmt.Println()\n}\n';
  }
  const inputs = s.input_fields ?? [];
  const out = s.output_fields?.[0];
  const ret = out ? parseType(out.type) : VOID_TYPE;
  const retType = goType(ret);
  const hasRet = retType !== "";

  const params = inputs
    .map((f) => `${f.name} ${goType(parseType(f.type))}`)
    .join(", ");

  const L: string[] = [];
  L.push("package main");
  L.push("");
  // fmt.Scan reads stdin (whitespace/newline separated) - the Yaegi runtime
  // doesn't wire bufio.NewReader(os.Stdin) correctly, but fmt.Scan works.
  L.push('import "fmt"');
  L.push("");
  const nodes = usedNodeTypes(s);
  if (nodes.has("ListNode"))
    L.push("type ListNode struct {", "\tVal  int", "\tNext *ListNode", "}", "");
  if (nodes.has("TreeNode"))
    L.push(
      "type TreeNode struct {",
      "\tVal         int",
      "\tLeft, Right *TreeNode",
      "}",
      "",
    );
  L.push(`func ${s.function_name}(${params})${hasRet ? " " + retType : ""} {`);
  L.push("\t// Your code here");
  if (hasRet) L.push(`\treturn ${goZero(ret)}`);
  L.push("}");
  L.push("");
  L.push("func main() {");
  for (const f of inputs) L.push(...goReader(parseType(f.type), f.name));
  const call = `${s.function_name}(${inputs.map((f) => f.name).join(", ")})`;
  L.push(...goPrinter(ret, call));
  L.push("}");
  return L.join("\n");
}

function goZero(t: ParsedType): string {
  if (t.kind === "list" || t.kind === "node") return "nil";
  switch (t.name) {
    case "bool":
      return "false";
    case "string":
      return '""';
    case "char":
      return "0";
    default:
      return "0";
  }
}

function goReader(t: ParsedType, name: string): string[] {
  if (t.kind === "scalar" && t.name !== "void") {
    return [`\tvar ${name} ${goType(t)}`, `\tfmt.Scan(&${name})`];
  }
  if (t.kind === "list" && t.of.kind === "scalar") {
    return [
      `\tvar ${name}N int`,
      `\tfmt.Scan(&${name}N)`,
      `\t${name} := make(${goType(t)}, ${name}N)`,
      `\tfor i := range ${name} {`,
      `\t\tfmt.Scan(&${name}[i])`,
      `\t}`,
    ];
  }
  if (t.kind === "list" && t.of.kind === "list" && t.of.of.kind === "scalar") {
    const cell = goType(t.of.of);
    return [
      `\tvar ${name}R, ${name}C int`,
      `\tfmt.Scan(&${name}R, &${name}C)`,
      `\t${name} := make(${goType(t)}, ${name}R)`,
      `\tfor i := range ${name} {`,
      `\t\t${name}[i] = make([]${cell}, ${name}C)`,
      `\t\tfor j := range ${name}[i] {`,
      `\t\t\tfmt.Scan(&${name}[i][j])`,
      `\t\t}`,
      `\t}`,
    ];
  }
  return [`\tvar ${name} ${goType(t)} // TODO: parse ${name} from stdin`];
}

function goPrinter(t: ParsedType, call: string): string[] {
  if (t.kind === "scalar" && t.name === "void") return [`\t${call}`];
  if (t.kind === "scalar") return [`\tfmt.Println(${call})`];
  if (t.kind === "list" && t.of.kind === "scalar") {
    return [
      `\tres := ${call}`,
      `\tfor i, v := range res {`,
      `\t\tif i > 0 {`,
      `\t\t\tfmt.Print(" ")`,
      `\t\t}`,
      `\t\tfmt.Print(v)`,
      `\t}`,
      `\tfmt.Println()`,
    ];
  }
  return [`\tres := ${call}`, `\t_ = res // TODO: print res`];
}

/* ===================================================================== */
/* Java (Solution class; gated runtime, stub still useful)               */
/* ===================================================================== */

function javaType(t: ParsedType): string {
  if (t.kind === "node") return t.name;
  if (t.kind === "list") {
    if (t.of.kind === "scalar") return `${javaType(t.of)}[]`;
    return `${javaType(t.of)}[]`;
  }
  switch (t.name) {
    case "int":
      return "int";
    case "float":
      return "float";
    case "double":
      return "double";
    case "bool":
      return "boolean";
    case "string":
      return "String";
    case "char":
      return "char";
    case "void":
      return "void";
  }
}

function generateJavaBoilerplate(s: FunctionSignature | undefined): string {
  if (!s) {
    return "import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // Read from sc, write to System.out.\n    }\n}\n";
  }
  const inputs = s.input_fields ?? [];
  const out = s.output_fields?.[0];
  const ret = out ? parseType(out.type) : VOID_TYPE;

  const params = inputs
    .map((f) => `${javaType(parseType(f.type))} ${f.name}`)
    .join(", ");

  const L: string[] = [];
  L.push("import java.util.*;");
  L.push("");
  L.push("public class Main {");
  L.push(`    static ${javaType(ret)} ${s.function_name}(${params}) {`);
  L.push("        // Your code here");
  if (!(ret.kind === "scalar" && ret.name === "void"))
    L.push(`        return ${javaZero(ret)};`);
  L.push("    }");
  L.push("");
  L.push("    public static void main(String[] args) {");
  L.push("        Scanner sc = new Scanner(System.in);");
  for (const f of inputs) L.push(...javaReader(parseType(f.type), f.name));
  const call = `${s.function_name}(${inputs.map((f) => f.name).join(", ")})`;
  L.push(...javaPrinter(ret, call));
  L.push("    }");
  L.push("}");
  const nodes = usedNodeTypes(s);
  if (nodes.has("ListNode"))
    L.push(
      "",
      "class ListNode {",
      "    int val;",
      "    ListNode next;",
      "    ListNode(int x) { val = x; }",
      "}",
    );
  if (nodes.has("TreeNode"))
    L.push(
      "",
      "class TreeNode {",
      "    int val;",
      "    TreeNode left, right;",
      "    TreeNode(int x) { val = x; }",
      "}",
    );
  return L.join("\n");
}

function javaZero(t: ParsedType): string {
  if (t.kind === "list" || t.kind === "node") return "null";
  switch (t.name) {
    case "bool":
      return "false";
    case "string":
      return '""';
    case "char":
      return "'\\0'";
    default:
      return "0";
  }
}

function javaScalarRead(name: ScalarName): string {
  switch (name) {
    case "int":
      return "sc.nextInt()";
    case "float":
      return "sc.nextFloat()";
    case "double":
      return "sc.nextDouble()";
    case "bool":
      return "sc.nextBoolean()";
    case "string":
      return "sc.next()";
    case "char":
      return "sc.next().charAt(0)";
    case "void":
      return "";
  }
}

function javaReader(t: ParsedType, name: string): string[] {
  if (t.kind === "scalar" && t.name !== "void") {
    return [`        ${javaType(t)} ${name} = ${javaScalarRead(t.name)};`];
  }
  if (t.kind === "list" && t.of.kind === "scalar") {
    const leaf = t.of.name;
    return [
      `        int ${name}N = sc.nextInt();`,
      `        ${javaType(t)} ${name} = new ${javaType(t.of)}[${name}N];`,
      `        for (int i = 0; i < ${name}N; i++) ${name}[i] = ${javaScalarRead(leaf)};`,
    ];
  }
  return [`        ${javaType(t)} ${name} = ${javaZero(t)}; // TODO: parse ${name}`];
}

function javaPrinter(t: ParsedType, call: string): string[] {
  if (t.kind === "scalar" && t.name === "void") return [`        ${call};`];
  if (t.kind === "scalar") return [`        System.out.println(${call});`];
  if (t.kind === "list" && t.of.kind === "scalar") {
    return [
      `        ${javaType(t)} _res = ${call};`,
      `        StringBuilder _sb = new StringBuilder();`,
      `        for (int i = 0; i < _res.length; i++) {`,
      `            if (i > 0) _sb.append(' ');`,
      `            _sb.append(_res[i]);`,
      `        }`,
      `        System.out.println(_sb.toString());`,
    ];
  }
  return [`        var _res = ${call};`, `        // TODO: print _res`];
}

/* ===================================================================== */
/* Function mode (LeetCode-style): the editor shows ONLY the function;    */
/* a hidden driver (prefix + user fn + suffix) reads stdin, calls it, and */
/* prints the return value as canonical JSON after RESULT_MARKER. Output  */
/* formatting and I/O parsing are entirely the driver's job so the learner */
/* focuses on the logic. Implemented for the runtimes we verify end-to-end */
/* here (Python via python3, JavaScript via node); see EXECUTION_V2.md.    */
/* ===================================================================== */

export type Driver = { prefix: string; suffix: string };

/** Languages that support function mode (hidden driver). */
export function supportsFunctionMode(language: BoilerplateLanguage): boolean {
  return (
    language === "python" || language === "javascript" || language === "cpp"
  );
}

function nodeShapeComment(s: FunctionSignature, line: (t: string) => string): string[] {
  const nodes = usedNodeTypes(s);
  const out: string[] = [];
  if (nodes.has("ListNode")) out.push(line("ListNode: .val (int), .next (ListNode | null)"));
  if (nodes.has("TreeNode"))
    out.push(line("TreeNode: .val (int), .left / .right (TreeNode | null)"));
  return out;
}

/** Editor content in function mode: just the signature + body (+ node hint). */
export function generateStub(
  language: BoilerplateLanguage,
  s: FunctionSignature | undefined,
): string {
  if (!s) return language === "javascript" ? "function solve() {\n  // Your code here\n}\n" : "def solve():\n    # Your code here\n    pass\n";
  const args = (s.input_fields ?? []).map((f) => f.name).join(", ");
  if (language === "cpp") {
    const ret = s.output_fields?.[0] ? parseType(s.output_fields[0].type) : VOID_TYPE;
    const params = (s.input_fields ?? [])
      .map((f) => `${cppType(parseType(f.type))} ${f.name}`)
      .join(", ");
    return [
      ...nodeShapeComment(s, (t) => `// ${t}`),
      `${cppType(ret)} ${s.function_name}(${params}) {`,
      "    // Your code here",
      "    return {};",
      "}",
      "",
    ].join("\n");
  }
  if (language === "javascript") {
    return [
      ...nodeShapeComment(s, (t) => `// ${t}`),
      `function ${s.function_name}(${args}) {`,
      "  // Your code here",
      "}",
      "",
    ].join("\n");
  }
  // python (default)
  return [
    ...nodeShapeComment(s, (t) => `# ${t}`),
    `def ${s.function_name}(${args}):`,
    "    # Your code here",
    "    pass",
    "",
  ].join("\n");
}

/** The hidden driver wrapped around the learner's function. */
export function generateDriver(
  language: BoilerplateLanguage,
  s: FunctionSignature,
): Driver {
  if (language === "cpp") return cppDriver(s);
  if (language === "javascript") return jsDriver(s);
  return pythonDriver(s);
}

// ---- Python driver -------------------------------------------------------

function pyReader(type: string, name: string): string[] {
  const t = parseType(type);
  if (t.kind === "node") {
    if (t.name === "ListNode")
      return [`    _line(); ${name} = _build_list(_ints_of(_line()))`];
    return [`    _line(); ${name} = _build_tree(_line().split())`];
  }
  if (t.kind === "list") {
    if (t.of.kind === "list") {
      const cell = t.of.of.kind === "scalar" ? t.of.of.name : "string";
      const rowExpr =
        cell === "int"
          ? "_ints_of(_line())"
          : cell === "float" || cell === "double"
            ? "_floats_of(_line())"
            : "_line().split()";
      return [
        `    _r = int(_line().split()[0])`,
        `    ${name} = [${rowExpr} for _ in range(_r)]`,
      ];
    }
    const cell = t.of.kind === "scalar" ? t.of.name : "string";
    if (cell === "int") return [`    _line(); ${name} = _ints_of(_line())`];
    if (cell === "float" || cell === "double")
      return [`    _line(); ${name} = _floats_of(_line())`];
    if (cell === "bool")
      return [`    _line(); ${name} = [x.lower() in ("true","1","yes") for x in _line().split()]`];
    return [`    _line(); ${name} = _line().split()`];
  }
  switch (t.name) {
    case "int":
      return [`    ${name} = int(_line())`];
    case "float":
    case "double":
      return [`    ${name} = float(_line())`];
    case "bool":
      return [`    ${name} = _line().strip().lower() in ("true","1","yes")`];
    case "char":
      return [`    ${name} = _line()[:1]`];
    default:
      return [`    ${name} = _line()`];
  }
}

function pythonDriver(s: FunctionSignature): Driver {
  const nodes = usedNodeTypes(s);
  const inputs = s.input_fields ?? [];
  const ret = s.output_fields?.[0] ? parseType(s.output_fields[0].type) : VOID_TYPE;

  const pre: string[] = ["import sys, json", ""];
  if (nodes.has("ListNode"))
    pre.push(
      "class ListNode:",
      "    def __init__(self, val=0, next=None):",
      "        self.val = val; self.next = next",
    );
  if (nodes.has("TreeNode"))
    pre.push(
      "class TreeNode:",
      "    def __init__(self, val=0, left=None, right=None):",
      "        self.val = val; self.left = left; self.right = right",
    );
  pre.push(
    "_lines = sys.stdin.read().split('\\n')",
    "_li = 0",
    "def _line():",
    "    global _li",
    "    v = _lines[_li] if _li < len(_lines) else ''",
    "    _li += 1",
    "    return v",
    // Tolerant numeric parsing: drop non-numeric tokens (e.g. a stray 'null' in
    // a list typed int) rather than crash the learner's run.
    "def _ints_of(line):",
    "    out = []",
    "    for x in line.split():",
    "        try: out.append(int(x))",
    "        except Exception: pass",
    "    return out",
    "def _floats_of(line):",
    "    out = []",
    "    for x in line.split():",
    "        try: out.append(float(x))",
    "        except Exception: pass",
    "    return out",
  );
  if (nodes.has("ListNode"))
    pre.push(
      "def _build_list(vals):",
      "    head = None",
      "    for v in reversed(vals): head = ListNode(v, head)",
      "    return head",
      "def _ser_list(node):",
      "    out = []",
      "    while node: out.append(node.val); node = node.next",
      "    return out",
    );
  if (nodes.has("TreeNode"))
    pre.push(
      "from collections import deque",
      "def _build_tree(toks):",
      "    vals = [None if t in ('-1','null','#') else int(t) for t in toks]",
      "    if not vals or vals[0] is None: return None",
      "    root = TreeNode(vals[0]); q = deque([root]); i = 1",
      "    while q and i < len(vals):",
      "        node = q.popleft()",
      "        if i < len(vals) and vals[i] is not None: node.left = TreeNode(vals[i]); q.append(node.left)",
      "        i += 1",
      "        if i < len(vals) and vals[i] is not None: node.right = TreeNode(vals[i]); q.append(node.right)",
      "        i += 1",
      "    return root",
      "def _ser_tree(root):",
      "    out = []; q = deque([root])",
      "    while q:",
      "        node = q.popleft()",
      "        if node is None: out.append(None); continue",
      "        out.append(node.val); q.append(node.left); q.append(node.right)",
      "    while out and out[-1] is None: out.pop()",
      "    return out",
    );

  const suf: string[] = [];
  for (const f of inputs) suf.push(...pyReader(f.type, f.name));
  const call = `${s.function_name}(${inputs.map((f) => f.name).join(", ")})`;
  let ser = "_res";
  if (ret.kind === "node") ser = ret.name === "ListNode" ? "_ser_list(_res)" : "_ser_tree(_res)";
  suf.push(`    _res = ${call}`, `    print(${JSON.stringify(RESULT_MARKER)} + json.dumps(${ser}))`);

  // The reads/call live under `if True:` so the generated indentation is valid.
  return { prefix: pre.join("\n") + "\n", suffix: "if True:\n" + suf.join("\n") + "\n" };
}

// ---- JavaScript driver ---------------------------------------------------

function jsReader(type: string, name: string): string[] {
  const t = parseType(type);
  if (t.kind === "node") {
    if (t.name === "ListNode") return [`  _line(); const ${name} = _buildList(_nums());`];
    return [`  _line(); const ${name} = _buildTree(_line().trim().split(/\\s+/).filter(Boolean));`];
  }
  if (t.kind === "list") {
    if (t.of.kind === "list") {
      const cell = t.of.of.kind === "scalar" ? t.of.of.name : "string";
      const numeric = cell === "int" || cell === "float" || cell === "double";
      const rowExpr = numeric
        ? "_numList(_line())"
        : "_line().trim().split(/\\s+/).filter(Boolean)";
      return [
        `  const _r = parseInt(_line().trim().split(/\\s+/)[0], 10) || 0;`,
        `  const ${name} = [];`,
        `  for (let _i = 0; _i < _r; _i++) ${name}.push(${rowExpr});`,
      ];
    }
    const cell = t.of.kind === "scalar" ? t.of.name : "string";
    if (cell === "int" || cell === "float" || cell === "double")
      return [`  _line(); const ${name} = _nums();`];
    if (cell === "bool")
      return [`  _line(); const ${name} = _line().trim().split(/\\s+/).filter(Boolean).map(x => /^(true|1|yes)$/i.test(x));`];
    return [`  _line(); const ${name} = _line().trim().split(/\\s+/).filter(Boolean);`];
  }
  switch (t.name) {
    case "int":
      return [`  const ${name} = parseInt(_line(), 10);`];
    case "float":
    case "double":
      return [`  const ${name} = parseFloat(_line());`];
    case "bool":
      return [`  const ${name} = /^(true|1|yes)$/i.test(_line().trim());`];
    case "char":
      return [`  const ${name} = _line().charAt(0);`];
    default:
      return [`  const ${name} = _line();`];
  }
}

function jsDriver(s: FunctionSignature): Driver {
  const nodes = usedNodeTypes(s);
  const inputs = s.input_fields ?? [];
  const ret = s.output_fields?.[0] ? parseType(s.output_fields[0].type) : VOID_TYPE;

  const pre: string[] = [];
  if (nodes.has("ListNode"))
    pre.push(
      "function ListNode(val, next) { this.val = val === undefined ? 0 : val; this.next = next === undefined ? null : next; }",
    );
  if (nodes.has("TreeNode"))
    pre.push(
      "function TreeNode(val, left, right) { this.val = val === undefined ? 0 : val; this.left = left === undefined ? null : left; this.right = right === undefined ? null : right; }",
    );
  pre.push(
    "const _lines = (typeof __stdin__ !== 'undefined' ? __stdin__ : '').split('\\n');",
    "let _li = 0;",
    "const _line = () => (_li < _lines.length ? _lines[_li++] : '');",
    // Tolerant: drop non-numeric tokens (e.g. a stray 'null') instead of NaN.
    "const _numList = (s) => s.trim().split(/\\s+/).map(Number).filter((n) => !Number.isNaN(n));",
    "const _nums = () => _numList(_line());",
  );
  if (nodes.has("ListNode"))
    pre.push(
      "const _buildList = (vals) => { let h = null; for (let i = vals.length - 1; i >= 0; i--) h = new ListNode(vals[i], h); return h; };",
      "const _serList = (node) => { const o = []; while (node) { o.push(node.val); node = node.next; } return o; };",
    );
  if (nodes.has("TreeNode"))
    pre.push(
      "const _buildTree = (toks) => { const v = toks.map(t => (t === '-1' || t === 'null' || t === '#') ? null : Number(t)); if (!v.length || v[0] === null) return null; const root = new TreeNode(v[0]); const q = [root]; let i = 1; while (q.length && i < v.length) { const n = q.shift(); if (i < v.length && v[i] !== null) { n.left = new TreeNode(v[i]); q.push(n.left); } i++; if (i < v.length && v[i] !== null) { n.right = new TreeNode(v[i]); q.push(n.right); } i++; } return root; };",
      "const _serTree = (root) => { const o = []; const q = [root]; while (q.length) { const n = q.shift(); if (n === null) { o.push(null); continue; } o.push(n.val); q.push(n.left); q.push(n.right); } while (o.length && o[o.length - 1] === null) o.pop(); return o; };",
    );

  const suf: string[] = ["(function () {"];
  for (const f of inputs) suf.push(...jsReader(f.type, f.name));
  const call = `${s.function_name}(${inputs.map((f) => f.name).join(", ")})`;
  let ser = "_res";
  if (ret.kind === "node") ser = ret.name === "ListNode" ? "_serList(_res)" : "_serTree(_res)";
  suf.push(
    `  const _res = ${call};`,
    `  console.log(${JSON.stringify(RESULT_MARKER)} + JSON.stringify(${ser}));`,
    "})();",
  );

  return { prefix: pre.join("\n") + "\n", suffix: suf.join("\n") + "\n" };
}

// ---- C++ driver (single-threaded clang in the browser; verified with g++) ---

// Signature-independent helpers: line reader, tolerant tokenizers, JSON string
// escaper, and `_ser` overloads for scalars/strings/vectors. (vector<bool> has
// its own overload because its proxy element doesn't bind the generic one.)
const CPP_HELPERS = `static vector<string> _lines;
static size_t _li = 0;
static string _line() { return _li < _lines.size() ? _lines[_li++] : string(); }
static vector<int> _ints(const string& s) { vector<int> o; stringstream ss(s); string t; while (ss >> t) { char* e = nullptr; long v = strtol(t.c_str(), &e, 10); if (e && *e == 0) o.push_back((int)v); } return o; }
static vector<double> _dbls(const string& s) { vector<double> o; stringstream ss(s); string t; while (ss >> t) { char* e = nullptr; double v = strtod(t.c_str(), &e); if (e && *e == 0) o.push_back(v); } return o; }
static vector<string> _words(const string& s) { vector<string> o; stringstream ss(s); string t; while (ss >> t) o.push_back(t); return o; }
static string _esc(const string& s) {
  string r = "\\"";
  for (char c : s) {
    if (c == '\\\\') r += R"(\\\\)";
    else if (c == '"') r += R"(\\")";
    else if (c == '\\n') r += R"(\\n)";
    else if (c == '\\t') r += R"(\\t)";
    else if (c == '\\r') r += R"(\\r)";
    else r += c;
  }
  r += "\\"";
  return r;
}
static void _ser(ostream& o, bool x) { o << (x ? "true" : "false"); }
static void _ser(ostream& o, int x) { o << x; }
static void _ser(ostream& o, double x) { ostringstream t; t << setprecision(12) << x; o << t.str(); }
static void _ser(ostream& o, const string& s) { o << _esc(s); }
static void _ser(ostream& o, char c) { o << _esc(string(1, c)); }
template <class T> static void _ser(ostream& o, const vector<T>& v) { o << '['; for (size_t i = 0; i < v.size(); i++) { if (i) o << ", "; _ser(o, v[i]); } o << ']'; }
static void _ser(ostream& o, const vector<bool>& v) { o << '['; for (size_t i = 0; i < v.size(); i++) { if (i) o << ", "; o << (v[i] ? "true" : "false"); } o << ']'; }`;

const CPP_LIST_HELPERS = `static ListNode* _buildList(const vector<int>& v) { ListNode* h = nullptr; for (int i = (int)v.size() - 1; i >= 0; i--) { ListNode* n = new ListNode(v[i]); n->next = h; h = n; } return h; }
static void _ser(ostream& o, ListNode* n) { vector<int> a; while (n) { a.push_back(n->val); n = n->next; } _ser(o, a); }`;

const CPP_TREE_HELPERS = `static TreeNode* _buildTree(const vector<string>& t) { if (t.empty() || t[0] == "-1" || t[0] == "null" || t[0] == "#") return nullptr; TreeNode* root = new TreeNode(atoi(t[0].c_str())); queue<TreeNode*> q; q.push(root); size_t i = 1; while (!q.empty() && i < t.size()) { TreeNode* n = q.front(); q.pop(); if (i < t.size()) { string x = t[i++]; if (x != "-1" && x != "null" && x != "#") { n->left = new TreeNode(atoi(x.c_str())); q.push(n->left); } } if (i < t.size()) { string x = t[i++]; if (x != "-1" && x != "null" && x != "#") { n->right = new TreeNode(atoi(x.c_str())); q.push(n->right); } } } return root; }
static void _ser(ostream& o, TreeNode* r) { vector<string> out; queue<TreeNode*> q; q.push(r); while (!q.empty()) { TreeNode* n = q.front(); q.pop(); if (!n) { out.push_back("null"); continue; } out.push_back(to_string(n->val)); q.push(n->left); q.push(n->right); } while (!out.empty() && out.back() == "null") out.pop_back(); o << '['; for (size_t i = 0; i < out.size(); i++) { if (i) o << ", "; o << out[i]; } o << ']'; }`;

function cppFnReader(type: string, name: string): string[] {
  const ind = "  ";
  const t = parseType(type);
  if (t.kind === "node") {
    if (t.name === "ListNode")
      return [`${ind}_line(); ListNode* ${name} = _buildList(_ints(_line()));`];
    return [`${ind}_line(); TreeNode* ${name} = _buildTree(_words(_line()));`];
  }
  if (t.kind === "list") {
    if (t.of.kind === "list" && t.of.of.kind === "scalar") {
      const cell = t.of.of.name;
      const rowFn = cell === "int" ? "_ints" : cell === "float" || cell === "double" ? "_dbls" : "_words";
      return [
        `${ind}int _r_${name} = atoi(_line().c_str());`,
        `${ind}${cppType(t)} ${name};`,
        `${ind}for (int _i = 0; _i < _r_${name}; _i++) ${name}.push_back(${rowFn}(_line()));`,
      ];
    }
    if (t.of.kind === "scalar") {
      const cell = t.of.name;
      if (cell === "int") return [`${ind}_line(); ${cppType(t)} ${name} = _ints(_line());`];
      if (cell === "float" || cell === "double")
        return [`${ind}_line(); ${cppType(t)} ${name} = _dbls(_line());`];
      if (cell === "string") return [`${ind}_line(); ${cppType(t)} ${name} = _words(_line());`];
    }
    return [`${ind}${cppType(t)} ${name}; // TODO: parse ${name}`];
  }
  switch (t.name) {
    case "int":
      return [`${ind}int ${name} = atoi(_line().c_str());`];
    case "float":
      return [`${ind}float ${name} = (float)atof(_line().c_str());`];
    case "double":
      return [`${ind}double ${name} = atof(_line().c_str());`];
    case "bool":
      return [`${ind}string _b_${name} = _line(); bool ${name} = (_b_${name} == "true" || _b_${name} == "1");`];
    case "char":
      return [`${ind}string _c_${name} = _line(); char ${name} = _c_${name}.empty() ? 0 : _c_${name}[0];`];
    default:
      return [`${ind}string ${name} = _line();`];
  }
}

function cppDriver(s: FunctionSignature): Driver {
  const nodes = usedNodeTypes(s);
  const inputs = s.input_fields ?? [];

  const pre: string[] = [CPP_INCLUDES, "using namespace std;", ""];
  if (nodes.has("ListNode"))
    pre.push(
      "struct ListNode { int val; ListNode *next; ListNode(int x) : val(x), next(nullptr) {} };",
    );
  if (nodes.has("TreeNode"))
    pre.push(
      "struct TreeNode { int val; TreeNode *left; TreeNode *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };",
    );
  pre.push(CPP_HELPERS);
  if (nodes.has("ListNode")) pre.push(CPP_LIST_HELPERS);
  if (nodes.has("TreeNode")) pre.push(CPP_TREE_HELPERS);

  const suf: string[] = [
    "int main() {",
    "  { string _l; while (getline(cin, _l)) _lines.push_back(_l); }",
  ];
  for (const f of inputs) suf.push(...cppFnReader(f.type, f.name));
  const call = `${s.function_name}(${inputs.map((f) => f.name).join(", ")})`;
  suf.push(
    `  auto _res = ${call};`,
    `  cout << ${JSON.stringify(RESULT_MARKER)}; _ser(cout, _res); cout << "\\n";`,
    "  return 0;",
    "}",
  );

  return { prefix: pre.join("\n") + "\n", suffix: suf.join("\n") + "\n" };
}
