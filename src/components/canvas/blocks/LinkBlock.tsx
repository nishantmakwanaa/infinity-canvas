import { useCanvasStore, CanvasBlock } from '@/store/canvasStore';
import { ExternalLink, Globe } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function getDomain(url: string) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function getFaviconUrl(url: string) {
  const d = getDomain(url);
  return d ? `https://www.google.com/s2/favicons?domain=${d}&sz=32` : '';
}

function normalizeUrl(raw: string) {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
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

export function LinkBlock({ block, readOnly }: { block: CanvasBlock; readOnly?: boolean }) {
  const updateBlock = useCanvasStore((s) => s.updateBlock);
  const setPan = useCanvasStore((s) => s.setPan);
  const setZoom = useCanvasStore((s) => s.setZoom);
  const inputRef = useRef<HTMLInputElement>(null);
  const normalizedUrl = normalizeUrl(block.url || '');
  const domain = getDomain(normalizedUrl);
  const embedUrl = toEmbedUrl(normalizedUrl);
  const [fetchingTitle, setFetchingTitle] = useState(false);
  const [showWebsiteDialog, setShowWebsiteDialog] = useState(false);
  const lastFetchedUrl = useRef('');

  // Auto-fetch title when URL changes
  useEffect(() => {
    const url = normalizedUrl;
    if (!url || url === 'https://' || !domain || block.content || readOnly) return;
    if (url === lastFetchedUrl.current) return;
    lastFetchedUrl.current = url;

    const timer = setTimeout(async () => {
      setFetchingTitle(true);
      try {
        const { data } = await supabase.functions.invoke('get-page-title', { body: { url } });
        if (data?.title) {
          updateBlock(block.id, { content: data.title });
        }
      } catch {
        updateBlock(block.id, { content: domain });
      }
      setFetchingTitle(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [normalizedUrl, block.id, domain, block.content, readOnly, updateBlock]);

  const openWebsite = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (normalizedUrl) window.open(normalizedUrl, '_blank', 'noopener,noreferrer');
  };

  const handlePasteIntoUrl = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) updateBlock(block.id, { url: text.trim(), content: '' });
    } catch {
      // Ignore if clipboard permission is blocked.
    }
  };

  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  if (readOnly) {
    return (
      <div className="p-3 h-full flex flex-col gap-2">
        <div className="flex items-center gap-2">
          {domain && <img src={getFaviconUrl(normalizedUrl)} alt="" className="w-4 h-4" />}
          <span className="text-sm font-mono text-foreground truncate">{block.content || domain || 'Link'}</span>
        </div>
        {normalizedUrl && domain && (
          <div
            className="flex-1 border border-border bg-secondary/20 overflow-hidden relative"
            onContextMenu={(e) => e.preventDefault()}
          >
            {embedUrl ? (
              <iframe src={embedUrl} className="w-full h-full pointer-events-none" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            ) : (
              <iframe src={normalizedUrl} className="w-full h-full pointer-events-none" title={block.content || domain} />
            )}
            {/* Overlay to guarantee browser context menu never opens on embeds */}
            <div className="absolute inset-0" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-3 h-full flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          className="flex-1 bg-transparent text-xs font-mono text-muted-foreground focus:outline-none placeholder:text-muted-foreground border-b border-border pb-1"
          placeholder="Paste URL..."
          value={block.url || ''}
          ref={inputRef}
          onChange={(e) => {
            updateBlock(block.id, { url: e.target.value, content: '' });
            lastFetchedUrl.current = '';
          }}
        />
        {normalizedUrl && domain && (
          <a href={normalizedUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors" onClick={(e) => e.stopPropagation()}>
            <ExternalLink size={12} />
          </a>
        )}
      </div>
      {fetchingTitle && <span className="text-[10px] font-mono text-muted-foreground">Fetching title...</span>}
      {block.content && (
        <span className="text-sm font-mono text-foreground truncate">{block.content}</span>
      )}
      {normalizedUrl && domain && (
        <div
          className="flex-1 border border-border bg-secondary/20 overflow-hidden relative"
          onClick={openWebsite}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowWebsiteDialog(true);
          }}
        >
          {embedUrl ? (
            <iframe src={embedUrl} className="w-full h-full pointer-events-none" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          ) : (
            <>
              <iframe src={normalizedUrl} className="w-full h-full pointer-events-none" title={block.content || domain} />
              <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-background/80 border border-border flex items-center gap-1">
                <Globe size={11} className="text-muted-foreground" />
                <span className="text-[10px] font-mono text-muted-foreground">{domain}</span>
              </div>
            </>
          )}
        </div>
      )}
      <Dialog open={showWebsiteDialog} onOpenChange={setShowWebsiteDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-mono">Website actions</DialogTitle>
            <DialogDescription className="text-xs font-mono">
              Paste, select, and open this website URL. Reset resets the canvas view.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <input
              className="w-full h-8 px-2 bg-transparent text-xs font-mono border border-border focus:outline-none"
              value={block.url || ''}
              onChange={(e) => updateBlock(block.id, { url: e.target.value, content: '' })}
            />
          </div>
          <DialogFooter>
            <button className="h-8 px-3 border border-border text-xs font-mono" onClick={() => inputRef.current?.select()}>
              Select all
            </button>
            <button className="h-8 px-3 border border-border text-xs font-mono" onClick={handlePasteIntoUrl}>
              Paste
            </button>
            <button className="h-8 px-3 border border-border text-xs font-mono" onClick={handleResetView}>
              Reset
            </button>
            <button className="h-8 px-3 border border-border bg-foreground text-background text-xs font-mono" onClick={openWebsite}>
              Open
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
