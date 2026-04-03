import { useCanvasStore, CanvasBlock, FONT_MAP } from '@/store/canvasStore';
import { getNoteSize } from '@/lib/blockSizing';
import type { CSSProperties } from 'react';

export function NoteBlock({ block, readOnly }: { block: CanvasBlock; readOnly?: boolean }) {
  const updateBlock = useCanvasStore((s) => s.updateBlock);
  const textFont = FONT_MAP[block.fontFamily || 'mono'];
  const textStyle: CSSProperties = {
    fontFamily: textFont,
    fontWeight: block.textBold ? 700 : 400,
    fontStyle: block.textItalic ? 'italic' : 'normal',
    textDecoration: block.textUnderline ? 'underline' : 'none',
    backgroundColor: block.textHighlight ? 'rgba(250, 204, 21, 0.28)' : 'transparent',
  };

  if (readOnly) {
    return (
      <div className="w-full h-full p-3 text-foreground text-sm font-mono whitespace-pre-wrap" style={textStyle}>
        {block.content || 'Empty note'}
      </div>
    );
  }

  return (
    <textarea
      className="w-full h-full p-3 bg-transparent text-foreground text-sm font-mono resize-none overflow-auto no-scrollbar focus:outline-none placeholder:text-muted-foreground"
      style={textStyle}
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
