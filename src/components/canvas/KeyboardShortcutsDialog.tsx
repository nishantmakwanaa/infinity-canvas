import { X } from 'lucide-react';

const SHORTCUTS = [
  { section: 'Tools', items: [
    ['Cursor / Select', 'Alt + Shift + V'],
    ['Hand / Pan', 'Alt + Shift + W'],
    ['Draw (Pencil)', 'Alt + Shift + P'],
    ['Eraser', 'Alt + Shift + E'],
    ['Note', 'Alt + Shift + N'],
    ['Link', 'Alt + Shift + L'],
    ['Todo', 'Alt + Shift + T'],
    ['Media', 'Alt + Shift + M'],
    ['Text', 'Alt + Shift + Q'],
    ['Shape', 'Alt + Shift + S'],
    ['Line', 'Alt + Shift + O'],
    ['Arrow', 'Alt + Shift + A'],
  ]},
  { section: 'Edit', items: [
    ['Undo', 'Alt + Shift + Z'],
    ['Redo', 'Alt + Shift + Y'],
    ['Delete selected', 'Alt + Shift + Delete'],
    ['Copy selected', 'Alt + Shift + C'],
    ['Cut selected', 'Alt + Shift + K'],
  ]},
  { section: 'Theme & Text', items: [
    ['Theme light', 'Alt + Shift + 1'],
    ['Theme dark', 'Alt + Shift + 2'],
    ['Theme auto', 'Alt + Shift + 3'],
    ['Bold', 'Alt + Shift + B'],
    ['Italic', 'Alt + Shift + I'],
    ['Underline', 'Alt + Shift + U'],
    ['Highlight', 'Alt + Shift + H'],
  ]},
];

export function KeyboardShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="fixed inset-0 bg-background/50" onClick={onClose} />
      <div className="relative z-10 w-[600px] max-h-[80vh] overflow-auto border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold font-mono">Keyboard shortcuts</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        <div className="grid grid-cols-3 gap-8">
          {SHORTCUTS.map(({ section, items }) => (
            <div key={section}>
              <h3 className="text-xs font-mono font-bold text-muted-foreground uppercase tracking-widest mb-3">{section}</h3>
              <div className="space-y-2">
                {items.map(([label, key]) => (
                  <div key={label} className="flex items-center justify-between text-xs font-mono">
                    <span className="text-foreground">{label}</span>
                    <span className="text-muted-foreground">{key}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
