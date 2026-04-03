import { useCanvasStore, CanvasBlock } from '@/store/canvasStore';
import { ImageIcon } from 'lucide-react';

export function ImageBlock({ block, readOnly }: { block: CanvasBlock; readOnly?: boolean }) {
  const updateBlock = useCanvasStore((s) => s.updateBlock);

  return (
    <div className="p-3 h-full flex flex-col gap-2">
      {!readOnly && (
        <input
          className="w-full bg-transparent text-xs font-mono text-muted-foreground focus:outline-none placeholder:text-muted-foreground border-b border-border pb-1"
          placeholder="Paste image URL..."
          value={block.url || ''}
          onChange={(e) => updateBlock(block.id, { url: e.target.value })}
        />
      )}
      {block.url && block.url.length > 0 ? (
        <img
          src={block.url}
          alt={block.content || 'image'}
          className="flex-1 object-contain w-full cursor-pointer"
          onClick={(e) => { e.stopPropagation(); window.open(block.url, '_blank'); }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <ImageIcon size={24} />
        </div>
      )}
    </div>
  );
}
