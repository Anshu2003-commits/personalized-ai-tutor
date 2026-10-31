"use client";

import { ArrowUp, Sparkles, Square } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "@/components/markdown";
import { Button, buttonVariants } from "@/components/ui/button";
import { type ChatEvent, StreamHttpError, streamChatEvents } from "@/lib/sse";

type Msg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools: { name: string }[];
  status?: "streaming" | "done" | "error" | "stopped";
  statusText?: string;
  error?: string;
  errorCode?: "auth_required";
  suggestions?: string[];
};

type Props = {
  questionId: string;
  module: "dsa" | "ds";
  lesson?: {
    courseSlug: string;
    moduleSlug: string;
    title: string;
  };
  getEditorSnapshot?: () => {
    questionId: string;
    language: string;
    code: string;
    starterCode: string;
  } | null;
};

function newSessionId() {
  return "s_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function newMessageId() {
  return "m_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const DEFAULT_SUGGESTIONS = [
  "Explain with example",
  "Give me a hint",
  "Check my idea",
];

const STARTERS = [
  "Give me a hint",
  "Explain the approach",
  "What's the brute force?",
];

const GENERIC_BACKEND_THINKING = "Reading the question...";

const THINKING_MESSAGES = [
  "Reading the problem…",
  "Mapping the key idea…",
  "Tracing the sample cases…",
  "Checking the current context…",
  "Finding the smallest useful hint…",
  "Connecting this to prior concepts…",
  "Thinking through edge cases…",
  "Preparing a guided next step…",
];

const THINKING_GLYPHS = ["·", "✢", "*", "✶", "✻", "✽"];
const REDUCED_MOTION_GLYPH = "•";
const SHOW_THINKING_ELAPSED_AFTER_MS = 2500;

function pickThinkingMessage() {
  return THINKING_MESSAGES[Math.floor(Math.random() * THINKING_MESSAGES.length)];
}

function formatElapsed(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function currentEditorSnapshotPayload(
  snapshot:
    | {
        questionId: string;
        language: string;
        code: string;
        starterCode: string;
      }
    | null
    | undefined,
  questionId: string,
) {
  if (!snapshot?.code.trim()) return {};
  if (snapshot.questionId !== questionId) return {};
  return {
    current_code: snapshot.code,
    current_language: snapshot.language,
    current_starter_code: snapshot.starterCode,
  };
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = (event: MediaQueryListEvent) =>
      setPrefersReducedMotion(event.matches);
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  return prefersReducedMotion;
}

function cleanAssistantText(text: string) {
  return text.replace(/<suggestions>[\s\S]*?<\/suggestions>/g, "").trim();
}

// Streaming-safe variant: also hides a `<suggestions>` block (or a partial
// opening tag) before it finishes arriving, so the raw markup never flashes.
function cleanStreamingText(text: string) {
  const t = text.replace(/<suggestions>[\s\S]*?<\/suggestions>/g, "");
  const open = t.indexOf("<suggestions");
  if (open !== -1) return t.slice(0, open).trimEnd();
  const lt = t.lastIndexOf("<");
  if (lt !== -1 && "<suggestions>".startsWith(t.slice(lt))) {
    return t.slice(0, lt).trimEnd();
  }
  return t;
}

function TutorThinkingIndicator({ text }: { text: string }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);

  useEffect(() => {
    const intervalMs = prefersReducedMotion ? 1000 : 120;
    const interval = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(interval);
  }, [prefersReducedMotion]);

  const elapsedMs = now - startedAt;
  const glyph = prefersReducedMotion
    ? REDUCED_MOTION_GLYPH
    : THINKING_GLYPHS[Math.floor(elapsedMs / 120) % THINKING_GLYPHS.length];
  const characters = Array.from(text);
  const shimmerIndex =
    Math.floor(elapsedMs / 120) % (characters.length + 8) - 4;

  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex min-h-6 max-w-full items-center gap-2 text-muted-foreground"
    >
      <span className="sr-only">{text}</span>
      <span
        className="inline-flex min-w-0 items-center gap-2"
        aria-hidden="true"
      >
        <span className="grid h-4 w-4 shrink-0 place-items-center font-mono text-[13px] leading-none text-foreground/80">
          {glyph}
        </span>
        <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-xs font-medium">
          <span className="whitespace-pre">
            {prefersReducedMotion
              ? text
              : characters.map((character, index) => {
                  const distance = Math.abs(index - shimmerIndex);
                  const className =
                    distance === 0
                      ? "text-foreground"
                      : distance === 1
                        ? "text-muted-foreground"
                        : "text-muted-foreground/65";

                  return (
                    <span
                      key={`${character}-${index}`}
                      className={className}
                    >
                      {character}
                    </span>
                  );
                })}
          </span>
          {elapsedMs >= SHOW_THINKING_ELAPSED_AFTER_MS && (
            <span className="font-mono text-[11px] text-muted-foreground/55">
              {formatElapsed(elapsedMs)}
            </span>
          )}
        </span>
      </span>
    </div>
  );
}

export default function ChatPanel({ questionId, module, lesson, getEditorSnapshot }: Props) {
  const [sessionId] = useState(() => newSessionId());

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [creditsExhausted, setCreditsExhausted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    fetch("/api/user/credits")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.credits === "number") setCredits(d.credits);
        if (d?.isPaid) setCredits(null);
      })
      .catch(() => {});
  }, []);

  function growTextarea() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }

  const markLastAssistantError = useCallback((message: string, errorCode?: Msg["errorCode"]) => {
    setMessages((m) => {
      const next = m.slice();
      const last = next[next.length - 1];
      if (last?.role === "assistant") {
        next[next.length - 1] = {
          ...last,
          status: "error",
          statusText: undefined,
          error: message,
          errorCode,
        };
      }
      return next;
    });
  }, []);

  const applyEvent = useCallback((e: ChatEvent) => {
    if (e.type === "token" && typeof e.content === "string") {
      setMessages((m) => {
        const next = m.slice();
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          next[next.length - 1] = {
            ...last,
            text: last.text + e.content,
            status: "streaming",
            statusText: undefined,
          };
        }
        return next;
      });
    } else if (e.type === "thinking" && typeof e.content === "string") {
      const content = e.content.trim();
      setMessages((m) => {
        const next = m.slice();
        const last = next[next.length - 1];
        if (last?.role === "assistant" && !last.text) {
          next[next.length - 1] = {
            ...last,
            status: "streaming",
            statusText:
              content === GENERIC_BACKEND_THINKING
                ? (last.statusText ?? pickThinkingMessage())
                : content,
          };
        }
        return next;
      });
    } else if (e.type === "tool_start" && typeof e.name === "string") {
      setMessages((m) => {
        const next = m.slice();
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          next[next.length - 1] = {
            ...last,
            tools: [...last.tools, { name: e.name as string }],
          };
        }
        return next;
      });
    } else if (e.type === "credits" && typeof e.remaining === "number") {
      setCredits(e.remaining);
      if (!e.isPaid && e.remaining <= 0) setCreditsExhausted(true);
    } else if (e.type === "error" && typeof e.message === "string") {
      markLastAssistantError(e.message);
    } else if (e.type === "done") {
      setMessages((m) => {
        const next = m.slice();
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          const text = cleanAssistantText(last.text);
          next[next.length - 1] = {
            ...last,
            text,
            status: "done",
            statusText: undefined,
            suggestions: text ? DEFAULT_SUGGESTIONS : [],
          };
        }
        return next;
      });
    }
  }, [markLastAssistantError]);

  async function send(messageOverride?: string, options?: { retry?: boolean }) {
    const text = (messageOverride ?? input).trim();
    if (!text || streaming) return;
    if (!messageOverride) setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setCreditsExhausted(false);

    const assistantMessage: Msg = {
      id: newMessageId(),
      role: "assistant",
      text: "",
      tools: [],
      status: "streaming",
      statusText: pickThinkingMessage(),
    };

    setMessages((m) => {
      if (options?.retry) {
        const next = m.slice();
        const last = next[next.length - 1];
        if (last?.role === "assistant" && last.status === "error") {
          next[next.length - 1] = assistantMessage;
          return next;
        }
        return [...next, assistantMessage];
      }

      return [
        ...m,
        { id: newMessageId(), role: "user", text, tools: [] },
        assistantMessage,
      ];
    });

    const abortController = new AbortController();
    abortRef.current = abortController;
    setStreaming(true);
    try {
      const body = {
        message: text,
        sessionId,
        module,
        question_id: questionId,
        files: { topic_id: questionId },
        ...(lesson ? { lesson: { courseSlug: lesson.courseSlug, moduleSlug: lesson.moduleSlug } } : {}),
        ...currentEditorSnapshotPayload(getEditorSnapshot?.(), questionId),
      };
      for await (const { event } of streamChatEvents(body, abortController.signal)) {
        applyEvent(event);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (abortController.signal.aborted) {
        setMessages((m) => {
          const next = m.slice();
          const last = next[next.length - 1];
          if (last?.role !== "assistant") return next;
          if (!last.text.trim()) return next.slice(0, -1);
          next[next.length - 1] = {
            ...last,
            status: "stopped",
            statusText: undefined,
            suggestions: DEFAULT_SUGGESTIONS,
          };
          return next;
        });
      } else if (e instanceof StreamHttpError && e.status === 401) {
        markLastAssistantError("Sign in to use the AI tutor.", "auth_required");
      } else if (msg.includes("402")) {
        setCreditsExhausted(true);
        setCredits(0);
        setMessages((m) => {
          const last = m[m.length - 1];
          if (last?.role === "assistant" && !last.text) return m.slice(0, -1);
          return m;
        });
      } else {
        markLastAssistantError("The tutor could not respond. Please retry.");
      }
    } finally {
      if (abortRef.current === abortController) abortRef.current = null;
      setStreaming(false);
    }
  }

  function cancelStream() {
    abortRef.current?.abort();
  }

  function retryLast() {
    const lastAssistantIndex = [...messages]
      .reverse()
      .findIndex((m) => m.role === "assistant" && m.status === "error");
    if (lastAssistantIndex === -1) return;

    const assistantIndex = messages.length - 1 - lastAssistantIndex;
    const previousUser = [...messages.slice(0, assistantIndex)]
      .reverse()
      .find((m) => m.role === "user");

    if (previousUser?.text) void send(previousUser.text, { retry: true });
  }

  const isEmpty = messages.length === 0 && !creditsExhausted;

  return (
    <div className="flex h-full flex-col">
      {/* Scrollable messages */}
      <div
        ref={scrollRef}
        className="scrollbar-slick min-h-0 flex-1 overflow-y-auto"
      >
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/40">
              <Sparkles className="h-[18px] w-[18px] text-muted-foreground" />
            </span>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">
                Ask the tutor anything
              </p>
              <p className="mx-auto max-w-[15rem] text-xs leading-relaxed text-muted-foreground">
                Hints, walkthroughs, and feedback on your idea - guided, never
                the full answer.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5 pt-1">
              {STARTERS.map((starter) => (
                <Button
                  key={starter}
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => void send(starter)}
                  disabled={streaming}
                >
                  {starter}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5 px-4 py-5">
            {messages.map((m, i) => {
              const isLast = i === messages.length - 1;
              const isStreaming = isLast && streaming && m.role === "assistant";
              const isThinking = isStreaming && !m.text && m.status !== "error";

              if (m.role === "user") {
                return (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md border border-border/60 bg-muted px-3.5 py-2 text-sm leading-relaxed text-foreground">
                      {m.text}
                    </div>
                  </div>
                );
              }

              // assistant
              const body = isStreaming ? cleanStreamingText(m.text) : m.text;

              return (
                <div key={m.id} className="space-y-2">
                  {m.tools.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {m.tools.map((t, j) => (
                        <span
                          key={j}
                          className="rounded border border-border bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="text-sm leading-relaxed">
                    {m.status === "error" ? (
                      <div className="space-y-2">
                        <p className="text-destructive">
                          {m.error ?? "The tutor could not respond."}
                        </p>
                        {m.errorCode === "auth_required" ? (
                          <Link
                            href="/sign-in"
                            className={buttonVariants({ variant: "outline", size: "xs" })}
                          >
                            Sign in
                          </Link>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={retryLast}
                            disabled={streaming || creditsExhausted}
                          >
                            Retry
                          </Button>
                        )}
                      </div>
                    ) : isThinking ? (
                      <TutorThinkingIndicator text={m.statusText ?? "Thinking..."} />
                    ) : (
                      <div>
                        <Markdown>
                          {isStreaming && body ? `${body} ▍` : body}
                        </Markdown>
                        {m.status === "stopped" && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            stopped
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  {m.status === "done" && m.suggestions && m.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {m.suggestions.map((suggestion) => (
                        <Button
                          key={suggestion}
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => void send(suggestion)}
                          disabled={streaming || creditsExhausted}
                        >
                          {suggestion}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Credits exhausted */}
      {creditsExhausted && (
        <div className="mx-4 mb-3 rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-sm text-muted-foreground">
            You&apos;ve used your 100 weekly AI tutor credits.
          </p>
          <Link
            href="/upgrade"
            className="mt-2 inline-block text-sm font-medium underline underline-offset-4 transition-colors hover:text-muted-foreground"
          >
            Upgrade for unlimited access
          </Link>
          <p className="mt-1 text-[10px] text-muted-foreground">
            or wait until next week for 100 more
          </p>
        </div>
      )}

      {/* Composer */}
      <div className="px-4 pb-4 pt-2">
        <div className="rounded-xl border border-border bg-background shadow-sm transition-colors focus-within:border-ring/70">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              growTextarea();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder={
              creditsExhausted ? "Credits exhausted" : "Ask the tutor…"
            }
            disabled={creditsExhausted}
            className="block w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-sm leading-6 placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-40"
            style={{ minHeight: "24px", maxHeight: "112px" }}
          />
          <div className="flex items-center justify-between gap-2 px-2.5 pb-2 pt-0.5">
            <span className="pl-1 text-[11px] text-muted-foreground">
              {credits !== null ? (
                <span className="text-foreground/80">{credits} credits left</span>
              ) : (
                <>
                  <kbd className="font-sans">↵</kbd> send ·{" "}
                  <kbd className="font-sans">⇧↵</kbd> newline
                </>
              )}
            </span>
            <Button
              size="icon-sm"
              variant={streaming ? "outline" : "default"}
              onClick={streaming ? cancelStream : () => void send()}
              disabled={(!streaming && !input.trim()) || creditsExhausted}
              className="rounded-full"
              aria-label={streaming ? "Stop" : "Send"}
            >
              {streaming ? (
                <Square className="h-3 w-3 fill-current" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
