import type { ParseResult } from '../types';
import { formatCount, formatDuration, formatSize } from '../format';
import {
  CheckIcon,
  CommentIcon,
  DownloadIcon,
  HeartIcon,
  ImageIcon,
  PlayIcon,
  SparkIcon,
  StarIcon,
  VideoIcon,
} from './Icons';

export type Busy = 'video' | 'selected' | 'all' | null;

type Props = {
  result: ParseResult;
  quality: string;
  onQuality: (id: string) => void;
  selected: Set<number>;
  onToggle: (index: number) => void;
  onToggleAll: () => void;
  onDownloadVideo: () => void;
  onDownloadImage: (index: number) => void;
  onDownloadSelected: () => void;
  onDownloadAll: () => void;
  busy: Busy;
  onReset: () => void;
};

export function ResultCard({
  result,
  quality,
  onQuality,
  selected,
  onToggle,
  onToggleAll,
  onDownloadVideo,
  onDownloadImage,
  onDownloadSelected,
  onDownloadAll,
  busy,
  onReset,
}: Props) {
  const isVideo = result.type === 'video';
  const currentQuality = result.qualities.find((item) => item.id === quality) || result.qualities[0];
  const allSelected =
    result.images.length > 0 && result.images.every((image) => selected.has(image.index));

  return (
    <section className="result-card" aria-label="解析结果">
      <div className={`cover ${isVideo ? 'is-video' : 'is-images'}`}>
        {result.cover ? (
          <img src={result.cover} alt="" referrerPolicy="no-referrer" />
        ) : (
          <div className="cover-fallback">
            <SparkIcon />
          </div>
        )}
        <span className="type-badge">
          {isVideo ? <VideoIcon /> : <ImageIcon />}
          {isVideo ? '视频' : '图文'}
        </span>
        {isVideo && result.duration > 0 ? (
          <span className="duration-badge">{formatDuration(result.duration)}</span>
        ) : null}
      </div>

      <div className="result-meta">
        <div className="author-line">
          {result.avatar ? (
            <img className="avatar" src={result.avatar} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="avatar avatar-fallback">{result.author.slice(0, 1)}</span>
          )}
          <span className="author-name">{result.author}</span>
          <span className="author-dot">·</span>
          <span className="author-kind">{isVideo ? '视频作品' : `${result.images.length} 张图片`}</span>
        </div>

        <h2 className="result-title">{result.title}</h2>

        <div className="stats">
          {isVideo ? (
            <span title="播放量">
              <PlayIcon />
              {result.stats.play > 0 ? formatCount(result.stats.play) : '—'}
            </span>
          ) : null}
          <span title="点赞">
            <HeartIcon />
            {formatCount(result.stats.like)}
          </span>
          <span title="评论">
            <CommentIcon />
            {formatCount(result.stats.comment)}
          </span>
          <span title="收藏">
            <StarIcon />
            {formatCount(result.stats.collect)}
          </span>
        </div>
      </div>

      {isVideo ? (
        <div className="panel">
          <div className="panel-head">
            <h3>选择画质</h3>
            <span className="panel-note">
              {currentQuality?.width && currentQuality?.height
                ? `${currentQuality.width}×${currentQuality.height}`
                : '原始文件'}
              {currentQuality?.fps ? ` · ${currentQuality.fps}fps` : ''}
            </span>
          </div>

          <div className="quality-grid">
            {result.qualities.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`quality ${quality === item.id ? 'active' : ''}`}
                onClick={() => onQuality(item.id)}
              >
                <span className="quality-top">
                  <span className="quality-label">{item.label}</span>
                  {quality === item.id ? <CheckIcon /> : null}
                </span>
                <span className="quality-sub">
                  {item.hint}
                  {item.size > 0 ? ` · ${formatSize(item.size)}` : ''}
                </span>
                <span className="quality-codec">
                  {item.codec}
                  {item.bitrate > 0 ? ` · ${item.bitrate} kbps` : ''}
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            className="download-btn"
            onClick={onDownloadVideo}
            disabled={busy !== null || !currentQuality}
          >
            {busy === 'video' ? (
              <>
                <span className="spinner" /> 正在准备…
              </>
            ) : (
              <>
                <DownloadIcon /> 下载视频
              </>
            )}
          </button>
          <p className="fineprint">原画为原始码率，文件可能较大；下载速度取决于源站。</p>
        </div>
      ) : (
        <div className="panel">
          <div className="panel-head">
            <h3>共 {result.images.length} 张</h3>
            <button type="button" className="text-btn" onClick={onToggleAll}>
              {allSelected ? '取消全选' : '全选'}
            </button>
          </div>

          <div className="image-grid">
            {result.images.map((image) => {
              const isSelected = selected.has(image.index);
              return (
                <div
                  key={image.index}
                  className={`image-cell ${isSelected ? 'selected' : ''}`}
                  role="checkbox"
                  aria-checked={isSelected}
                  aria-label={`第 ${image.index + 1} 张图片`}
                  tabIndex={0}
                  onClick={() => onToggle(image.index)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onToggle(image.index);
                    }
                  }}
                >
                  <img
                    src={image.url}
                    alt={`第 ${image.index + 1} 张`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                  <span className="image-check">{isSelected ? <CheckIcon /> : null}</span>
                  <span className="image-index">{image.index + 1}</span>
                  <button
                    type="button"
                    className="image-download"
                    aria-label={`下载第 ${image.index + 1} 张`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDownloadImage(image.index);
                    }}
                  >
                    <DownloadIcon />
                  </button>
                  <span className="image-dims">
                    {image.width && image.height ? `${image.width}×${image.height}` : ''}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="action-row">
            <button
              type="button"
              className="secondary-btn"
              onClick={onDownloadSelected}
              disabled={!selected.size || busy !== null}
            >
              {busy === 'selected' ? (
                <>
                  <span className="spinner" /> 打包中…
                </>
              ) : (
                <>
                  <DownloadIcon /> 下载选中 ({selected.size})
                </>
              )}
            </button>
            <button
              type="button"
              className="download-btn"
              onClick={onDownloadAll}
              disabled={busy !== null}
            >
              {busy === 'all' ? (
                <>
                  <span className="spinner" /> 打包中…
                </>
              ) : (
                <>
                  <DownloadIcon /> 全部下载
                </>
              )}
            </button>
          </div>
          <p className="fineprint">全部下载会打包为 ZIP；点击右上角图标可单独下载一张。</p>
        </div>
      )}

      <div className="result-footer">
        <button type="button" className="text-btn" onClick={onReset}>
          解析另一个
        </button>
        <span className="result-id">ID {result.awemeId}</span>
      </div>
    </section>
  );
}
