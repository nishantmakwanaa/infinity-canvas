import { useCanvasStore, CanvasBlock } from '@/store/canvasStore';
import { ExternalLink } from 'lucide-react';

export function LinkBlock({ block }: { block: CanvasBlock }) {
  const updateBlock = useCanvasStore((s) => s.updateBlock);

  return (
    <div className="p-3 space-y-2">
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
        {block.url && block.url !== 'https://' && (
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
    </div>
  );
}
