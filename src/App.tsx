import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
} from 'react';
import {
  hasShareLink,
  imageDownloadUrl,
  imagesZipUrl,
  parseLink,
  preflightVideo,
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
  SparkIcon,
  XIcon,
} from './components/Icons';

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

  const toastTimer = useRef<number | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const hasLink = useMemo(() => hasShareLink(text), [text]);

  useEffect(() => {
    if (!result) return;
    const timer = window.setTimeout(() => {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [result]);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
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
    const url = videoDownloadUrl(result.awemeId, quality);
    try {
      await preflightVideo(url);
      triggerDownload(url);
      showToast('已开始下载视频');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '下载失败，请稍后重试');
    } finally {
      window.setTimeout(() => setBusy(null), 800);
    }
  };

  const downloadImage = (index: number) => {
    if (!result) return;
    triggerDownload(imageDownloadUrl(result.awemeId, index));
    showToast(`已开始下载第 ${index + 1} 张`);
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

  const reset = () => {
    setResult(null);
    setText('');
    setError(null);
    setSelected(new Set());
    setQuality('original');
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
            <DownloadIcon /> 原画下载
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
              onDownloadImage={downloadImage}
              onDownloadSelected={downloadSelected}
              onDownloadAll={downloadAll}
              busy={busy}
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
    </div>
  );
}
