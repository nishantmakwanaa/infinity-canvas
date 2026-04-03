import { X } from 'lucide-react';

const SHORTCUTS = [
  { section: 'Tools', items: [
    ['Note', 'Ctrl N'], ['Link', 'Ctrl L'], ['Todo', 'Ctrl T'], ['Media', 'Ctrl M'],
    ['Pencil', 'Ctrl P'], ['Eraser', 'Ctrl E'], ['Text', 'Ctrl X'], ['Shape', 'Ctrl S'],
    ['Line', 'Ctrl -'], ['Arrow', 'Ctrl A'], ['Select', 'Ctrl V'],
  ]},
  { section: 'View', items: [
    ['Zoom in', 'Ctrl +'], ['Zoom out', 'Ctrl -'], ['Zoom to 100%', 'Ctrl 0'],
    ['Reset view', 'Ctrl R'],
  ]},
  { section: 'Edit', items: [
    ['Delete', 'Delete'], ['Undo', 'Ctrl Z'], ['Redo', 'Ctrl Shift Z'],
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
