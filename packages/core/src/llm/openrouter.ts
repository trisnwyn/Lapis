const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

export interface KeyCheckResult {
  ok: boolean;
  label?: string;
  error?: 'invalid' | 'network' | string;
}

export async function verifyOpenRouterKey(key: string): Promise<KeyCheckResult> {
  try {
    const res = await fetch(`${OPENROUTER_BASE}/key`, {
      headers: { Authorization: `Bearer ${key.trim()}` },
    });
    if (res.status === 401) return { ok: false, error: 'invalid' };
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    const data = (await res.json()) as { data?: { label?: string } };
    return { ok: true, label: data.data?.label };
  } catch {
    return { ok: false, error: 'network' };
  }
}

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ToolCallPayload {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatTurn {
  role: ChatRole;
  content: string | ContentPart[];
  tool_calls?: ToolCallPayload[];
  tool_call_id?: string;
}

export interface ToolRequestParsed {
  id: string;
  name: string;
  args: string;
}

export interface StreamCompletionResult {
  text: string;
  toolCalls: ToolRequestParsed[];
}

export interface StreamCompletionOptions {
  key: string;
  model: string;
  messages: ChatTurn[];
  tools?: object[];
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
}

interface ToolDelta {
  index: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

/** Stream chat completion, accumulate nội dung + tool_calls. */
export async function streamCompletion(
  options: StreamCompletionOptions,
): Promise<StreamCompletionResult> {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.key.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      stream: true,
      ...(options.tools && options.tools.length > 0
        ? { tools: options.tools, tool_choice: 'auto' }
        : {}),
    }),
    signal: options.signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`OpenRouter HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  const toolAcc = new Map<number, { id?: string; name?: string; args: string }>();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') {
        return {
          text,
          toolCalls: [...toolAcc.entries()].map(([index, c]) => ({
            id: c.id ?? `call_${index}`,
            name: c.name ?? '',
            args: c.args,
          })),
        };
      }
      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{
            delta?: {
              content?: string;
              tool_calls?: ToolDelta[];
            };
          }>;
        };
        const delta = json.choices?.[0]?.delta;
        if (!delta) continue;
        if (delta.content) {
          text += delta.content;
          options.onDelta?.(delta.content);
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const index = tc.index ?? 0;
            const current = toolAcc.get(index) ?? { args: '' };
            if (tc.id) current.id = tc.id;
            if (tc.function?.name) current.name = tc.function.name;
            if (tc.function?.arguments) current.args += tc.function.arguments;
            toolAcc.set(index, current);
          }
        }
      } catch {
        // partial SSE chunk — ignore, next read completes it
      }
    }
  }

  return {
    text,
    toolCalls: [...toolAcc.entries()].map(([index, c]) => ({
      id: c.id ?? `call_${index}`,
      name: c.name ?? '',
      args: c.args,
    })),
  };
}

/** Gọi completion không stream (dùng cho phân tích có cấu trúc, ví dụ PDF → nhiệm vụ). */
export async function completeChat(options: {
  key: string;
  model: string;
  messages: ChatTurn[];
  json?: boolean;
  signal?: AbortSignal;
}): Promise<string> {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.key.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      ...(options.json ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: options.signal,
  });
  if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('OpenRouter: không có nội dung trả về');
  return content;
}
