import { createTask, updateTask } from '../repo/tasks';
import { db } from '../db';
import { getOrExtractText } from '../fs/extract';
import { searchChunks, type TextFile } from '../chat/ground';
import { streamCompletion, type ChatTurn, type ToolRequestParsed } from '../llm/openrouter';
import type { Course, Material } from '../types';
import { TOOL_DEFINITIONS, toolLabel } from './tools';

export interface CourseAgentContext {
  course: Course;
  root: FileSystemDirectoryHandle | null;
  materials: Material[];
  /** Tầng hội thoại ban đầu: system prompt (grounding) + history + câu hỏi mới. */
  baseTurns: ChatTurn[];
  /** Text đã trích xuất sẵn từ bước chuẩn bị (dùng cho search_materials). */
  getTextFiles: () => Promise<TextFile[]>;
  key: string;
  model: string;
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
  onTool?: (info: { name: string; label: string }) => void;
}

export interface CourseAgentResult {
  text: string;
  toolRuns: number;
}

const MAX_ITERATIONS = 6;

/** Vòng agent: stream → tool calls → thực thi → lặp lại cho tới khi có câu trả lời cuối. */
export async function runCourseAgent(ctx: CourseAgentContext): Promise<CourseAgentResult> {
  const turns: ChatTurn[] = [...ctx.baseTurns];
  let toolRuns = 0;
  let lastText = '';

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const step = await streamCompletion({
      key: ctx.key,
      model: ctx.model,
      messages: turns,
      tools: TOOL_DEFINITIONS,
      signal: ctx.signal,
      onDelta: ctx.onDelta,
    });
    lastText = step.text;

    if (step.toolCalls.length === 0) {
      return { text: step.text, toolRuns };
    }

    turns.push({
      role: 'assistant',
      content: step.text,
      tool_calls: step.toolCalls.map((c) => ({
        id: c.id,
        type: 'function' as const,
        function: { name: c.name, arguments: c.args },
      })),
    });

    for (const call of step.toolCalls) {
      toolRuns += 1;
      ctx.onTool?.({ name: call.name, label: toolLabel(call.name, call.args) });
      let payload: unknown;
      try {
        payload = await executeTool(call, ctx);
      } catch (e) {
        payload = { error: e instanceof Error ? e.message : String(e) };
      }
      turns.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(payload ?? { ok: true }),
      });
    }
  }

  return { text: lastText, toolRuns };
}

export function isoDateToEndOfDay(iso: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  const time = new Date(`${iso}T23:59:59`).getTime();
  return Number.isFinite(time) ? time : undefined;
}

async function executeTool(
  call: ToolRequestParsed,
  ctx: CourseAgentContext,
): Promise<unknown> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(call.args || '{}') as Record<string, unknown>;
  } catch {
    return { error: 'arguments không phải JSON hợp lệ' };
  }

  switch (call.name) {
    case 'create_task': {
      const title = typeof args.title === 'string' ? args.title.trim() : '';
      if (!title) return { error: 'thiếu title' };
      const dueDate =
        typeof args.dueDate === 'string' ? isoDateToEndOfDay(args.dueDate) : undefined;
      await createTask({
        courseId: ctx.course.id,
        title,
        dueDate,
        subtasks: Array.isArray(args.subtasks)
          ? (args.subtasks as unknown[])
              .filter((x): x is string => typeof x === 'string')
              .slice(0, 10)
              .map((t) => ({ title: t }))
          : [],
        source: 'ai',
      });
      return { ok: true };
    }

    case 'list_tasks': {
      const rows = await db.tasks.where('courseId').equals(ctx.course.id).toArray();
      return {
        tasks: rows.slice(0, 50).map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          dueDate: t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : null,
          subtaskCount: t.subtasks.length,
        })),
      };
    }

    case 'update_task': {
      const id = typeof args.taskId === 'string' ? args.taskId : '';
      const task = await db.tasks.get(id);
      if (!task || task.courseId !== ctx.course.id) return { error: 'không tìm thấy taskId' };
      await updateTask(id, {
        ...(typeof args.title === 'string' && args.title.trim()
          ? { title: args.title.trim() }
          : {}),
        ...(args.status === 'todo' || args.status === 'doing' || args.status === 'done'
          ? { status: args.status }
          : {}),
        ...(typeof args.dueDate === 'string' ? { dueDate: isoDateToEndOfDay(args.dueDate) } : {}),
      });
      return { ok: true };
    }

    case 'search_materials': {
      const files = await ctx.getTextFiles();
      const results = searchChunks(
        files,
        typeof args.query === 'string' ? args.query : '',
        6,
      );
      return {
        results: results.map((r) => ({
          path: r.path,
          page: r.page,
          text: r.text.slice(0, 1200),
        })),
      };
    }

    case 'read_excerpt': {
      const path = typeof args.path === 'string' ? args.path : '';
      const needle = path.toLowerCase();
      const material =
        ctx.materials.find((m) => m.path === path) ??
        ctx.materials.find((m) => m.path.toLowerCase().endsWith(needle));
      if (!material || !ctx.root) return { error: 'không tìm thấy tệp' };
      const fileText = await getOrExtractText(material, ctx.root);
      return { path: material.path, text: (fileText?.text ?? '').slice(0, 4000) };
    }

    default:
      return { error: 'công cụ không tồn tại' };
  }
}
