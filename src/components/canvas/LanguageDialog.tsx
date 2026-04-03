import { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { APP_LANGUAGES, getAppLanguage, setAppLanguage } from '@/lib/i18n';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface LanguageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LanguageDialog({ open, onOpenChange }: LanguageDialogProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => getAppLanguage());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return APP_LANGUAGES;
    return APP_LANGUAGES.filter((lang) => {
      return lang.label.toLowerCase().includes(q) || lang.code.toLowerCase().includes(q);
    });
  }, [query]);

  const onSelect = (code: string) => {
    setSelected(code);
    setAppLanguage(code);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border bg-card p-4" data-no-translate="true">
        <DialogHeader>
          <DialogTitle className="text-sm font-mono">Language</DialogTitle>
          <DialogDescription className="text-xs font-mono text-muted-foreground">
            Select a language to translate the interface in real time.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 w-full border border-border bg-card pl-8 pr-2 text-xs font-mono text-foreground outline-none focus:border-foreground"
            placeholder="Search language"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {filtered.map((lang) => (
            <button
              key={lang.code}
              onClick={() => onSelect(lang.code)}
              className={`h-9 border px-2 text-left text-xs font-mono transition-colors ${
                selected === lang.code
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-card text-foreground hover:bg-accent'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate">{lang.label}</span>
                {selected === lang.code ? <Check size={12} /> : null}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
