export function safeName(value) {
  const cleaned = String(value || '')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'clip';
}

export function datePrefix(createTime) {
  const timestamp = Number(createTime) || 0;
  if (!timestamp) return '';
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}_`;
}

export function baseName(detail) {
  const author = detail?.author?.nickname || 'clip';
  const title = detail?.desc || detail?.aweme_id || 'untitled';
  return safeName(`${datePrefix(detail?.create_time)}${author}-${title}`).slice(0, 60);
}

export function videoName(detail, label) {
  return `${baseName(detail)}-${safeName(label || '视频')}.mp4`;
}

export function imageName(detail, index, ext) {
  return `${baseName(detail)}-${String(index + 1).padStart(2, '0')}.${ext}`;
}

export function zipName(detail) {
  return `${baseName(detail)}-图片.zip`;
}

export function musicName(detail) {
  return `${baseName(detail)}-音乐.mp3`;
}

export function coverName(detail) {
  return `${baseName(detail)}-封面.jpg`;
}

export function liveName(detail, index) {
  return `${baseName(detail)}-${String(index + 1).padStart(2, '0')}-实况.mp4`;
}
