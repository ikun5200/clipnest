export function formatCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  const trim = (text: string) => text.replace(/\.0$/, '');
  if (value >= 100_000_000) return `${trim((value / 100_000_000).toFixed(1))}亿`;
  if (value >= 10_000) return `${trim((value / 10_000).toFixed(1))}万`;
  return String(Math.round(value));
}

export function formatSize(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${Math.round(value)} B`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  }
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
