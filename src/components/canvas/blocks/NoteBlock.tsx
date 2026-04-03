import { useCanvasStore, CanvasBlock, FONT_MAP } from '@/store/canvasStore';
import { getNoteSize } from '@/lib/blockSizing';

export function NoteBlock({ block, readOnly }: { block: CanvasBlock; readOnly?: boolean }) {
  const updateBlock = useCanvasStore((s) => s.updateBlock);
  const textFont = FONT_MAP[block.fontFamily || 'mono'];

  if (readOnly) {
    return (
      <div className="w-full h-full p-3 text-foreground text-sm font-mono whitespace-pre-wrap" style={{ fontFamily: textFont }}>
        {block.content || 'Empty note'}
      </div>
    );
  }

  return (
    <textarea
      className="w-full h-full p-3 bg-transparent text-foreground text-sm font-mono resize-none overflow-auto no-scrollbar focus:outline-none placeholder:text-muted-foreground"
      style={{ fontFamily: textFont }}
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
