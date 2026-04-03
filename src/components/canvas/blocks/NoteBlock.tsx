import { useCanvasStore, CanvasBlock } from '@/store/canvasStore';

export function NoteBlock({ block }: { block: CanvasBlock }) {
  const updateBlock = useCanvasStore((s) => s.updateBlock);

  return (
    <textarea
      className="w-full h-full p-3 bg-transparent text-foreground text-sm font-mono resize-none focus:outline-none placeholder:text-muted-foreground"
      placeholder="Write something..."
      value={block.content}
      onChange={(e) => updateBlock(block.id, { content: e.target.value })}
    />
  );
}
