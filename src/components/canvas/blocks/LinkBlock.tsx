import { useCanvasStore, CanvasBlock } from '@/store/canvasStore';
import { ExternalLink, Globe } from 'lucide-react';
import { useState, useEffect } from 'react';

function getDomain(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function getFaviconUrl(url: string) {
  const domain = getDomain(url);
  if (!domain) return '';
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

export function LinkBlock({ block, readOnly }: { block: CanvasBlock; readOnly?: boolean }) {
  const updateBlock = useCanvasStore((s) => s.updateBlock);
  const domain = getDomain(block.url || '');

  if (readOnly) {
    return (
      <div className="p-3 h-full flex flex-col gap-2">
        <div className="flex items-center gap-2">
          {domain && <img src={getFaviconUrl(block.url!)} alt="" className="w-4 h-4" />}
          <span className="text-sm font-mono text-foreground truncate">{block.content || domain || 'Link'}</span>
        </div>
        {block.url && domain && (
          <div className="flex-1 border border-border bg-secondary/30 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-secondary/50 transition-colors"
            onClick={() => window.open(block.url, '_blank')}
          >
            <Globe size={20} className="text-muted-foreground" />
            <span className="text-[10px] font-mono text-muted-foreground">{domain}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-3 h-full flex flex-col gap-2">
      <input
        className="w-full bg-transparent text-sm font-mono text-foreground border-b border-border pb-1 focus:outline-none placeholder:text-muted-foreground"
        placeholder="Title"
        value={block.content}
        onChange={(e) => updateBlock(block.id, { content: e.target.value })}
      />
      <div className="flex items-center gap-2">
        <input
          className="flex-1 bg-transparent text-xs font-mono text-muted-foreground focus:outline-none placeholder:text-muted-foreground"
          placeholder="https://..."
          value={block.url || ''}
          onChange={(e) => updateBlock(block.id, { url: e.target.value })}
        />
        {block.url && domain && (
          <a
            href={block.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={12} />
          </a>
        )}
      </div>
      {block.url && domain && (
        <div
          className="flex-1 border border-border bg-secondary/30 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-secondary/50 transition-colors"
          onClick={(e) => { e.stopPropagation(); window.open(block.url, '_blank'); }}
        >
          <img src={getFaviconUrl(block.url!)} alt="" className="w-6 h-6" />
          <span className="text-[10px] font-mono text-muted-foreground">{domain}</span>
        </div>
      )}
    </div>
  );
}
