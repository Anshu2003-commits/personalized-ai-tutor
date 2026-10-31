export type ChatEvent =
  | { type: "token"; content: string }
  | { type: "thinking"; content: string }
  | { type: "tool_start"; name: string; input?: string }
  | { type: "tool_end"; name: string; output?: string }
  | { type: "tool_chunk"; name: string; input?: unknown }
  | { type: "subagent_start"; name: string }
  | { type: "subagent_end"; name: string }
  | { type: "done" }
  | { type: "error"; message: string }
  | { type: string; [key: string]: unknown };

export type StreamTimings = {
  t0_send: number;
  t1_first_byte?: number;
  t2_first_event?: number;
  t3_first_token?: number;
};

export class StreamHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`stream failed: ${status} ${body}`);
    this.name = "StreamHttpError";
  }
}

export async function* streamChatEvents(
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<{ event: ChatEvent; timings: StreamTimings }, void, void> {
  const t0_send = performance.now();
  const timings: StreamTimings = { t0_send };

  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new StreamHttpError(res.status, await res.text().catch(() => ""));
  }

  timings.t1_first_byte = performance.now();

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);

      const line = raw
        .split("\n")
        .find((l) => l.startsWith("data:"))
        ?.slice(5)
        .trim();
      if (!line) continue;

      let parsed: ChatEvent;
      try {
        parsed = JSON.parse(line) as ChatEvent;
      } catch {
        continue;
      }

      timings.t2_first_event ??= performance.now();
      if (parsed.type === "token" && timings.t3_first_token === undefined) {
        timings.t3_first_token = performance.now();
      }

      yield { event: parsed, timings };
    }
  }
}
