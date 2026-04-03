import { X } from 'lucide-react';

const SHORTCUTS = [
  { section: 'Tools', items: [
    ['Note', 'Alt/Ctrl + N'], ['Link', 'Alt/Ctrl + L'], ['Todo', 'Alt/Ctrl + T'], ['Media', 'Alt/Ctrl + M'],
    ['Pencil', 'Alt/Ctrl + P'], ['Eraser', 'Alt/Ctrl + E'], ['Text', 'Alt/Ctrl + X'], ['Shape', 'Alt/Ctrl + S'],
    ['Line', 'Alt/Ctrl + I'], ['Arrow', 'Alt/Ctrl + A'], ['Select', 'Alt/Ctrl + V'],
  ]},
  { section: 'View', items: [
    ['Zoom in', 'Alt/Ctrl + ='], ['Zoom out', 'Alt/Ctrl + -'], ['Zoom to 100%', 'Alt/Ctrl + 0'],
    ['Reset view', 'Alt/Ctrl + R'],
  ]},
  { section: 'Edit', items: [
    ['Copy selected block', 'Alt/Ctrl + C'],
    ['Delete', 'Delete'],
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
