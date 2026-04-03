import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Globe, Keyboard, BookOpen, MessageSquare, ChevronRight, Sun, Moon, Monitor } from 'lucide-react';
import { getThemePreference, setThemePreference, type ThemePreference } from '@/hooks/useThemeTime';
import { exportCanvasAsCnvs, exportCanvasAsPng, exportCanvasAsSvg, importCanvasFromCnvsFile } from '@/lib/export';
import { APP_LANGUAGES, getAppLanguage, setAppLanguage } from '@/lib/i18n';

interface AppMenuProps {
  onClose: () => void;
  isLoggedIn?: boolean;
  isMobile?: boolean;
  onOpenShortcuts: () => void;
  onOpenFeedback: () => void;
}

export function AppMenu({ onClose, isLoggedIn, isMobile = false, onOpenShortcuts, onOpenFeedback }: AppMenuProps) {
  const navigate = useNavigate();
  const [showExport, setShowExport] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  const [languageQuery, setLanguageQuery] = useState('');
  const [theme, setTheme] = useState<ThemePreference>(() => getThemePreference());
  const [language, setLanguage] = useState(() => getAppLanguage());
  const importInputRef = useRef<HTMLInputElement>(null);

  const themeMeta = useMemo(() => {
    if (theme === 'light') return { label: 'Light', Icon: Sun };
    if (theme === 'dark') return { label: 'Dark', Icon: Moon };
    return { label: 'Auto', Icon: Monitor };
  }, [theme]);

  const cycleTheme = () => {
    const next: ThemePreference = theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto';
    setTheme(next);
    setThemePreference(next);
  };

  const filteredLanguages = useMemo(() => {
    const query = languageQuery.trim().toLowerCase();
    if (!query) return APP_LANGUAGES;
    return APP_LANGUAGES.filter(
      (item) => item.label.toLowerCase().includes(query) || item.code.toLowerCase().includes(query)
    );
  }, [languageQuery]);

  const handleImportCnvs = async (file?: File | null) => {
    if (!file) return;
    const imported = await importCanvasFromCnvsFile(file);
    if (imported) onClose();
  };

  const flyoutSideClass = isMobile ? 'right-full mr-1 left-auto' : 'left-full';

  return (
    <>
      <div className="absolute left-0 top-9 z-50 w-52 border border-border bg-card py-1 shadow-lg">
        {/* Export (logged-in only) */}
        {isLoggedIn && (
          <div
            className="relative"
            onMouseEnter={() => { if (!isMobile) setShowExport(true); }}
            onMouseLeave={() => { if (!isMobile) setShowExport(false); }}
          >
            <button
              onClick={() => setShowExport((prev) => !prev)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono hover:bg-accent transition-colors"
            >
              <span className="flex items-center gap-2"><Download size={12} /> Export</span>
              <ChevronRight size={10} />
            </button>
            {showExport && (
              <div className={`absolute top-0 z-[60] w-32 border border-border bg-card py-1 ${flyoutSideClass}`}>
                <button onClick={() => { exportCanvasAsPng(); onClose(); }} className="w-full text-left px-3 py-2 text-xs font-mono hover:bg-accent">PNG</button>
                <button onClick={() => { exportCanvasAsSvg(); onClose(); }} className="w-full text-left px-3 py-2 text-xs font-mono hover:bg-accent">SVG</button>
                <button onClick={() => { exportCanvasAsCnvs(); onClose(); }} className="w-full text-left px-3 py-2 text-xs font-mono hover:bg-accent">CNVS</button>
              </div>
            )}
          </div>
        )}

        <button
          onClick={cycleTheme}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono hover:bg-accent transition-colors"
          title="Toggle theme (Auto/Light/Dark)"
        >
          <span className="flex items-center gap-2">
            <themeMeta.Icon size={12} /> Theme
          </span>
          <span className="text-muted-foreground">{themeMeta.label}</span>
        </button>

        <div
          className="relative"
          onMouseEnter={() => { if (!isMobile) setShowLanguage(true); }}
          onMouseLeave={() => { if (!isMobile) setShowLanguage(false); }}
        >
          <button
            onClick={() => setShowLanguage((prev) => !prev)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono hover:bg-accent transition-colors"
          >
            <span className="flex items-center gap-2"><Globe size={12} /> Language</span>
            <ChevronRight size={10} />
          </button>

          {showLanguage && (
            <div className={`absolute top-0 z-[60] w-56 border border-border bg-card p-2 shadow-lg ${flyoutSideClass}`} data-no-translate="true">
              <input
                value={languageQuery}
                onChange={(e) => setLanguageQuery(e.target.value)}
                className="h-8 w-full border border-border bg-card px-2 text-xs font-mono text-foreground outline-none focus:border-foreground"
                placeholder="Search language"
              />
              <div className="mt-2 max-h-56 overflow-auto border border-border">
                {filteredLanguages.map((item) => (
                  <button
                    key={item.code}
                    onClick={() => {
                      setLanguage(item.code);
                      setAppLanguage(item.code);
                      onClose();
                    }}
                    className={`w-full px-2 py-1.5 text-left text-xs font-mono transition-colors ${
                      language === item.code
                        ? 'bg-foreground text-background'
                        : 'hover:bg-accent'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="h-px bg-border my-1" />

        <button
          onClick={() => importInputRef.current?.click()}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono hover:bg-accent transition-colors"
        >
          <Download size={12} /> Load .cnvs file
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept=".cnvs,application/json"
          className="hidden"
          onChange={(e) => {
            void handleImportCnvs(e.target.files?.[0]);
            e.currentTarget.value = '';
          }}
        />

        <button onClick={() => { onClose(); onOpenShortcuts(); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono hover:bg-accent transition-colors">
          <Keyboard size={12} /> Keyboard shortcuts...
        </button>

        <button onClick={() => { onClose(); navigate('/manual'); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono hover:bg-accent transition-colors">
          <BookOpen size={12} /> User manual
        </button>

        <button onClick={() => { onClose(); onOpenFeedback(); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono hover:bg-accent transition-colors">
          <MessageSquare size={12} /> Send feedback
        </button>
      </div>
    </>
  );
}
