import { useCanvasStore, CanvasBlock } from '@/store/canvasStore';
import { getNoteSize } from '@/lib/blockSizing';

export function NoteBlock({ block, readOnly }: { block: CanvasBlock; readOnly?: boolean }) {
  const updateBlock = useCanvasStore((s) => s.updateBlock);

  if (readOnly) {
    return (
      <div className="w-full h-full p-3 text-foreground text-sm font-mono whitespace-pre-wrap">
        {block.content || 'Empty note'}
      </div>
    );
  }

  return (
    <textarea
      className="w-full h-full p-3 bg-transparent text-foreground text-sm font-mono resize-none focus:outline-none placeholder:text-muted-foreground"
      placeholder="Write something..."
      value={block.content}
      onChange={(e) => {
        const content = e.target.value;
        const size = getNoteSize(content);
        updateBlock(block.id, { content, width: size.width, height: size.height });
      }}
    />
  );
}
