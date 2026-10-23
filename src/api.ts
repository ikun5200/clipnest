import type { ParseResult } from './types';

export const DIRECT_LIMIT = 100 * 1024 * 1024;
export const SHARE_LIMIT = 60 * 1024 * 1024;

export type VideoLink = {
  url: string;
  filename: string;
  size: number;
  original: boolean;
  contentType: string;
};

export async function parseLink(text: string): Promise<ParseResult> {
  let response: Response;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 30000);
  try {
    response = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
  } catch {
    throw new Error('网络请求失败，请检查服务是否正常运行');
  } finally {
    window.clearTimeout(timer);
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

export function liveDownloadUrl(id: string, index: number): string {
  return `/api/download/live?id=${encodeURIComponent(id)}&index=${index}`;
}

export function musicDownloadUrl(id: string): string {
  return `/api/download/music?id=${encodeURIComponent(id)}`;
}

export function coverDownloadUrl(id: string): string {
  return `/api/download/cover?id=${encodeURIComponent(id)}`;
}

export async function fetchVideoLink(id: string, quality: string): Promise<VideoLink> {
  let response: Response;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 30000);
  try {
    response = await fetch(
      `/api/link/video?id=${encodeURIComponent(id)}&quality=${encodeURIComponent(quality)}`,
      { signal: controller.signal },
    );
  } catch {
    throw new Error('直链获取失败，请检查网络');
  } finally {
    window.clearTimeout(timer);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || '直链获取失败');
  }
  return payload as VideoLink;
}

export function triggerDownload(url: string, filename?: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || '';
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export async function downloadDirect(url: string, filename: string): Promise<void> {
  const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) {
    throw new Error(`直链下载失败（${response.status}）`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  triggerDownload(objectUrl, filename);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
}

export async function fetchMediaFile(
  url: string,
  filename: string,
  fallbackType: string,
): Promise<File> {
  const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) {
    throw new Error(`文件获取失败（${response.status}）`);
  }
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type || fallbackType });
}

export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || typeof File === 'undefined') return false;
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
    return false;
  }
  try {
    const probe = new File(['x'], 'probe.jpg', { type: 'image/jpeg' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export async function shareFiles(files: File[], title: string): Promise<void> {
  if (!canShareFiles()) {
    throw new Error('当前浏览器不支持直接保存到相册，请使用下载');
  }
  if (!navigator.canShare({ files })) {
    throw new Error('当前浏览器不支持分享这些文件，请减少数量或使用下载');
  }
  await navigator.share({ files, title });
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy copy path.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('复制失败，请手动选择直链');
}
