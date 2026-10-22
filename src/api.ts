import type { ParseResult } from './types';

export async function parseLink(text: string): Promise<ParseResult> {
  let response: Response;
  try {
    response = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch {
    throw new Error('网络请求失败，请检查服务是否正常运行');
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || '解析失败，请检查链接后重试');
  }
  return payload.data as ParseResult;
}

export function hasShareLink(text: string): boolean {
  if (!text) return false;
  if (/https?:\/\/[^\s]*(?:douyin\.com|iesdouyin\.com)/i.test(text)) return true;
  return /\b\d{15,25}\b/.test(text);
}

export function videoDownloadUrl(id: string, quality: string): string {
  return `/api/download/video?id=${encodeURIComponent(id)}&quality=${encodeURIComponent(quality)}`;
}

export function imageDownloadUrl(id: string, index: number): string {
  return `/api/download/image?id=${encodeURIComponent(id)}&index=${index}`;
}

export function imagesZipUrl(id: string, indices?: number[]): string {
  const suffix = indices?.length ? `&indices=${indices.join(',')}` : '';
  return `/api/download/images?id=${encodeURIComponent(id)}${suffix}`;
}

export function triggerDownload(url: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = '';
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export async function preflightVideo(url: string): Promise<void> {
  const response = await fetch(url, {
    headers: { Range: 'bytes=0-0' },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `下载失败（${response.status}）`);
  }
  await response.body?.cancel().catch(() => {});
}
