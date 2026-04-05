import { useCanvasStore, CanvasBlock } from '@/store/canvasStore';
import { ImageIcon, Play, Pause, Volume2, VolumeX, FileText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';

function normalizeUrl(raw: string) {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (/^(blob:|data:|file:)/i.test(trimmed)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'svg', 'gif', 'apng', 'bmp', 'ico', 'heic', 'heif', 'heiv', 'tif', 'tiff', 'jfif'];
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogv', 'mov', 'm3u8', 'm4v', 'avi', 'wmv', 'flv', 'mkv', '3gp', 'ts', 'mts', 'm2ts', 'gifv'];
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'aac', 'flac', 'm4a', 'oga', 'ogg', 'opus', 'aiff', 'alac', 'amr', 'wma', 'weba', 'mpga', 'mid', 'midi'];
const PDF_EXTENSIONS = ['pdf'];

function extFromUrl(url: string) {
  const cleaned = url.split('#')[0].split('?')[0];
  const lastDot = cleaned.lastIndexOf('.');
  if (lastDot < 0) return '';
  return cleaned.slice(lastDot + 1).toLowerCase();
}

function isVideo(url: string, blobKind: 'unknown' | 'video' | 'image' | 'audio' | 'pdf') {
  if (/^blob:/i.test(url)) return blobKind === 'video';
  const ext = extFromUrl(url);
  if (VIDEO_EXTENSIONS.includes(ext)) return true;
  return /(^|[/?=&_-])(video|stream|clip|movie)([/?=&_-]|$)/i.test(url);
}

function isImage(url: string, blobKind: 'unknown' | 'video' | 'image' | 'audio' | 'pdf') {
  if (/^blob:/i.test(url)) return blobKind === 'image';
  const ext = extFromUrl(url);
  return IMAGE_EXTENSIONS.includes(ext);
}

function isGif(url: string, blobKind: 'unknown' | 'video' | 'image' | 'audio' | 'pdf') {
  if (/^blob:/i.test(url)) return false;
  return blobKind !== 'video' && /\.gif(\?|$)/i.test(url);
}

function isAudio(url: string, blobKind: 'unknown' | 'video' | 'image' | 'audio' | 'pdf') {
  if (/^blob:/i.test(url)) return blobKind === 'audio';
  const ext = extFromUrl(url);
  if (AUDIO_EXTENSIONS.includes(ext)) return true;
  return /(^|[/?=&_-])(audio|podcast|music|sound|voice)([/?=&_-]|$)/i.test(url);
}

function isPdf(url: string, blobKind: 'unknown' | 'video' | 'image' | 'audio' | 'pdf') {
  if (/^blob:/i.test(url)) return blobKind === 'pdf';
  if (/^data:application\/pdf/i.test(url)) return true;
  const ext = extFromUrl(url);
  if (PDF_EXTENSIONS.includes(ext)) return true;
  return /(^|[/?=&_-])(pdf)([/?=&_.-]|$)/i.test(url);
}

function toEmbedUrl(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();

    if (host.includes('youtube.com')) {
      const id = u.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}?autoplay=1&mute=0&loop=1&playlist=${id}&rel=0&playsinline=1` : '';
    }
    if (host.includes('youtu.be')) {
      const id = u.pathname.replace('/', '');
      return id ? `https://www.youtube.com/embed/${id}?autoplay=1&mute=0&loop=1&playlist=${id}&rel=0&playsinline=1` : '';
    }
    if (host.includes('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}?autoplay=1&muted=0&loop=1&autopause=0` : '';
    }

    if (host.includes('twitter.com') || host.includes('x.com')) {
      return `https://twitframe.com/show?url=${encodeURIComponent(url)}`;
    }

    if (host.includes('instagram.com')) {
      const p = u.pathname.replace(/\/$/, '');
      if (p.includes('/p/') || p.includes('/reel/') || p.includes('/tv/')) {
        return `${u.origin}${p}/embed`;
      }
    }

    if (host.includes('t.me') || host.includes('telegram.me')) {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        return `https://t.me/${parts[0]}/${parts[1]}?embed=1&mode=tme`;
      }
    }

    if (host.includes('linkedin.com')) {
      const path = u.pathname;
      const feedPrefix = '/feed/update/';
      if (path.includes(feedPrefix)) {
        const urn = decodeURIComponent(path.split(feedPrefix)[1] || '').trim();
        if (urn.startsWith('urn:li:')) {
          return `https://www.linkedin.com/embed/feed/update/${encodeURIComponent(urn)}`;
        }
      }
      const activityMatch = path.match(/activity-(\d{8,})/i);
      if (activityMatch?.[1]) {
        return `https://www.linkedin.com/embed/feed/update/${encodeURIComponent(`urn:li:activity:${activityMatch[1]}`)}`;
      }
    }

    if (host.includes('open.spotify.com')) {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const type = parts[0];
        const id = parts[1];
        if (['track', 'album', 'playlist', 'episode', 'show', 'artist'].includes(type)) {
          return `https://open.spotify.com/embed/${type}/${id}`;
        }
      }
    }

    if (host.includes('soundcloud.com')) {
      return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=true`;
    }
  } catch {
    return '';
  }
  return '';
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hasVideoAudioTrack(video: HTMLVideoElement) {
  const anyVideo = video as HTMLVideoElement & {
    audioTracks?: { length?: number };
    mozHasAudio?: boolean;
    webkitAudioDecodedByteCount?: number;
  };

  if (anyVideo.audioTracks && typeof anyVideo.audioTracks.length === 'number') {
    return anyVideo.audioTracks.length > 0;
  }
  if (typeof anyVideo.mozHasAudio === 'boolean') {
    return anyVideo.mozHasAudio;
  }
  if (typeof anyVideo.webkitAudioDecodedByteCount === 'number') {
    return anyVideo.webkitAudioDecodedByteCount > 0;
  }
  return true;
}

function getMediaAutoSize(url: string, blobKind: 'unknown' | 'video' | 'image' | 'audio' | 'pdf') {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();

    const isYoutube = host.includes('youtube.com') || host.includes('youtu.be');
    const isVimeo = host.includes('vimeo.com');
    const isTwitter = host.includes('twitter.com') || host.includes('x.com');
    const isInstagram = host.includes('instagram.com');
    const isLinkedIn = host.includes('linkedin.com');
    const isTelegram = host.includes('t.me') || host.includes('telegram.me');
    const isWhatsapp = host.includes('whatsapp.com') || host === 'wa.me';
    const isDiscord = host.includes('discord.com') || host.includes('discord.gg');
    const isSnapchat = host.includes('snapchat.com');
    const isImageLike = isImage(path, blobKind);
    const isVideoLike = isVideo(path, blobKind);
    const isAudioLike = isAudio(path, blobKind);
    const isPdfLike = isPdf(path, blobKind);

    if (isYoutube || isVimeo) return { width: 620, height: 390 };
    if (isTwitter) return { width: 580, height: 760 };
    if (isInstagram) return { width: 500, height: 820 };
    if (isLinkedIn) return { width: 620, height: 540 };
    if (isTelegram) return { width: 560, height: 620 };
    if (isWhatsapp || isDiscord || isSnapchat) return { width: 560, height: 500 };
    if (isImageLike) return { width: 520, height: 420 };
    if (isVideoLike) return { width: 620, height: 430 };
    if (isAudioLike) return { width: 560, height: 170 };
    if (isPdfLike) return { width: 700, height: 520 };
    return { width: 560, height: 420 };
  } catch {
    if (isImage(url, blobKind)) return { width: 520, height: 420 };
    if (isVideo(url, blobKind)) return { width: 620, height: 430 };
    if (isAudio(url, blobKind)) return { width: 560, height: 170 };
    if (isPdf(url, blobKind)) return { width: 700, height: 520 };
    return null;
  }
}

export function MediaBlock({ block, readOnly }: { block: CanvasBlock; readOnly?: boolean }) {
  const updateBlock = useCanvasStore((s) => s.updateBlock);
  const isMobile = useIsMobile();
  const blockRootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [videoHasAudio, setVideoHasAudio] = useState(true);
  const [blobMediaKind, setBlobMediaKind] = useState<'unknown' | 'video' | 'image' | 'audio' | 'pdf'>('unknown');
  const lastAutoSizeUrl = useRef('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('video/')) {
      setBlobMediaKind('video');
    } else if (file.type.startsWith('audio/')) {
      setBlobMediaKind('audio');
    } else if (file.type.startsWith('image/')) {
      setBlobMediaKind('image');
    } else if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      setBlobMediaKind('pdf');
    } else {
      setBlobMediaKind('unknown');
    }
    updateBlock(block.id, { url });
  };

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      if (videoRef.current.paused) {
        void videoRef.current.play().catch(() => undefined);
        setPlaying(true);
      }
      else { videoRef.current.pause(); setPlaying(false); }
    }
  };

  const toggleAudioPlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (audioRef.current) {
      if (audioRef.current.paused) {
        void audioRef.current.play().catch(() => undefined);
        setPlaying(true);
      } else {
        audioRef.current.pause();
        setPlaying(false);
      }
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMuted((prev) => !prev);
  };

  const normalizedUrl = normalizeUrl(block.url || '');
  const hasUrl = normalizedUrl.length > 0;
  const embedUrl = hasUrl ? toEmbedUrl(normalizedUrl) : '';
  const isVid = hasUrl && isVideo(normalizedUrl, blobMediaKind);
  const isAudioUrl = hasUrl && isAudio(normalizedUrl, blobMediaKind);
  const isGifUrl = hasUrl && isGif(normalizedUrl, blobMediaKind);
  const isImageUrl = hasUrl && isImage(normalizedUrl, blobMediaKind);
  const isPdfUrl = hasUrl && isPdf(normalizedUrl, blobMediaKind);
  const embedZoomResetTimerRef = useRef<number | null>(null);

  const setEmbedZoomThrough = (active: boolean) => {
    const canvasEl = blockRootRef.current?.closest('[data-canvas="true"]') as HTMLElement | null;
    if (!canvasEl) return;
    canvasEl.classList.toggle('cnvs-zoom-through-embeds', active);
  };

  const enableEmbedZoomThrough = () => setEmbedZoomThrough(true);

  const disableEmbedZoomThrough = () => setEmbedZoomThrough(false);

  const scheduleEmbedZoomThroughOff = (delay = 140) => {
    if (embedZoomResetTimerRef.current !== null) {
      window.clearTimeout(embedZoomResetTimerRef.current);
    }
    embedZoomResetTimerRef.current = window.setTimeout(() => {
      disableEmbedZoomThrough();
      embedZoomResetTimerRef.current = null;
    }, delay);
  };

  const handleEmbedPointerDown = () => {
    // Ensure provider controls stay clickable on mobile after any zoom gesture.
    if (embedZoomResetTimerRef.current !== null) {
      window.clearTimeout(embedZoomResetTimerRef.current);
      embedZoomResetTimerRef.current = null;
    }
    disableEmbedZoomThrough();
  };

  const handleEmbedWheelCapture = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    e.stopPropagation();
    enableEmbedZoomThrough();
    scheduleEmbedZoomThroughOff();
    const state = useCanvasStore.getState();
    const delta = -e.deltaY * 0.002;
    state.setZoom(state.zoom * (1 + delta));
  };

  const handleEmbedTouchStartCapture = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length >= 2) {
      e.preventDefault();
      enableEmbedZoomThrough();
      scheduleEmbedZoomThroughOff(260);
    }
  };

  const handleEmbedTouchMoveCapture = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length >= 2) {
      e.preventDefault();
      enableEmbedZoomThrough();
      scheduleEmbedZoomThroughOff(260);
    }
  };

  const handleEmbedTouchEndCapture = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) {
      disableEmbedZoomThrough();
    }
  };

  useEffect(() => {
    if (!/^blob:/i.test(normalizedUrl)) {
      setBlobMediaKind('unknown');
    }
  }, [normalizedUrl]);

  useEffect(() => {
    return () => {
      if (embedZoomResetTimerRef.current !== null) {
        window.clearTimeout(embedZoomResetTimerRef.current);
      }
      disableEmbedZoomThrough();
    };
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = muted;
    }
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = muted;
    }
  }, [muted, volume, normalizedUrl]);

  useEffect(() => {
    if (readOnly) return;
    const url = normalizedUrl;
    if (!url || url === 'https://') return;
    if (url === lastAutoSizeUrl.current) return;
    const nextSize = getMediaAutoSize(url, blobMediaKind);
    if (!nextSize) return;
    lastAutoSizeUrl.current = url;

    if (block.width !== nextSize.width || block.height !== nextSize.height) {
      updateBlock(block.id, { width: nextSize.width, height: nextSize.height });
    }
  }, [normalizedUrl, readOnly, block.id, block.width, block.height, updateBlock, blobMediaKind]);

  const handleVideoEnded = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    void video.play().catch(() => undefined);
    setPlaying(true);
  };

  const handleAudioEnded = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  };

  return (
    <div ref={blockRootRef} className="p-2 h-full flex flex-col gap-1.5 min-h-0">
      {!readOnly && (
        <div className="flex items-center gap-1">
          <input
            className="flex-1 bg-transparent text-[10px] font-mono text-muted-foreground focus:outline-none placeholder:text-muted-foreground border-b border-border pb-1"
            placeholder="Paste media URL..."
            value={block.url || ''}
            onChange={(e) => {
              lastAutoSizeUrl.current = '';
              setBlobMediaKind('unknown');
              updateBlock(block.id, { url: e.target.value });
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,audio/*,application/pdf,.pdf,.gif,.png,.jpg,.jpeg,.webp,.svg,.heic,.heif,.heiv,.bmp,.tif,.tiff,.mp4,.webm,.ogv,.mov,.m4v,.avi,.mkv,.wmv,.flv,.3gp,.m3u8,.mp3,.wav,.aac,.flac,.m4a,.oga,.ogg,.opus,.aiff,.alac,.amr,.wma,.weba,.mpga,.mid,.midi"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>
      )}

      {hasUrl ? (
        embedUrl ? (
          <div
            className="flex-1 min-h-0 relative"
            data-media-interactive="true"
            onPointerDownCapture={handleEmbedPointerDown}
            onWheelCapture={handleEmbedWheelCapture}
            onTouchStartCapture={handleEmbedTouchStartCapture}
            onTouchMoveCapture={handleEmbedTouchMoveCapture}
            onTouchEndCapture={handleEmbedTouchEndCapture}
          >
            <iframe
              src={embedUrl}
              className="w-full h-full border-0 cnvs-media-embed"
              style={{ touchAction: isMobile ? 'none' : 'auto' }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title="live-media-preview"
            />
          </div>
        ) : isVid ? (
          <div className="relative flex-1">
            <video
              ref={videoRef}
              src={normalizedUrl}
              className="w-full h-full object-cover"
              loop
              autoPlay
              muted={muted}
              playsInline
              onMouseEnter={() => {
                if (!videoRef.current || !videoRef.current.paused) return;
                void videoRef.current.play().catch(() => undefined);
                setPlaying(true);
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (videoRef.current?.paused) {
                  void videoRef.current.play().catch(() => undefined);
                  setPlaying(true);
                } else {
                  videoRef.current?.pause();
                  setPlaying(false);
                }
              }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={handleVideoEnded}
              onLoadedMetadata={(e) => {
                if (readOnly) return;
                const v = e.currentTarget;
                setVideoHasAudio(hasVideoAudioTrack(v));
                if (!v.videoWidth || !v.videoHeight) return;
                const ratio = v.videoWidth / v.videoHeight;
                const newW = clamp(v.videoWidth, 280, 760);
                const newH = clamp(newW / ratio + 28, 180, 760);
                updateBlock(block.id, { width: newW, height: newH });
              }}
            />
            <div className="absolute bottom-1 right-1 z-[2] flex items-center gap-1 bg-foreground/45 px-1 py-1 backdrop-blur-sm">
              <button onClick={togglePlay} className={`${isMobile ? 'w-6 h-6' : 'w-5 h-5'} bg-foreground/70 text-background flex items-center justify-center hover:bg-foreground transition-colors`}>
                {playing ? <Pause size={isMobile ? 11 : 10} /> : <Play size={isMobile ? 11 : 10} />}
              </button>
              {videoHasAudio && (
                <>
                  <button onClick={toggleMute} className={`${isMobile ? 'w-6 h-6' : 'w-5 h-5'} bg-foreground/70 text-background flex items-center justify-center hover:bg-foreground transition-colors`}>
                    {muted ? <VolumeX size={isMobile ? 11 : 10} /> : <Volume2 size={isMobile ? 11 : 10} />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={muted ? 0 : volume}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setVolume(next);
                      if (next > 0 && muted) setMuted(false);
                    }}
                    className={`${isMobile ? 'w-16' : 'w-14'} accent-foreground`}
                  />
                </>
              )}
            </div>
          </div>
        ) : isAudioUrl ? (
          <div className="flex-1 min-h-0 border border-border bg-secondary/20 px-2 py-3 flex flex-col items-center justify-center gap-2">
            <audio
              ref={audioRef}
              src={normalizedUrl}
              className="hidden"
              autoPlay
              loop
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={handleAudioEnded}
            />
            <div className="flex items-center gap-2 w-full max-w-[260px]">
              <button onClick={toggleAudioPlay} className={`${isMobile ? 'w-7 h-7' : 'w-6 h-6'} bg-foreground/80 text-background flex items-center justify-center hover:bg-foreground transition-colors`}>
                {playing ? <Pause size={isMobile ? 12 : 11} /> : <Play size={isMobile ? 12 : 11} />}
              </button>
              <button onClick={toggleMute} className={`${isMobile ? 'w-7 h-7' : 'w-6 h-6'} bg-foreground/80 text-background flex items-center justify-center hover:bg-foreground transition-colors`}>
                {muted ? <VolumeX size={isMobile ? 12 : 11} /> : <Volume2 size={isMobile ? 12 : 11} />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setVolume(next);
                  if (next > 0 && muted) setMuted(false);
                }}
                className="flex-1 accent-foreground"
              />
            </div>
          </div>
        ) : isPdfUrl ? (
          <div className="flex-1 min-h-0 border border-border bg-secondary/20 overflow-hidden">
            <div className="h-8 px-2 border-b border-border/70 flex items-center justify-between">
              <div className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                <FileText size={11} /> PDF preview
              </div>
              <a
                href={normalizedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-mono text-muted-foreground hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                Open
              </a>
            </div>
            <iframe
              src={normalizedUrl}
              className="w-full h-[calc(100%-2rem)] border-0 cnvs-media-embed"
              style={{ touchAction: isMobile ? 'none' : 'auto' }}
              title="pdf-preview"
            />
          </div>
        ) : isGifUrl ? (
          <img
            src={normalizedUrl}
            alt={block.content || 'media'}
            className="flex-1 w-full h-full object-contain"
          />
        ) : isImageUrl ? (
          <img
            src={normalizedUrl}
            alt={block.content || 'media'}
            className="flex-1 w-full h-full object-contain"
            onLoad={(e) => {
              if (!readOnly) {
                const img = e.target as HTMLImageElement;
                const ratio = img.naturalWidth / img.naturalHeight;
                const newW = Math.max(160, Math.min(500, img.naturalWidth));
                const newH = Math.max(100, newW / ratio + 28);
                updateBlock(block.id, { width: newW, height: newH });
              }
            }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div
            className="flex-1 min-h-0 relative"
            data-media-interactive="true"
            onPointerDownCapture={handleEmbedPointerDown}
            onWheelCapture={handleEmbedWheelCapture}
            onTouchStartCapture={handleEmbedTouchStartCapture}
            onTouchMoveCapture={handleEmbedTouchMoveCapture}
            onTouchEndCapture={handleEmbedTouchEndCapture}
          >
            <iframe
              src={normalizedUrl}
              className="w-full h-full border-0 cnvs-media-embed"
              style={{ touchAction: isMobile ? 'none' : 'auto' }}
              title="live-media-preview"
            />
          </div>
        )
      ) : (
        <div
          className="flex-1 flex items-center justify-center text-muted-foreground cursor-pointer hover:text-foreground transition-colors min-h-0"
          onClick={(e) => { e.stopPropagation(); if (!readOnly) fileInputRef.current?.click(); }}
        >
          <ImageIcon size={24} />
        </div>
      )}
    </div>
  );
}
