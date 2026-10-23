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
  directUrl: string;
  filename: string;
};

export type ImageItem = {
  index: number;
  url: string;
  directUrl: string;
  filename: string;
  width: number;
  height: number;
  ext: string;
  liveUrl: string;
  liveDuration: number;
  liveFilename: string;
};

export type Music = {
  title: string;
  author: string;
  url: string;
  cover: string;
  filename: string;
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
  baseName: string;
  cover: string;
  coverFilename: string;
  createdAt: number;
  isLive: boolean;
  duration: number;
  stats: Stats;
  qualities: Quality[];
  images: ImageItem[];
  music: Music | null;
};
