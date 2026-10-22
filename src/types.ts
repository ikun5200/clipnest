export type Quality = {
  id: string;
  label: string;
  hint?: string;
  width: number;
  height: number;
  size: number;
  codec: string;
  bitrate: number;
  fps?: number;
};

export type ImageItem = {
  index: number;
  url: string;
  width: number;
  height: number;
  ext: string;
};

export type Stats = {
  play: number;
  like: number;
  comment: number;
  share: number;
  collect: number;
};

export type ParseResult = {
  type: 'video' | 'images';
  awemeId: string;
  sourceUrl: string;
  author: string;
  avatar: string;
  title: string;
  cover: string;
  duration: number;
  stats: Stats;
  qualities: Quality[];
  images: ImageItem[];
  music: { url: string; title: string } | null;
};
