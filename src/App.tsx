import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
} from 'react';
import {
  DIRECT_LIMIT,
  SHARE_LIMIT,
  canShareFiles,
  copyText,
  coverDownloadUrl,
  downloadDirect,
  fetchMediaFile,
  fetchVideoLink,
  hasShareLink,
  imageDownloadUrl,
  imagesZipUrl,
  liveDownloadUrl,
  musicDownloadUrl,
  parseLink,
  shareFiles,
  triggerDownload,
  videoDownloadUrl,
} from './api';
import type { ParseResult } from './types';
import { ResultCard, type Busy } from './components/ResultCard';
import {
  AlertIcon,
  ArrowRightIcon,
  CheckIcon,
  ClipboardIcon,
  DownloadIcon,
  ImageIcon,
  LinkIcon,
  ShareIcon,
  SparkIcon,
  XIcon,
} from './components/Icons';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function Skeleton() {
  return (
    <section className="skeleton-card" aria-hidden="true">
      <div className="skeleton skeleton-cover" />
      <div className="skeleton-lines">
        <div className="skeleton skeleton-line w60" />
        <div className="skeleton skeleton-line w90" />
        <div className="skeleton skeleton-line w40" />
      </div>
    </section>
  );
}

export default function App() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<ParseResult | null>(null);
  const [quality, setQuality] = useState('original');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingShare, setPendingShare] = useState<{ files: File[]; title: string } | null>(
    null,
  );
  const [directLink, setDirectLink] = useState<{ url: string; filename: string } | null>(null);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosInstall, setShowIosInstall] = useState(false);

  const toastTimer = useRef<number | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const hasLink = useMemo(() => hasShareLink(text), [text]);
  const shareSupported = useMemo(() => canShareFiles(), []);

  useEffect(() => {
    if (!result) return;
    const timer = window.setTimeout(() => {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [result]);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const dismissed = localStorage.getItem('clipnest-ios-install-dismissed') === '1';
    if (isIos && !standalone && !dismissed) setShowIosInstall(true);
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  };

  const parseText = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError('先粘贴分享文案或链接');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setBusy(null);

    try {
      const data = await parseLink(trimmed);
      setResult(data);
      setQuality(data.qualities[0]?.id || 'original');
      setSelected(new Set(data.images.map((image) => image.index)));
    } catch (err) {
      setError(err instanceof Error ? err.message : '解析失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (window.location.pathname !== '/share') return;
    const params = new URLSearchParams(window.location.search);
    const shared = [params.get('title'), params.get('text'), params.get('url')]
      .filter(Boolean)
      .join(' ')
      .trim();
    window.history.replaceState({}, '', '/');
    if (shared) {
      setText(shared);
      void parseText(shared);
    }
    // The share target only needs to run once on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void parseText(text);
  };

  const handlePaste = async () => {
    try {
      if (!navigator.clipboard?.readText) throw new Error('unsupported');
      const clip = await navigator.clipboard.readText();
      if (!clip.trim()) {
        showToast('剪贴板是空的');
        inputRef.current?.focus();
        return;
      }
      setText(clip);
      setError(null);
      if (hasShareLink(clip)) {
        showToast('已识别链接，正在解析');
        await parseText(clip);
      } else {
        showToast('已粘贴，但没有识别到链接');
        inputRef.current?.focus();
      }
    } catch {
      showToast('无法读取剪贴板，请长按输入框手动粘贴');
      inputRef.current?.focus();
    }
  };

  const handleTextPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = event.clipboardData.getData('text');
    if (pasted && hasShareLink(pasted)) {
      window.setTimeout(() => {
        void parseText(pasted);
      }, 120);
    }
  };

  const toggleImage = (index: number) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleAll = () => {
    if (!result) return;
    setSelected((previous) => {
      const all = result.images.every((image) => previous.has(image.index));
      return all ? new Set() : new Set(result.images.map((image) => image.index));
    });
  };

  const downloadVideo = async () => {
    if (!result) return;
    setBusy('video');
    try {
      const link = await fetchVideoLink(result.awemeId, quality);
      const tooLarge = link.size > DIRECT_LIMIT || (link.original && !link.size);
      if (tooLarge) {
        try {
          await copyText(link.url);
          showToast('文件较大，直链已复制，可用下载管理器保存');
        } catch {
          setDirectLink({ url: link.url, filename: link.filename });
        }
        return;
      }
      await downloadDirect(link.url, link.filename);
      showToast('直链下载已开始');
    } catch (err) {
      triggerDownload(videoDownloadUrl(result.awemeId, quality));
      showToast(err instanceof Error ? `${err.message}，已切换 NAS 中转` : '已切换 NAS 中转');
    } finally {
      window.setTimeout(() => setBusy(null), 800);
    }
  };

  const copyVideoLink = async () => {
    if (!result) return;
    try {
      const link = await fetchVideoLink(result.awemeId, quality);
      try {
        await copyText(link.url);
        showToast('直链已复制');
      } catch {
        setDirectLink({ url: link.url, filename: link.filename });
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '直链获取失败');
    }
  };

  const attemptShare = async (files: File[], title: string) => {
    try {
      await shareFiles(files, title);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        showToast('已取消');
        return;
      }
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setPendingShare({ files, title });
        showToast('文件已准备好，点“打开系统分享”保存到相册');
        return;
      }
      throw err;
    }
  };

  const saveVideoAlbum = async () => {
    if (!result) return;
    setBusy('album');
    try {
      const link = await fetchVideoLink(result.awemeId, quality);
      if (link.original && (!link.size || link.size > SHARE_LIMIT)) {
        throw new Error('原画文件较大，建议使用下载或复制直链');
      }
      if (link.size > SHARE_LIMIT) {
        throw new Error('文件超过 60MB，建议使用下载或复制直链');
      }
      const file = await fetchMediaFile(link.url, link.filename, link.contentType || 'video/mp4');
      await attemptShare([file], link.filename);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存到相册失败');
    } finally {
      window.setTimeout(() => setBusy(null), 600);
    }
  };

  const downloadImage = async (index: number) => {
    if (!result) return;
    const image = result.images.find((item) => item.index === index);
    if (!image) return;
    try {
      await downloadDirect(image.directUrl, image.filename);
      showToast(`第 ${index + 1} 张已开始下载`);
    } catch {
      triggerDownload(imageDownloadUrl(result.awemeId, index), image.filename);
      showToast(`第 ${index + 1} 张已切换 NAS 下载`);
    }
  };

  const downloadLive = async (index: number) => {
    if (!result) return;
    const image = result.images.find((item) => item.index === index);
    if (!image?.liveUrl) return;
    try {
      await downloadDirect(image.liveUrl, image.liveFilename);
      showToast('实况视频已开始下载');
    } catch {
      triggerDownload(liveDownloadUrl(result.awemeId, index), image.liveFilename);
      showToast('实况视频已切换 NAS 下载');
    }
  };

  const saveImageAlbum = async (index: number) => {
    if (!result) return;
    const image = result.images.find((item) => item.index === index);
    if (!image) return;
    setBusy('album');
    try {
      const type =
        image.ext === 'webp' ? 'image/webp' : image.ext === 'png' ? 'image/png' : 'image/jpeg';
      const file = await fetchMediaFile(image.directUrl, image.filename, type);
      await attemptShare([file], image.filename);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存到相册失败');
    } finally {
      window.setTimeout(() => setBusy(null), 600);
    }
  };

  const saveSelectedAlbum = async () => {
    if (!result || !selected.size) return;
    const images = result.images.filter((image) => selected.has(image.index));
    if (images.length > 9) {
      showToast('一次最多保存 9 张，请分批保存');
      return;
    }
    setBusy('album');
    try {
      const files = await Promise.all(
        images.map((image) => {
          const type =
            image.ext === 'webp'
              ? 'image/webp'
              : image.ext === 'png'
                ? 'image/png'
                : 'image/jpeg';
          return fetchMediaFile(image.directUrl, image.filename, type);
        }),
      );
      const total = files.reduce((sum, file) => sum + file.size, 0);
      if (total > SHARE_LIMIT) {
        throw new Error('选中的图片超过 60MB，请分批保存');
      }
      await attemptShare(files, `${result.baseName}-图片`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存到相册失败');
    } finally {
      window.setTimeout(() => setBusy(null), 600);
    }
  };

  const downloadSelected = () => {
    if (!result || !selected.size) return;
    setBusy('selected');
    triggerDownload(imagesZipUrl(result.awemeId, [...selected].sort((a, b) => a - b)));
    showToast(`正在打包 ${selected.size} 张图片`);
    window.setTimeout(() => setBusy(null), 3000);
  };

  const downloadAll = () => {
    if (!result) return;
    setBusy('all');
    triggerDownload(imagesZipUrl(result.awemeId));
    showToast('正在打包全部图片');
    window.setTimeout(() => setBusy(null), 3000);
  };

  const downloadMusic = async () => {
    if (!result?.music?.url) return;
    try {
      await downloadDirect(result.music.url, result.music.filename);
      showToast('背景音乐已开始下载');
    } catch {
      triggerDownload(musicDownloadUrl(result.awemeId), result.music.filename);
      showToast('背景音乐已切换 NAS 下载');
    }
  };

  const downloadCover = async () => {
    if (!result?.cover) return;
    try {
      await downloadDirect(result.cover, result.coverFilename);
      showToast('封面已开始下载');
    } catch {
      triggerDownload(coverDownloadUrl(result.awemeId), result.coverFilename);
      showToast('封面已切换 NAS 下载');
    }
  };

  const saveInfo = () => {
    if (!result) return;
    const payload = { ...result, savedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `${result.baseName}-信息.json`);
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    showToast('作品信息已保存');
  };

  const openPendingShare = async () => {
    if (!pendingShare) return;
    try {
      await shareFiles(pendingShare.files, pendingShare.title);
      setPendingShare(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setPendingShare(null);
        showToast('已取消');
        return;
      }
      showToast(err instanceof Error ? err.message : '打开系统分享失败');
    }
  };

  const installApp = async () => {
    if (!installEvent) return;
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === 'accepted') showToast('已开始安装');
    } catch {
      showToast('安装提示不可用，请用浏览器菜单添加到主屏幕');
    } finally {
      setInstallEvent(null);
    }
  };

  const dismissIosInstall = () => {
    localStorage.setItem('clipnest-ios-install-dismissed', '1');
    setShowIosInstall(false);
  };

  const reset = () => {
    setResult(null);
    setText('');
    setError(null);
    setSelected(new Set());
    setQuality('original');
    setPendingShare(null);
    setDirectLink(null);
    window.setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <SparkIcon />
          </span>
          <span className="brand-name">ClipNest</span>
        </div>
        <span className="topbar-note">自托管 · 个人使用</span>
      </header>

      {installEvent ? (
        <div className="install-banner">
          <span>
            <DownloadIcon /> 安装到主屏幕，像 App 一样使用
          </span>
          <button type="button" className="text-btn" onClick={() => void installApp()}>
            安装
          </button>
          <button
            type="button"
            className="icon-btn install-close"
            aria-label="关闭"
            onClick={() => setInstallEvent(null)}
          >
            <XIcon />
          </button>
        </div>
      ) : showIosInstall ? (
        <div className="install-banner">
          <span>
            <ShareIcon /> Safari 分享 → 添加到主屏幕
          </span>
          <button
            type="button"
            className="icon-btn install-close"
            aria-label="关闭"
            onClick={dismissIosInstall}
          >
            <XIcon />
          </button>
        </div>
      ) : null}

      <main>
        <section className="hero">
          <h1>
            把喜欢的作品，
            <br />
            <em>留在本地。</em>
          </h1>
          <p>粘贴分享文案，自动识别链接。视频与图文，一次保存。</p>
        </section>

        <form className="input-card" onSubmit={handleSubmit}>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              if (error) setError(null);
            }}
            onPaste={handleTextPaste}
            maxLength={4000}
            rows={4}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="粘贴分享文案或链接…"
            aria-label="分享文案或链接"
          />

          <div className="input-meta">
            <span className={`detect ${hasLink ? 'ok' : ''}`}>
              {hasLink ? (
                <>
                  <CheckIcon /> 已识别链接
                </>
              ) : (
                '支持分享文案自动识别'
              )}
            </span>
            <span className="counter">{text.length}/4000</span>
          </div>

          <div className="input-actions">
            <button type="button" className="ghost-btn" onClick={handlePaste}>
              <ClipboardIcon /> 粘贴
            </button>
            {text ? (
              <button
                type="button"
                className="icon-btn"
                aria-label="清空"
                onClick={() => {
                  setText('');
                  setError(null);
                  inputRef.current?.focus();
                }}
              >
                <XIcon />
              </button>
            ) : null}
            <button type="submit" className="primary-btn" disabled={loading || !text.trim()}>
              {loading ? (
                <>
                  <span className="spinner" /> 解析中
                </>
              ) : (
                <>
                  <ArrowRightIcon /> 解析
                </>
              )}
            </button>
          </div>

          {error ? (
            <div className="inline-error" role="alert">
              <AlertIcon /> {error}
            </div>
          ) : null}
        </form>

        <div className="feature-row">
          <span>
            <SparkIcon /> 自动识别
          </span>
          <span>
            <ImageIcon /> 视频 / 图文
          </span>
          <span>
            <DownloadIcon /> 直链下载
          </span>
        </div>

        {loading ? <Skeleton /> : null}

        <div ref={resultRef}>
          {result ? (
            <ResultCard
              result={result}
              quality={quality}
              onQuality={setQuality}
              selected={selected}
              onToggle={toggleImage}
              onToggleAll={toggleAll}
              onDownloadVideo={() => void downloadVideo()}
              onCopyVideoLink={() => void copyVideoLink()}
              onSaveVideoAlbum={() => void saveVideoAlbum()}
              onDownloadImage={(index) => void downloadImage(index)}
              onSaveImageAlbum={(index) => void saveImageAlbum(index)}
              onDownloadLive={(index) => void downloadLive(index)}
              onSaveSelectedAlbum={() => void saveSelectedAlbum()}
              onDownloadMusic={() => void downloadMusic()}
              onDownloadCover={() => void downloadCover()}
              onSaveInfo={saveInfo}
              onDownloadSelected={downloadSelected}
              onDownloadAll={downloadAll}
              busy={busy}
              shareSupported={shareSupported}
              onReset={reset}
            />
          ) : null}
        </div>
      </main>

      <footer className="footer">
        <p>仅用于保存你拥有权利的内容。请遵守源平台条款与当地法律。</p>
        <p className="footer-dim">ClipNest · 不存储任何第三方内容</p>
      </footer>

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}

      {pendingShare ? (
        <div className="modal-backdrop" onClick={() => setPendingShare(null)}>
          <div
            className="share-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="share-modal-title">文件已准备好</h3>
            <p>点下面按钮打开系统分享，然后选择“存储图像”或“存储视频”。</p>
            <button type="button" className="download-btn" onClick={() => void openPendingShare()}>
              <ShareIcon /> 打开系统分享
            </button>
            <button type="button" className="text-btn" onClick={() => setPendingShare(null)}>
              取消
            </button>
          </div>
        </div>
      ) : null}

      {directLink ? (
        <div className="modal-backdrop" onClick={() => setDirectLink(null)}>
          <div
            className="share-modal direct-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="direct-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="direct-modal-title">直链已准备好</h3>
            <p>文件较大，建议用下载管理器保存。也可以手动复制下面的直链。</p>
            <textarea
              className="direct-link-input"
              readOnly
              value={directLink.url}
              onFocus={(event) => event.currentTarget.select()}
            />
            <button
              type="button"
              className="download-btn"
              onClick={async () => {
                try {
                  await copyText(directLink.url);
                  showToast('直链已复制');
                  setDirectLink(null);
                } catch {
                  showToast('复制失败，请长按选择文本');
                }
              }}
            >
              <LinkIcon /> 复制直链
            </button>
            <button type="button" className="text-btn" onClick={() => setDirectLink(null)}>
              关闭
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
