import { useCanvasStore, CanvasBlock } from '@/store/canvasStore';
import { ImageIcon, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { useRef, useState } from 'react';

function normalizeUrl(raw: string) {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isVideo(url: string) {
  return /\.(mp4|webm|ogg|mov|m3u8)(\?|$)/i.test(url) || url.includes('video');
}

function isGif(url: string) {
  return /\.gif(\?|$)/i.test(url);
}

function toEmbedUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com')) {
      const id = u.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : '';
    }
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace('/', '');
      return id ? `https://www.youtube.com/embed/${id}` : '';
    }
    if (u.hostname.includes('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}` : '';
    }
  } catch {
    return '';
  }
  return '';
}

export function MediaBlock({ block, readOnly }: { block: CanvasBlock; readOnly?: boolean }) {
  const updateBlock = useCanvasStore((s) => s.updateBlock);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    updateBlock(block.id, { url });
  };

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      if (videoRef.current.paused) { videoRef.current.play(); setPlaying(true); }
      else { videoRef.current.pause(); setPlaying(false); }
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setMuted(videoRef.current.muted);
    }
  };

  const normalizedUrl = normalizeUrl(block.url || '');
  const hasUrl = normalizedUrl.length > 0;
  const embedUrl = hasUrl ? toEmbedUrl(normalizedUrl) : '';
  const isVid = hasUrl && isVideo(normalizedUrl);
  const isGifUrl = hasUrl && isGif(normalizedUrl);

  return (
    <div className="p-3 h-full flex flex-col gap-2 min-h-0">
      {!readOnly && (
        <div className="flex items-center gap-1">
          <input
            className="flex-1 bg-transparent text-xs font-mono text-muted-foreground focus:outline-none placeholder:text-muted-foreground border-b border-border pb-1"
            placeholder="Paste media URL..."
            value={block.url || ''}
            onChange={(e) => updateBlock(block.id, { url: e.target.value })}
          />
          <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileUpload} />
        </div>
      )}

      {hasUrl ? (
        embedUrl ? (
          <div className="flex-1 min-h-0">
            <iframe
              src={embedUrl}
              className="w-full h-full border-0"
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
              className="w-full h-full object-contain"
              loop
              autoPlay
              muted={muted}
              playsInline
            />
            <div className="absolute bottom-1 right-1 flex gap-1">
              <button onClick={togglePlay} className="w-6 h-6 bg-foreground/70 text-background flex items-center justify-center hover:bg-foreground transition-colors">
                {playing ? <Pause size={10} /> : <Play size={10} />}
              </button>
              <button onClick={toggleMute} className="w-6 h-6 bg-foreground/70 text-background flex items-center justify-center hover:bg-foreground transition-colors">
                {muted ? <VolumeX size={10} /> : <Volume2 size={10} />}
              </button>
            </div>
          </div>
        ) : isGifUrl ? (
          <img
            src={normalizedUrl}
            alt={block.content || 'media'}
            className="flex-1 w-full h-full object-contain cursor-pointer"
            onClick={(e) => { e.stopPropagation(); window.open(normalizedUrl, '_blank'); }}
          />
        ) : /\.(png|jpe?g|webp|avif|svg)(\?|$)/i.test(normalizedUrl) ? (
          <img
            src={normalizedUrl}
            alt={block.content || 'media'}
            className="flex-1 w-full h-full object-contain cursor-pointer"
            onClick={(e) => { e.stopPropagation(); window.open(normalizedUrl, '_blank'); }}
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
          <div className="flex-1 min-h-0">
            <iframe src={normalizedUrl} className="w-full h-full border-0" title="live-media-preview" />
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
