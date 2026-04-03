import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Globe, Keyboard, BookOpen, MessageSquare, ChevronRight } from 'lucide-react';
import { exportCanvasAsPng, exportCanvasAsSvg } from '@/lib/export';
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog';
import { FeedbackDialog } from './FeedbackDialog';

interface AppMenuProps {
  onClose: () => void;
}

const LANGUAGES = [
  { code: 'en', label: 'English', active: true },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'zh', label: '中文' },
  { code: 'ar', label: 'العربية' },
  { code: 'pt', label: 'Português' },
];

export function AppMenu({ onClose }: AppMenuProps) {
  const navigate = useNavigate();
  const [showExport, setShowExport] = useState(false);
  const [showLang, setShowLang] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  return (
    <>
      <div className="absolute left-0 top-9 z-50 w-52 border border-border bg-card py-1 shadow-lg">
        {/* Export */}
        <div className="relative" onMouseEnter={() => setShowExport(true)} onMouseLeave={() => setShowExport(false)}>
          <button className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono hover:bg-accent transition-colors">
            <span className="flex items-center gap-2"><Download size={12} /> Export</span>
            <ChevronRight size={10} />
          </button>
          {showExport && (
            <div className="absolute left-full top-0 w-32 border border-border bg-card py-1">
              <button onClick={() => { exportCanvasAsPng(); onClose(); }} className="w-full text-left px-3 py-2 text-xs font-mono hover:bg-accent">PNG</button>
              <button onClick={() => { exportCanvasAsSvg(); onClose(); }} className="w-full text-left px-3 py-2 text-xs font-mono hover:bg-accent">SVG</button>
            </div>
          )}
        </div>

        {/* Language */}
        <div className="relative" onMouseEnter={() => setShowLang(true)} onMouseLeave={() => setShowLang(false)}>
          <button className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono hover:bg-accent transition-colors">
            <span className="flex items-center gap-2"><Globe size={12} /> Language</span>
            <ChevronRight size={10} />
          </button>
          {showLang && (
            <div className="absolute left-full top-0 w-36 border border-border bg-card py-1 max-h-60 overflow-auto">
              {LANGUAGES.map((l) => (
                <button key={l.code} className={`w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-accent ${l.active ? 'text-foreground font-bold' : 'text-muted-foreground'}`}>
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="h-px bg-border my-1" />

        <button onClick={() => { setShowShortcuts(true); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono hover:bg-accent transition-colors">
          <Keyboard size={12} /> Keyboard shortcuts...
        </button>

        <button onClick={() => { onClose(); navigate('/manual'); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono hover:bg-accent transition-colors">
          <BookOpen size={12} /> User manual
        </button>

        <button onClick={() => { setShowFeedback(true); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono hover:bg-accent transition-colors">
          <MessageSquare size={12} /> Send feedback
        </button>
      </div>

      {showShortcuts && <KeyboardShortcutsDialog onClose={() => { setShowShortcuts(false); onClose(); }} />}
      {showFeedback && <FeedbackDialog onClose={() => { setShowFeedback(false); onClose(); }} />}
    </>
  );
}
