"use client";

import { useCallback, useMemo } from "react";
import CodeMirror, { type Extension } from "@uiw/react-codemirror";
import { indentUnit } from "@codemirror/language";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { cpp } from "@codemirror/lang-cpp";
import { go } from "@codemirror/lang-go";
import { EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { normalizePythonSourceWhitespace } from "@/lib/execution/python-source";

type Props = {
  value: string;
  onChange: (v: string) => void;
  fontSize?: number;
  /** Editor language for syntax highlighting; defaults to Python. */
  language?: string;
};

function languageExtension(language: string): Extension {
  switch (language) {
    case "javascript":
      return javascript();
    case "cpp":
    case "c":
      return cpp();
    case "go":
      return go();
    case "python":
    default:
      return python();
  }
}

export default function CodeEditor({
  value,
  onChange,
  fontSize = 13,
  language = "python",
}: Props) {
  const extensions = useMemo(
    () => [
      languageExtension(language),
      EditorState.tabSize.of(4),
      indentUnit.of(language === "python" ? "    " : "\t"),
    ],
    [language],
  );
  const handleChange = useCallback(
    (next: string) => {
      onChange(
        language === "python"
          ? normalizePythonSourceWhitespace(next)
          : next,
      );
    },
    [language, onChange],
  );

  return (
    <CodeMirror
      value={value}
      onChange={handleChange}
      theme={oneDark}
      extensions={extensions}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: true,
        autocompletion: true,
        bracketMatching: true,
        closeBrackets: true,
        indentOnInput: true,
      }}
      className="h-full"
      style={{ fontSize: `${fontSize}px` }}
      height="100%"
    />
  );
}
