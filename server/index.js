import express from 'express';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';
import { AppError } from './http.js';
import {
  extFromUrl,
  fetchDetail,
  fetchPlayCount,
  getImage,
  getLiveVideo,
  normalizeDetail,
  pickImageUrl,
  pickUrl,
  resolveInput,
  resolveVideoSource,
  safeFetch,
} from './parser.js';
import {
  coverName,
  imageName,
  liveName,
  musicName,
  videoName,
  zipName,
} from './filename.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Permissions-Policy', 'clipboard-read=(self), clipboard-write=(self)');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "connect-src 'self' https://*.douyinvod.com https://*.douyinpic.com https://*.douyinstatic.com https://*.byteimg.com https://*.pstatp.com https://*.snssdk.com https://*.douyin.com https://*.zjcdn.com https://*.ixigua.com https://*.amemv.com",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "worker-src 'self'",
      "manifest-src 'self'",
      "font-src 'self' data:",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  );
  next();
});

app.use(express.json({ limit: '32kb' }));
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

function rateLimit({ windowMs, max }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now > entry.reset) hits.delete(key);
    }
  }, 60_000);
  timer.unref?.();

  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const entry = hits.get(key) || { count: 0, reset: now + windowMs };
    if (now > entry.reset) {
      entry.count = 0;
      entry.reset = now + windowMs;
    }
    entry.count += 1;
    hits.set(key, entry);
    if (entry.count > max) {
      res.status(429).json({ ok: false, error: '请求过于频繁，请稍后再试' });
      return;
    }
    next();
  };
}

app.use('/api/parse', rateLimit({ windowMs: 60_000, max: 30 }));
app.use('/api/download', rateLimit({ windowMs: 60_000, max: 60 }));

const route = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

function validateId(value) {
  const id = String(value || '');
  if (!/^\d{15,25}$/.test(id)) throw new AppError('作品 ID 不正确', 400);
  return id;
}

function contentDisposition(filename, fallback) {
  const ascii = String(fallback || filename)
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_')
    .slice(0, 120);
  return `attachment; filename="${ascii || 'download'}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function qualityLabel(detail, quality) {
  if (quality === 'original') return '原画';
  const normalized = normalizeDetail(detail, 0, '');
  return normalized.qualities.find((item) => item.id === quality)?.label || '视频';
}

async function streamMedia(req, res, sourceUrl, filename, fallback) {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: '*/*',
    Referer: 'https://www.douyin.com/',
  };
  if (req.headers.range) headers.Range = req.headers.range;

  const upstream = await safeFetch(sourceUrl, { headers }, { timeoutMs: 120000, maxRedirects: 3 });
  if (upstream.status !== 200 && upstream.status !== 206) {
    await upstream.body?.cancel().catch(() => {});
    throw new AppError(`媒体文件获取失败（${upstream.status}）`, 502);
  }

  res.status(upstream.status);
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'video/mp4');
  const length = upstream.headers.get('content-length');
  if (length) res.setHeader('Content-Length', length);
  const contentRange = upstream.headers.get('content-range');
  if (contentRange) res.setHeader('Content-Range', contentRange);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Disposition', contentDisposition(filename, fallback));
  res.setHeader('Cache-Control', 'no-store');

  if (!upstream.body) {
    res.end();
    return;
  }

  const stream = Readable.fromWeb(upstream.body);
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'clipnest', uptime: Math.round(process.uptime()) });
});

app.post(
  '/api/parse',
  route(async (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text.slice(0, 4000) : '';
    if (!text.trim()) throw new AppError('请先粘贴分享文案或链接', 400);

    const { id, sourceUrl } = await resolveInput(text);
    const [detail, playCount] = await Promise.all([fetchDetail(id), fetchPlayCount(id)]);
    const data = normalizeDetail(detail, playCount, sourceUrl);
    if (!data.awemeId) data.awemeId = id;

    res.json({ ok: true, data });
  }),
);

app.get(
  '/api/link/video',
  route(async (req, res) => {
    const id = validateId(req.query.id);
    const quality = typeof req.query.quality === 'string' ? req.query.quality : 'original';
    if (!/^(original|gear-\d{1,3})$/.test(quality)) {
      throw new AppError('画质参数不正确', 400);
    }

    const detail = await fetchDetail(id);
    const source = await resolveVideoSource(id, quality);
    const label = qualityLabel(detail, quality);
    let size = 0;

    if (quality.startsWith('gear-')) {
      const index = Number(quality.slice(5));
      size = Number(detail.video?.bit_rate?.[index]?.play_addr?.data_size) || 0;
    } else {
      try {
        const head = await safeFetch(
          source,
          {
            method: 'HEAD',
            headers: {
              'User-Agent': DESKTOP_UA,
              Accept: '*/*',
              Referer: 'https://www.douyin.com/',
            },
          },
          { timeoutMs: 15000, maxRedirects: 3 },
        );
        size = Number(head.headers.get('content-length')) || 0;
        await head.body?.cancel().catch(() => {});
      } catch {
        size = 0;
      }
    }

    res.json({
      ok: true,
      url: source,
      filename: videoName(detail, label),
      size,
      original: quality === 'original',
      contentType: 'video/mp4',
    });
  }),
);

app.get(
  '/api/link/image',
  route(async (req, res) => {
    const id = validateId(req.query.id);
    const index = Number(req.query.index);
    if (!Number.isInteger(index) || index < 0) {
      throw new AppError('图片序号不正确', 400);
    }

    const detail = await fetchDetail(id);
    const image = Array.isArray(detail.images) ? detail.images[index] : null;
    if (!image) throw new AppError('图片不存在', 404);

    const url = pickImageUrl(image);
    if (!url) throw new AppError('图片地址为空', 502);
    const ext = extFromUrl(url);

    res.json({
      ok: true,
      url,
      filename: imageName(detail, index, ext),
      index,
      contentType:
        ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg',
    });
  }),
);

app.get(
  '/api/download/live',
  route(async (req, res) => {
    const id = validateId(req.query.id);
    const index = Number(req.query.index);
    if (!Number.isInteger(index) || index < 0) {
      throw new AppError('图片序号不正确', 400);
    }

    const detail = await fetchDetail(id);
    const live = await getLiveVideo(id, index);

    res.setHeader('Content-Type', live.contentType);
    res.setHeader('Content-Length', live.buffer.length);
    res.setHeader(
      'Content-Disposition',
      contentDisposition(liveName(detail, index), `clip-${id}-${index + 1}-live.mp4`),
    );
    res.setHeader('Cache-Control', 'no-store');
    res.end(live.buffer);
  }),
);

app.get(
  '/api/download/music',
  route(async (req, res) => {
    const id = validateId(req.query.id);
    const detail = await fetchDetail(id);
    const url = pickUrl(detail.music?.play_url) || pickUrl(detail.video?.play_addr);
    if (!url) throw new AppError('这个作品没有背景音乐', 404);

    await streamMedia(req, res, url, musicName(detail), `clip-${id}-music.mp3`);
  }),
);

app.get(
  '/api/download/cover',
  route(async (req, res) => {
    const id = validateId(req.query.id);
    const detail = await fetchDetail(id);
    const url =
      pickUrl(detail.video?.cover) ||
      pickUrl(detail.video?.origin_cover) ||
      pickUrl(detail.video?.dynamic_cover) ||
      pickImageUrl(detail.images?.[0]);
    if (!url) throw new AppError('这个作品没有封面', 404);

    const ext = extFromUrl(url);
    const filename = coverName(detail).replace(/\.jpg$/, `.${ext}`);
    await streamMedia(req, res, url, filename, `clip-${id}-cover.${ext}`);
  }),
);

app.get(
  '/api/download/video',
  route(async (req, res) => {
    const id = validateId(req.query.id);
    const quality = typeof req.query.quality === 'string' ? req.query.quality : 'original';
    if (!/^(original|gear-\d{1,3})$/.test(quality)) {
      throw new AppError('画质参数不正确', 400);
    }

    const detail = await fetchDetail(id);
    const source = await resolveVideoSource(id, quality);
    const label = qualityLabel(detail, quality);
    const filename = videoName(detail, label);
    const fallback = `clip-${id}-${quality.replace(/[^a-z0-9-]/gi, '')}.mp4`;

    await streamMedia(req, res, source, filename, fallback);
  }),
);

app.get(
  '/api/download/image',
  route(async (req, res) => {
    const id = validateId(req.query.id);
    const index = Number(req.query.index);
    if (!Number.isInteger(index) || index < 0) {
      throw new AppError('图片序号不正确', 400);
    }

    const detail = await fetchDetail(id);
    const image = await getImage(id, index);
    const filename = imageName(detail, index, image.ext);
    const fallback = `clip-${id}-${index + 1}.${image.ext}`;

    res.setHeader('Content-Type', image.contentType);
    res.setHeader('Content-Length', image.buffer.length);
    res.setHeader('Content-Disposition', contentDisposition(filename, fallback));
    res.setHeader('Cache-Control', 'no-store');
    res.end(image.buffer);
  }),
);

app.get(
  '/api/download/images',
  route(async (req, res) => {
    const id = validateId(req.query.id);
    const detail = await fetchDetail(id);
    const images = Array.isArray(detail.images) ? detail.images : [];
    if (!images.length) throw new AppError('这个作品没有图片', 404);

    let indices;
    if (typeof req.query.indices === 'string' && req.query.indices.trim()) {
      indices = [
        ...new Set(
          req.query.indices
            .split(',')
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value >= 0 && value < images.length),
        ),
      ].sort((a, b) => a - b);
    } else {
      indices = images.map((_, index) => index);
    }
    if (!indices.length) throw new AppError('没有选择要下载的图片', 400);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', contentDisposition(zipName(detail), `clip-${id}-images.zip`));
    res.setHeader('Cache-Control', 'no-store');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('warning', () => {});
    archive.on('error', (error) => {
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: '打包失败，请稍后重试' });
      } else {
        res.destroy(error);
      }
    });
    archive.pipe(res);

    const errors = [];
    for (const index of indices) {
      try {
        const image = await getImage(id, index);
        archive.append(image.buffer, { name: imageName(detail, index, image.ext) });
        try {
          const live = await getLiveVideo(id, index);
          archive.append(live.buffer, { name: liveName(detail, index) });
        } catch (liveError) {
          if (liveError.status !== 404) {
            errors.push(`#${index + 1} 实况: ${liveError.message}`);
          }
        }
      } catch (error) {
        errors.push(`#${index + 1}: ${error.message}`);
      }
    }

    if (errors.length) {
      archive.append(errors.join('\n'), { name: '_errors.txt' });
    }

    await archive.finalize();
  }),
);

const dist = path.join(__dirname, '..', 'dist');

app.get('/sw.js', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Service-Worker-Allowed', '/');
  res.sendFile(path.join(dist, 'sw.js'), (error) => {
    if (error) next(error);
  });
});

app.get('/manifest.webmanifest', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(dist, 'manifest.webmanifest'), (error) => {
    if (error) next(error);
  });
});

app.use('/assets', express.static(path.join(dist, 'assets'), { maxAge: '1y', immutable: true }));
app.use(express.static(dist, { index: false, maxAge: '1h' }));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/assets/')) {
    next();
    return;
  }
  res.sendFile(
    path.join(dist, 'index.html'),
    { headers: { 'Cache-Control': 'no-cache' } },
    (error) => {
      if (error) next(error);
    },
  );
});

app.use((error, req, res, _next) => {
  if (res.headersSent) {
    res.destroy(error);
    return;
  }

  let status = error instanceof AppError ? error.status : 500;
  let message =
    error instanceof AppError && error.expose ? error.message : '服务暂时不可用，请稍后重试';

  if (error?.type === 'entity.too.large') {
    status = 413;
    message = '粘贴的内容太长了';
  } else if (error?.type === 'entity.parse.failed') {
    status = 400;
    message = '请求格式不正确';
  }

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.path}: ${error.message}`);
  }
  res.status(status).json({ ok: false, error: message });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`ClipNest listening on http://${HOST}:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  });
}
