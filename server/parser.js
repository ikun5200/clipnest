import { AppError, fetchWithRetry, fetchWithTimeout } from './http.js';
import {
  baseName,
  coverName,
  imageName,
  liveName,
  musicName,
  videoName,
} from './filename.js';

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const DETAIL_ENDPOINT = 'https://www.douyin.com/aweme/v1/web/aweme/detail/';
const PLAY_ENDPOINT = 'https://aweme.snssdk.com/aweme/v1/play/';
const PLAYCOUNT_ENDPOINT = 'https://jingxuan.douyin.com/m/video/';

const MEDIA_HOSTS = [
  'douyinvod.com',
  'douyin.com',
  'douyinstatic.com',
  'douyinpic.com',
  'byteimg.com',
  'pstatp.com',
  'snssdk.com',
  'amemv.com',
  'ixigua.com',
  'zjcdn.com',
];

const CACHE_TTL = 10 * 60 * 1000;
const CACHE_MAX = 300;
const cache = new Map();

function cacheGet(id) {
  const entry = cache.get(id);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL) {
    cache.delete(id);
    return null;
  }
  return entry.detail;
}

function cacheSet(id, detail) {
  cache.set(id, { detail, at: Date.now() });
  if (cache.size <= CACHE_MAX) return;
  const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
  if (oldest) cache.delete(oldest[0]);
}

function isSupportedUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return (
      host === 'douyin.com' ||
      host.endsWith('.douyin.com') ||
      host === 'iesdouyin.com' ||
      host.endsWith('.iesdouyin.com')
    );
  } catch {
    return false;
  }
}

export function extractLink(text) {
  if (typeof text !== 'string') return null;
  const cleaned = text.replace(/&amp;/g, '&');
  const urls = cleaned.match(/https?:\/\/[^\s<>"'“”‘’，。！？、]+/gi) || [];
  for (const raw of urls) {
    const candidate = raw.replace(/[)\]}>.,;!?]+$/g, '');
    if (isSupportedUrl(candidate)) return candidate;
  }
  const idMatch =
    cleaned.match(/(?:aweme_id|item_ids|modal_id)[=:]\s*(\d{15,25})/i) ||
    cleaned.match(/\b(\d{15,25})\b/);
  return idMatch ? idMatch[1] : null;
}

function parseIdFromText(text) {
  const patterns = [
    /\/(?:share\/)?(?:video|note|slides)\/(\d{15,25})/i,
    /[?&](?:modal_id|aweme_id|item_ids)=(\d{15,25})/i,
    /"aweme_id"\s*:\s*"(\d{15,25})"/i,
    /"itemId"\s*:\s*"(\d{15,25})"/i,
  ];
  for (const pattern of patterns) {
    const match = String(text).match(pattern);
    if (match) return match[1];
  }
  return null;
}

export async function resolveInput(text) {
  const link = extractLink(text);
  if (!link) {
    throw new AppError('没有识别到可用的分享链接，请检查后重试', 400);
  }
  if (/^\d{15,25}$/.test(link)) {
    return { id: link, sourceUrl: link };
  }

  let url;
  try {
    url = new URL(link);
  } catch {
    throw new AppError('链接格式不正确', 400);
  }

  const directId = parseIdFromText(url.pathname + url.search);
  if (directId) return { id: directId, sourceUrl: link };

  if (url.hostname.toLowerCase() === 'v.douyin.com') {
    const response = await fetchWithRetry(
      link,
      {
        redirect: 'manual',
        headers: {
          'User-Agent': MOBILE_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
      },
      { timeoutMs: 12000, retries: 2 },
    );

    const location = response.headers.get('location');
    if (location) {
      const id = parseIdFromText(location);
      if (id) return { id, sourceUrl: link };
    }

    if (response.ok) {
      const html = (await response.text()).slice(0, 300000);
      const id = parseIdFromText(html);
      if (id) return { id, sourceUrl: link };
    }

    throw new AppError('短链接解析失败，链接可能已失效', 400);
  }

  throw new AppError('暂不支持这个链接格式', 400);
}

export async function fetchDetail(id, { force = false } = {}) {
  if (!force) {
    const cached = cacheGet(id);
    if (cached) return cached;
  }

  const url = `${DETAIL_ENDPOINT}?aweme_id=${encodeURIComponent(id)}&aid=6383`;
  const response = await fetchWithRetry(
    url,
    {
      headers: {
        'User-Agent': DESKTOP_UA,
        Origin: 'https://open.douyin.com',
        Referer: 'https://open.douyin.com/',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    },
    { timeoutMs: 15000, retries: 2 },
  );

  if (!response.ok) {
    throw new AppError(
      response.status === 403 ? '源站拒绝了请求，请稍后重试' : `作品信息获取失败（${response.status}）`,
      502,
    );
  }

  const payload = await response.json().catch(() => null);
  const detail = payload?.aweme_detail;
  if (!detail) {
    throw new AppError('没有找到这个作品，可能已删除或不可见', 404);
  }

  cacheSet(id, detail);
  return detail;
}

export async function fetchPlayCount(id) {
  try {
    const response = await fetchWithTimeout(
      `${PLAYCOUNT_ENDPOINT}${encodeURIComponent(id)}?app=yumme`,
      {
        headers: {
          'User-Agent': MOBILE_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
      },
      8000,
    );
    if (!response.ok) return 0;
    const html = await response.text();
    const match = html.match(/"play_count":(\d+)/);
    return match ? Number(match[1]) : 0;
  } catch {
    return 0;
  }
}

export function pickUrl(object) {
  return Array.isArray(object?.url_list) ? object.url_list.find(Boolean) || '' : '';
}

export function pickImageUrl(image) {
  const list = Array.isArray(image?.url_list) ? image.url_list.filter(Boolean) : [];
  return list.find((url) => /\.(?:jpe?g|png)(?:\?|$)/i.test(url)) || list[0] || '';
}

export function extFromUrl(url) {
  if (/\.png(?:\?|$)/i.test(url)) return 'png';
  if (/\.webp(?:\?|$)/i.test(url)) return 'webp';
  return 'jpg';
}

function labelForHeight(height) {
  if (height >= 2160) return '4K';
  if (height >= 1440) return '2K';
  if (height >= 1080) return '1080P';
  if (height >= 720) return '720P';
  if (height >= 540) return '540P';
  return `${height}P`;
}

export function buildQualities(detail) {
  const video = detail.video || {};
  const list = Array.isArray(video.bit_rate) ? video.bit_rate : [];
  const groups = new Map();

  list.forEach((item, index) => {
    const playAddr = item?.play_addr || {};
    const width = Number(playAddr.width) || 0;
    const height = Number(playAddr.height) || 0;
    if (!width || !height) return;

    const h265 = Boolean(item.is_h265 || item.is_bytevc1);
    const bitrate = Number(item.bit_rate) || 0;
    const score = (h265 ? 0 : 1e12) + bitrate;
    const key = `${width}x${height}`;
    const previous = groups.get(key);

    if (!previous || score > previous.score) {
      groups.set(key, {
        index,
        width,
        height,
        h265,
        bitrate,
        size: Number(playAddr.data_size) || 0,
        fps: Number(item.FPS) || 0,
        score,
        directUrl: pickUrl(playAddr),
      });
    }
  });

  const qualities = [];
  const vid =
    typeof video.play_addr?.uri === 'string' && !video.play_addr.uri.startsWith('http')
      ? video.play_addr.uri
      : '';

  if (vid) {
    qualities.push({
      id: 'original',
      label: '原画',
      hint: '原始码率',
      width: Number(video.play_addr?.width) || Number(video.width) || 0,
      height: Number(video.play_addr?.height) || Number(video.height) || 0,
      size: 0,
      codec: video.is_h265 ? 'H.265' : 'H.264',
      bitrate: 0,
      fps: Number(video.fps) || Number(list[0]?.FPS) || 0,
      directUrl: '',
      filename: videoName(detail, '原画'),
    });
  }

  const seenLabels = new Set();
  const sorted = [...groups.values()].sort(
    (a, b) => b.height - a.height || b.bitrate - a.bitrate,
  );

  for (const group of sorted) {
    const label = labelForHeight(group.height);
    if (seenLabels.has(label)) continue;
    seenLabels.add(label);
    qualities.push({
      id: `gear-${group.index}`,
      label,
      hint: `${group.width}×${group.height}`,
      width: group.width,
      height: group.height,
      size: group.size,
      codec: group.h265 ? 'H.265' : 'H.264',
      bitrate: Math.round(group.bitrate / 1000),
      fps: group.fps,
      directUrl: group.directUrl,
      filename: videoName(detail, label),
    });
  }

  if (!qualities.length) {
    const direct = pickUrl(video.play_addr);
    if (direct) {
      qualities.push({
        id: 'original',
        label: '默认',
        hint: '原始文件',
        width: Number(video.play_addr?.width) || 0,
        height: Number(video.play_addr?.height) || 0,
        size: 0,
        codec: 'H.264',
        bitrate: 0,
        fps: Number(video.fps) || 0,
        directUrl: direct,
        filename: videoName(detail, '默认'),
      });
    }
  }

  return qualities.slice(0, 7);
}

export function normalizeDetail(detail, playCount, sourceUrl) {
  const isImages = Array.isArray(detail.images) && detail.images.length > 0;
  const video = detail.video || {};
  const author = detail.author?.nickname || '未知作者';
  const title = String(detail.desc || '').trim() || '未命名作品';
  const cover =
    pickUrl(video.cover) ||
    pickUrl(video.origin_cover) ||
    (isImages ? pickImageUrl(detail.images[0]) : '') ||
    pickUrl(video.dynamic_cover);
  const statistics = detail.statistics || {};
  const base = baseName(detail);

  const images = isImages
    ? detail.images
        .map((image, index) => {
          const url = pickImageUrl(image);
          const liveUrl =
            pickUrl(image.video?.play_addr) || pickUrl(image.live_photo?.play_addr) || '';
          const ext = extFromUrl(url);
          return {
            index,
            url,
            directUrl: url,
            filename: imageName(detail, index, ext),
            width: Number(image.width) || 0,
            height: Number(image.height) || 0,
            ext,
            liveUrl,
            liveDuration: Math.round(
              (Number(image.video?.duration) || Number(image.live_photo?.duration) || 0) / 1000,
            ),
            liveFilename: liveUrl ? liveName(detail, index) : '',
          };
        })
        .filter((image) => image.url)
    : [];

  const qualities = isImages ? [] : buildQualities(detail);
  const isLive = Boolean(
    detail.aweme_type === 68 ||
      detail.aweme_type === 150 ||
      images.some((image) => image.liveUrl),
  );
  const musicUrl =
    pickUrl(detail.music?.play_url) || (isImages ? pickUrl(video.play_addr) : '');

  return {
    type: isImages ? 'images' : 'video',
    awemeId: String(detail.aweme_id || ''),
    sourceUrl: sourceUrl || '',
    author,
    avatar: pickUrl(detail.author?.avatar_thumb) || pickUrl(detail.author?.avatar_medium) || '',
    title,
    baseName: base,
    cover,
    coverFilename: coverName(detail).replace(/\.jpg$/, `.${extFromUrl(cover)}`),
    createdAt: Number(detail.create_time) || 0,
    isLive,
    duration: Math.round((Number(video.duration) || 0) / 1000),
    stats: {
      play: Number(playCount) || 0,
      like: Number(statistics.digg_count) || 0,
      comment: Number(statistics.comment_count) || 0,
      share: Number(statistics.share_count) || 0,
      collect: Number(statistics.collect_count) || 0,
    },
    qualities,
    images,
    music: musicUrl
      ? {
          title: detail.music?.title || '',
          author: detail.music?.author || '',
          url: musicUrl,
          cover:
            pickUrl(detail.music?.cover_hd) || pickUrl(detail.music?.cover_large) || '',
          filename: musicName(detail),
        }
      : null,
  };
}

function assertMediaUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new AppError('媒体地址无效', 502);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new AppError('媒体地址协议不受支持', 502);
  }
  const host = url.hostname.toLowerCase();
  const allowed = MEDIA_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  if (!allowed) {
    throw new AppError('媒体地址不在允许范围内', 502);
  }
  return url.toString();
}

export async function safeFetch(value, options = {}, { timeoutMs = 60000, maxRedirects = 3 } = {}) {
  let current = assertMediaUrl(value);

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const response = await fetchWithTimeout(current, { ...options, redirect: 'manual' }, timeoutMs);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => {});
      if (!location) return response;
      current = assertMediaUrl(new URL(location, current).toString());
      continue;
    }
    return response;
  }

  throw new AppError('媒体地址重定向次数过多', 502);
}

export async function resolveVideoSource(id, quality) {
  const detail = await fetchDetail(id);
  const video = detail.video || {};

  if (quality === 'original') {
    const vid =
      typeof video.play_addr?.uri === 'string' && !video.play_addr.uri.startsWith('http')
        ? video.play_addr.uri
        : '';

    if (vid) {
      const playUrl = `${PLAY_ENDPOINT}?video_id=${encodeURIComponent(vid)}&ratio=default&line=0`;
      const response = await fetchWithRetry(
        playUrl,
        {
          redirect: 'manual',
          headers: { 'User-Agent': MOBILE_UA, Accept: '*/*' },
        },
        { timeoutMs: 15000, retries: 3 },
      );

      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        try {
          return assertMediaUrl(location);
        } catch {
          // Unknown CDN host: fall through to the detail's default play_addr.
        }
      }
      if (response.ok && (response.headers.get('content-type') || '').includes('video/')) {
        return assertMediaUrl(playUrl);
      }
      await response.body?.cancel().catch(() => {});
      const fallback = pickUrl(video.play_addr);
      if (fallback) return assertMediaUrl(fallback);
      throw new AppError('原画地址获取失败，请稍后重试', 502);
    }

    const direct = pickUrl(video.play_addr);
    if (direct) return assertMediaUrl(direct);
    throw new AppError('这个作品没有可用的视频地址', 404);
  }

  if (quality.startsWith('gear-')) {
    const index = Number(quality.slice(5));
    const item = Number.isInteger(index) && Array.isArray(video.bit_rate) ? video.bit_rate[index] : null;
    const direct = pickUrl(item?.play_addr);
    if (direct) return assertMediaUrl(direct);
  }

  throw new AppError('未知的画质选项', 400);
}

async function fetchImage(url) {
  return safeFetch(
    url,
    {
      headers: {
        'User-Agent': DESKTOP_UA,
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        Referer: 'https://www.douyin.com/',
      },
    },
    { timeoutMs: 30000, maxRedirects: 3 },
  );
}

export async function getImage(id, index) {
  let detail = await fetchDetail(id);
  let image = Array.isArray(detail.images) ? detail.images[index] : null;
  if (!image) throw new AppError('图片不存在', 404);

  let url = pickImageUrl(image);
  if (!url) throw new AppError('图片地址为空', 502);

  let response = await fetchImage(url);
  if (response.status === 403) {
    await response.body?.cancel().catch(() => {});
    detail = await fetchDetail(id, { force: true });
    image = Array.isArray(detail.images) ? detail.images[index] : null;
    url = image ? pickImageUrl(image) : '';
    if (!url) throw new AppError('图片地址已失效', 502);
    response = await fetchImage(url);
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new AppError(`图片下载失败（${response.status}）`, 502);
  }

  const ext = extFromUrl(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType =
    response.headers.get('content-type') ||
    (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');

  return { buffer, contentType, ext };
}

export async function getLiveVideo(id, index) {
  const detail = await fetchDetail(id);
  const image = Array.isArray(detail.images) ? detail.images[index] : null;
  const url =
    pickUrl(image?.video?.play_addr) || pickUrl(image?.live_photo?.play_addr);
  if (!url) throw new AppError('这个图片没有实况视频', 404);

  const response = await safeFetch(
    url,
    {
      headers: {
        'User-Agent': DESKTOP_UA,
        Accept: 'video/mp4,video/*;q=0.9,*/*;q=0.8',
        Referer: 'https://www.douyin.com/',
      },
    },
    { timeoutMs: 60000, maxRedirects: 3 },
  );

  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new AppError(`实况视频下载失败（${response.status}）`, 502);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    buffer,
    contentType: response.headers.get('content-type') || 'video/mp4',
    ext: 'mp4',
  };
}
