/// <reference path="../vite-env.d.ts" />
import type { FileText, Material } from '../types';
import { db } from '../db';

const PDF_MAX_BYTES = 20 * 1024 * 1024;
const TEXT_MAX_BYTES = 2 * 1024 * 1024;
const TEXT_TRUNCATE = 500_000;

export const TEXT_EXTRACTABLE = new Set(['pdf', 'txt', 'md', 'csv']);

async function getFileByPath(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemFileHandle> {
  const segments = path.split('/');
  let dir = root;
  for (let i = 0; i < segments.length - 1; i++) {
    dir = await dir.getDirectoryHandle(segments[i] as string);
  }
  const fileName = segments[segments.length - 1] as string;
  return dir.getFileHandle(fileName);
}

let pdfWorkerReady = false;

async function ensurePdfWorker(): Promise<void> {
  if (pdfWorkerReady) return;
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  pdfWorkerReady = true;
}

async function extractPdf(file: File): Promise<string> {
  await ensurePdfWorker();
  const pdfjs = await import('pdfjs-dist');
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  let out = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
    out += `\n\n[Trang ${p}]\n${text}`;
  }
  await doc.destroy();
  return out.trim();
}

export async function extractMaterialText(
  material: Material,
  root: FileSystemDirectoryHandle,
): Promise<string> {
  const handle = await getFileByPath(root, material.path);
  const file = await handle.getFile();
  if (material.ext === 'pdf') {
    if (file.size > PDF_MAX_BYTES) return '';
    return extractPdf(file);
  }
  const text = await file.text();
  return text.length > TEXT_TRUNCATE ? text.slice(0, TEXT_TRUNCATE) : text;
}

/** Lấy text đã cache, trích xuất mới nếu file thay đổi. Trả về null với loại file không trích xuất được. */
export async function getOrExtractText(
  material: Material,
  root: FileSystemDirectoryHandle,
): Promise<FileText | null> {
  if (!TEXT_EXTRACTABLE.has(material.ext)) return null;
  const cached = await db.fileTexts.get(material.id);
  if (cached && cached.lastModified === material.lastModified && cached.size === material.size) {
    return cached;
  }
  let text = '';
  try {
    text = await extractMaterialText(material, root);
  } catch {
    text = '';
  }
  const row: FileText = {
    materialId: material.id,
    courseId: material.courseId,
    text,
    lastModified: material.lastModified,
    size: material.size,
    extractedAt: Date.now(),
  };
  await db.fileTexts.put(row);
  return row;
}
