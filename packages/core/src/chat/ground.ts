import type { ChatTurn } from '../llm/openrouter';
import type { Material } from '../types';

const CHUNK_SIZE = 1200;
const OVERLAP = 150;

export interface TextFile {
  path: string;
  text: string;
}

export interface RetrievedChunk {
  path: string;
  page: number | null;
  text: string;
  score: number;
}

interface Chunk {
  path: string;
  page: number | null;
  text: string;
}

function buildChunks(files: TextFile[]): Chunk[] {
  const chunks: Chunk[] = [];
  for (const file of files) {
    const text = file.text.trim();
    if (!text) continue;

    const markers: Array<{ idx: number; page: number }> = [];
    const re = /\[Trang (\d+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      markers.push({ idx: m.index, page: Number(m[1]) });
    }
    const pageBefore = (idx: number): number | null => {
      let page: number | null = null;
      for (const mk of markers) {
        if (mk.idx < idx) page = mk.page;
        else break;
      }
      return page;
    };

    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + CHUNK_SIZE, text.length);
      chunks.push({
        path: file.path,
        page: pageBefore(end),
        text: text.slice(start, end),
      });
      if (end === text.length) break;
      start = end - OVERLAP;
    }
  }
  return chunks;
}

function tokenize(query: string): string[] {
  return query.toLowerCase().match(/\p{L}{3,}|\d{2,}/gu) ?? [];
}

export function searchChunks(files: TextFile[], query: string, topK = 6): RetrievedChunk[] {
  const chunks = buildChunks(files);
  if (chunks.length === 0) return [];
  const tokens = tokenize(query);
  const lowered = new Map<Chunk, string>();
  const lowerOf = (c: Chunk): string => {
    let l = lowered.get(c);
    if (l === undefined) {
      l = c.text.toLowerCase();
      lowered.set(c, l);
    }
    return l;
  };

  const scored: Array<{ chunk: Chunk; score: number }> = [];
  if (tokens.length > 0) {
    for (const chunk of chunks) {
      const lower = lowerOf(chunk);
      let score = 0;
      for (const token of tokens) {
        let idx = lower.indexOf(token);
        while (idx !== -1) {
          score += 1;
          idx = lower.indexOf(token, idx + token.length);
        }
      }
      if (score > 0) scored.push({ chunk, score });
    }
    scored.sort((a, b) => b.score - a.score);
  }

  if (scored.length === 0) {
    // Fallback: đầu mỗi tài liệu (tối đa 3) để model ít nhất biết tài liệu nói gì
    const seen = new Set<string>();
    const out: RetrievedChunk[] = [];
    for (const chunk of chunks) {
      if (seen.has(chunk.path)) continue;
      seen.add(chunk.path);
      out.push({ path: chunk.path, page: chunk.page, text: chunk.text, score: 0 });
      if (out.length >= 3) break;
    }
    return out;
  }

  return scored.slice(0, topK).map(({ chunk, score }) => ({
    path: chunk.path,
    page: chunk.page,
    text: chunk.text,
    score,
  }));
}

export function buildGroundingSystem(
  courseName: string,
  materials: Material[],
  chunks: RetrievedChunk[],
): string {
  const lines: string[] = [];
  lines.push(`Bạn là trợ lý học tập cho khóa học "${courseName}".`);
  lines.push(
    'Trả lời bằng tiếng Việt, ngắn gọn và chính xác. Chỉ dựa vào TÀI LIỆU bên dưới; nếu tài liệu không chứa câu trả lời, hãy nói rõ bạn không tìm thấy thông tin trong tài liệu. Khi dựa vào tài liệu, trích dẫn nguồn dạng [tên-file.pdf · trang N].',
  );
  lines.push(
    'Bạn có các công cụ: create_task, list_tasks, update_task (quản lý nhiệm vụ của khóa học), search_materials, read_excerpt (tra cứu tài liệu). Khi người dùng muốn tạo/thay đổi nhiệm vụ hoặc hỏi về nhiệm vụ hiện có, hãy gọi công cụ thay vì chỉ mô tả bằng lời.',
  );
  if (materials.length > 0) {
    lines.push('');
    lines.push('DANH SÁCH TỆP TRONG THƯ MỤC KHÓA HỌC:');
    for (const material of materials.slice(0, 200)) {
      lines.push(`- ${material.path}`);
    }
  }
  if (chunks.length > 0) {
    lines.push('');
    lines.push('TRÍCH XUẤT LIÊN QUAN TỚI CÂU HỎI:');
    for (const chunk of chunks) {
      lines.push('');
      lines.push(`--- ${chunk.path}${chunk.page ? ` · trang ${chunk.page}` : ''} ---`);
      lines.push(chunk.text);
    }
  }
  return lines.join('\n');
}
