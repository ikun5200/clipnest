import type { ParseResult } from '../types';
import { formatCount, formatDuration, formatSize } from '../format';
import {
  CheckIcon,
  CommentIcon,
  DownloadIcon,
  HeartIcon,
  ImageIcon,
  InfoIcon,
  LinkIcon,
  MusicIcon,
  PlayIcon,
  ShareIcon,
  SparkIcon,
  StarIcon,
  VideoIcon,
} from './Icons';

export type Busy = 'video' | 'selected' | 'all' | 'album' | null;

type Props = {
  result: ParseResult;
  quality: string;
  onQuality: (id: string) => void;
  selected: Set<number>;
  onToggle: (index: number) => void;
  onToggleAll: () => void;
  onDownloadVideo: () => void;
  onCopyVideoLink: () => void;
  onSaveVideoAlbum: () => void;
  onDownloadImage: (index: number) => void;
  onSaveImageAlbum: (index: number) => void;
  onDownloadLive: (index: number) => void;
  onSaveSelectedAlbum: () => void;
  onDownloadMusic: () => void;
  onDownloadCover: () => void;
  onSaveInfo: () => void;
  onDownloadSelected: () => void;
  onDownloadAll: () => void;
  busy: Busy;
  shareSupported: boolean;
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
  onCopyVideoLink,
  onSaveVideoAlbum,
  onDownloadImage,
  onSaveImageAlbum,
  onDownloadLive,
  onSaveSelectedAlbum,
  onDownloadMusic,
  onDownloadCover,
  onSaveInfo,
  onDownloadSelected,
  onDownloadAll,
  busy,
  shareSupported,
  onReset,
}: Props) {
  const isVideo = result.type === 'video';
  const currentQuality = result.qualities.find((item) => item.id === quality) || result.qualities[0];
  const allSelected =
    result.images.length > 0 && result.images.every((image) => selected.has(image.index));
  const albumHint = shareSupported
    ? '保存到相册会打开系统分享，选择“存储图像/视频”即可。'
    : '当前浏览器不支持直接保存到相册，请使用下载；需要 HTTPS 和支持文件分享的浏览器。';

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
          {result.isLive ? <PlayIcon /> : isVideo ? <VideoIcon /> : <ImageIcon />}
          {result.isLive ? '实况' : isVideo ? '视频' : '图文'}
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
          <span className="author-kind">
            {result.isLive ? '实况作品' : isVideo ? '视频作品' : `${result.images.length} 张图片`}
          </span>
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

        <div className="extras">
          {result.music?.url ? (
            <button
              type="button"
              className="extra-btn"
              onClick={onDownloadMusic}
              title={`${result.music.title}${result.music.author ? ` · ${result.music.author}` : ''}`}
            >
              <MusicIcon /> 背景音乐
            </button>
          ) : null}
          {result.cover ? (
            <button type="button" className="extra-btn" onClick={onDownloadCover}>
              <ImageIcon /> 封面
            </button>
          ) : null}
          <button type="button" className="extra-btn" onClick={onSaveInfo}>
            <InfoIcon /> 保存信息
          </button>
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

          <div className="share-row">
            <button
              type="button"
              className="secondary-btn"
              onClick={onSaveVideoAlbum}
              disabled={busy !== null || !shareSupported}
              title={albumHint}
            >
              {busy === 'album' ? (
                <>
                  <span className="spinner" /> 准备中…
                </>
              ) : (
                <>
                  <ShareIcon /> 保存到相册
                </>
              )}
            </button>
            <button type="button" className="ghost-btn share-link-btn" onClick={onCopyVideoLink}>
              <LinkIcon /> 复制直链
            </button>
          </div>
          <p className="fineprint">
            普通画质直连源站，不经过 NAS；大文件会复制直链，可用下载管理器保存；直链失败时回退
            NAS。{albumHint}
          </p>
        </div>
      ) : (
        <div className="panel">
          <div className="panel-head">
            <h3>
              共 {result.images.length} 张{result.isLive ? ' · 含实况' : ''}
            </h3>
            <button type="button" className="text-btn" onClick={onToggleAll}>
              {allSelected ? '取消全选' : '全选'}
            </button>
          </div>

          <div className="image-grid">
            {result.images.map((image) => {
              const isSelected = selected.has(image.index);
              const isLive = Boolean(image.liveUrl);
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
                  <div className="image-actions">
                    {shareSupported ? (
                      <button
                        type="button"
                        className="image-action"
                        aria-label={`保存第 ${image.index + 1} 张到相册`}
                        disabled={busy !== null}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSaveImageAlbum(image.index);
                        }}
                      >
                        <ShareIcon />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="image-action"
                      aria-label={`下载第 ${image.index + 1} 张`}
                      disabled={busy !== null}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDownloadImage(image.index);
                      }}
                    >
                      <DownloadIcon />
                    </button>
                    {isLive ? (
                      <button
                        type="button"
                        className="image-action"
                        aria-label={`下载第 ${image.index + 1} 张实况视频`}
                        disabled={busy !== null}
                        onClick={(event) => {
                          event.stopPropagation();
                          onDownloadLive(image.index);
                        }}
                      >
                        <PlayIcon />
                      </button>
                    ) : null}
                  </div>
                  {isLive ? <span className="live-badge">实况</span> : null}
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
              onClick={onSaveSelectedAlbum}
              disabled={!shareSupported || !selected.size || busy !== null}
              title={albumHint}
            >
              {busy === 'album' ? (
                <>
                  <span className="spinner" /> 准备中…
                </>
              ) : (
                <>
                  <ShareIcon /> 保存选中到相册
                </>
              )}
            </button>
          </div>
          <button
            type="button"
            className="ghost-wide"
            onClick={onDownloadAll}
            disabled={busy !== null}
          >
            {busy === 'all' ? (
              <>
                <span className="spinner" /> 打包中…
              </>
            ) : (
              <>
                <DownloadIcon /> 全部下载 ZIP
              </>
            )}
          </button>
          <p className="fineprint">
            单张图片直连源站；ZIP 由 NAS 打包。{albumHint}
          </p>
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
