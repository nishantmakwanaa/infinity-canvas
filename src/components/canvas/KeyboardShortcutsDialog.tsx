import { X } from 'lucide-react';

const SHORTCUTS = [
  { section: 'Tools', items: [
    ['Cursor / Select', 'S'],
    ['Hand / Pan', 'H'],
    ['Draw (Pencil)', 'P'],
    ['Eraser', 'E'],
    ['Text', 'T'],
    ['Shape', 'G'],
    ['Line', 'L'],
    ['Arrow', 'A'],
    ['Note', 'N'],
    ['Link', 'K'],
    ['Todo', 'D'],
    ['Media', 'M'],
  ]},
  { section: 'Edit', items: [
    ['Undo', 'Ctrl + Z'],
    ['Redo', 'Ctrl + Y'],
    ['Delete selected', 'Delete / Backspace'],
    ['Copy selected', 'Ctrl + C'],
    ['Cut selected', 'Ctrl + X'],
  ]},
  { section: 'Text', items: [
    ['Bold', 'Ctrl + B'],
    ['Italic', 'Ctrl + I'],
    ['Underline', 'Ctrl + U'],
    ['Highlight', 'Ctrl + Shift + H'],
  ]},
  { section: 'App', items: [
    ['Open shortcuts', 'Ctrl + Alt'],
    ['Theme light', 'Ctrl + Alt + 1'],
    ['Theme dark', 'Ctrl + Alt + 2'],
    ['Theme auto', 'Ctrl + Alt + 3'],
    ['Single-letter shortcuts ignored while typing', 'Auto'],
  ]},
];

export function KeyboardShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="fixed inset-0 bg-background/50" onClick={onClose} />
      <div className="relative z-10 w-[min(920px,95vw)] max-h-[84vh] overflow-auto border border-border bg-card p-5 md:p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold font-mono">Keyboard shortcuts</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>

        <div className="mb-4 border border-border bg-muted/20 px-3 py-2 text-[11px] font-mono text-muted-foreground">
          Browser shortcuts like tab switching are preserved. We only capture the shortcuts listed below.
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {SHORTCUTS.map(({ section, items }) => (
            <section key={section} className="border border-border bg-muted/10 p-3">
              <h3 className="text-[11px] font-mono font-bold text-muted-foreground uppercase tracking-widest mb-2">{section}</h3>
              <div className="space-y-1.5">
                {items.map(([label, key]) => (
                  <div key={label} className="grid grid-cols-[1fr_auto] items-center gap-4 text-xs font-mono">
                    <span className="text-foreground">{label}</span>
                    <span className="min-w-[136px] border border-border bg-card px-2 py-1 text-center text-muted-foreground">{key}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
