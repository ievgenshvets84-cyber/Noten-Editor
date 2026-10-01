import React from 'react';
import { MousePointer, Music, Wind, Volume2, Sparkles } from 'lucide-react';

export interface PaletteTool {
  type: 'note' | 'rest' | 'accidental' | 'choral';
  value: string;
  duration?: number;
  label: string;
  glyph: string;
}

interface NotationPaletteProps {
  activeTool: PaletteTool | null;
  onSelectTool: (tool: PaletteTool | null) => void;
}

const TOOLS: PaletteTool[] = [
  // Notes
  { type: 'note', value: 'whole', duration: 4.0, label: 'Ganze Note (4)', glyph: '𝅝' },
  { type: 'note', value: 'half', duration: 2.0, label: 'Halbe Note (2)', glyph: '𝅗𝅥' },
  { type: 'note', value: 'quarter', duration: 1.0, label: 'Viertelnote (1)', glyph: '𝅘𝅥' },
  { type: 'note', value: 'eighth', duration: 0.5, label: 'Achtelnote (1/2)', glyph: '𝅘𝅥𝅯' },
  { type: 'note', value: 'sixteenth', duration: 0.25, label: 'Sechzehntel (1/4)', glyph: '𝅘𝅥𝅰' },
  // Rests
  { type: 'rest', value: 'rest_quarter', duration: 1.0, label: 'Viertelpause', glyph: '𝄽' },
  { type: 'rest', value: 'rest_eighth', duration: 0.5, label: 'Achtelpause', glyph: '𝄾' },
  // Accidentals
  { type: 'accidental', value: '#', label: 'Kreuz (♯)', glyph: '♯' },
  { type: 'accidental', value: 'b', label: 'Be (♭)', glyph: '♭' },
  { type: 'accidental', value: 'natural', label: 'Auflösung (♮)', glyph: '♮' },
  // Choral Markings
  { type: 'choral', value: 'breath', label: 'Atemzeichen (Chor)', glyph: '’' },
  { type: 'choral', value: 'fermata', label: 'Fermate', glyph: '𝄐' },
  { type: 'choral', value: 'forte', label: 'Forte (f)', glyph: '𝄤' },
  { type: 'choral', value: 'piano', label: 'Piano (p)', glyph: '𝄡' },
];

export const NotationPalette: React.FC<NotationPaletteProps> = ({
  activeTool,
  onSelectTool,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-stone-950/80 border-b border-stone-800 text-stone-200 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="text-stone-400 font-medium mr-1 flex items-center gap-1">
          <Music className="w-3.5 h-3.5 text-amber-400" />
          Notation:
        </span>

        {/* Pointer / Drag Mode */}
        <button
          onClick={() => onSelectTool(null)}
          className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 transition-colors ${
            activeTool === null
              ? 'bg-amber-500 text-stone-950 font-semibold shadow-xs'
              : 'bg-stone-900 hover:bg-stone-800 text-stone-400 border border-stone-800'
          }`}
          title="Auswahl- & Drag-and-Drop Modus (Noten verschieben)"
        >
          <MousePointer className="w-3.5 h-3.5" />
          <span>Verschieben</span>
        </button>

        <span className="text-stone-700 mx-1">|</span>

        {/* Note Duration Buttons */}
        <div className="flex items-center gap-1 bg-stone-900/90 p-1 rounded-lg border border-stone-800">
          {TOOLS.filter((t) => t.type === 'note').map((tool) => {
            const isSelected =
              activeTool?.type === tool.type && activeTool?.value === tool.value;
            return (
              <button
                key={tool.value}
                onClick={() => onSelectTool(isSelected ? null : tool)}
                className={`px-2 py-0.5 rounded text-sm transition-all ${
                  isSelected
                    ? 'bg-amber-500 text-stone-950 font-bold shadow-xs'
                    : 'text-stone-300 hover:bg-stone-800 hover:text-amber-200'
                }`}
                title={`${tool.label} (Klicke auf die Notenlinie zum Einfügen)`}
              >
                <span className="font-serif text-base">{tool.glyph}</span>
              </button>
            );
          })}
        </div>

        {/* Pausen */}
        <div className="flex items-center gap-1 bg-stone-900/90 p-1 rounded-lg border border-stone-800">
          {TOOLS.filter((t) => t.type === 'rest').map((tool) => {
            const isSelected =
              activeTool?.type === tool.type && activeTool?.value === tool.value;
            return (
              <button
                key={tool.value}
                onClick={() => onSelectTool(isSelected ? null : tool)}
                className={`px-2 py-0.5 rounded text-sm transition-all ${
                  isSelected
                    ? 'bg-amber-500 text-stone-950 font-bold shadow-xs'
                    : 'text-stone-300 hover:bg-stone-800 hover:text-amber-200'
                }`}
                title={`${tool.label} einfügen`}
              >
                <span className="font-serif text-base">{tool.glyph}</span>
              </button>
            );
          })}
        </div>

        {/* Vorzeichen & Vokale */}
        <div className="hidden sm:flex items-center gap-1 bg-stone-900/90 p-1 rounded-lg border border-stone-800">
          {TOOLS.filter((t) => t.type === 'accidental' || t.type === 'choral').map((tool) => {
            const isSelected =
              activeTool?.type === tool.type && activeTool?.value === tool.value;
            return (
              <button
                key={tool.value}
                onClick={() => onSelectTool(isSelected ? null : tool)}
                className={`px-2 py-0.5 rounded text-xs transition-all ${
                  isSelected
                    ? 'bg-amber-500 text-stone-950 font-bold shadow-xs'
                    : 'text-stone-400 hover:bg-stone-800 hover:text-amber-200'
                }`}
                title={tool.label}
              >
                <span className="font-sans font-semibold">{tool.glyph}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="text-[11px] text-stone-400 flex items-center gap-2">
        <span className="hidden md:inline">
          Tipp: Noten direkt per <strong>Drag-and-Drop</strong> vertikal (Tonhöhe) oder horizontal (Takt) ziehen!
        </span>
      </div>
    </div>
  );
};
