import React from 'react';
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Repeat,
  Download,
  FileCode,
  Printer,
  Music2,
  Sliders,
  ZoomIn,
  ZoomOut,
  Upload,
  BookOpen,
  Volume2,
} from 'lucide-react';
import { ScoreData } from '../types/music';
import { downloadMidiFile } from '../utils/midiGenerator';
import { downloadMusicXmlFile } from '../utils/musicXmlGenerator';

interface ToolbarProps {
  score: ScoreData;
  isPlaying: boolean;
  isLooping: boolean;
  zoomLevel: number;
  activePanel: 'score' | 'mixer' | 'choir' | 'upload';
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onToggleLoop: () => void;
  onRewind: () => void;
  onSetBpm: (bpm: number) => void;
  onTransposeScore: (semitones: number) => void;
  onZoomChange: (zoom: number) => void;
  onTogglePanel: (panel: 'score' | 'mixer' | 'choir' | 'upload') => void;
  onPrintScore: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  score,
  isPlaying,
  isLooping,
  zoomLevel,
  activePanel,
  onPlay,
  onPause,
  onStop,
  onToggleLoop,
  onRewind,
  onSetBpm,
  onTransposeScore,
  onZoomChange,
  onTogglePanel,
  onPrintScore,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full bg-stone-950/95 backdrop-blur-md border-b border-stone-800 text-stone-200 px-4 py-2.5 shadow-md">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Audio Upload / Preset Trigger */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 pr-2 border-r border-stone-800">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-stone-950 shadow-inner">
              <Music2 className="w-5 h-5 font-bold" />
            </div>
            <div>
              <h1 className="font-serif font-bold text-sm tracking-wide text-amber-200 leading-none">
                PartiturStudio AI
              </h1>
              <span className="text-[10px] text-stone-400 font-sans">
                Audio · Noten · Chor · MIDI
              </span>
            </div>
          </div>

          {/* New Audio / Transcribe Button */}
          <button
            onClick={() => onTogglePanel('upload')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm ${
              activePanel === 'upload'
                ? 'bg-amber-500 text-stone-950 font-semibold'
                : 'bg-stone-800 hover:bg-stone-700 text-amber-300 border border-amber-500/30'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Audio laden / Transkribieren</span>
          </button>
        </div>

        {/* Transport & Playback Center Controls */}
        <div className="flex items-center gap-2 bg-stone-900/90 px-3 py-1 rounded-xl border border-stone-800 shadow-inner">
          <button
            onClick={onRewind}
            className="p-1.5 text-stone-400 hover:text-stone-100 hover:bg-stone-800 rounded-md transition-colors"
            title="Zurück zum Anfang (Rewind)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {isPlaying ? (
            <button
              onClick={onPause}
              className="p-2 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-lg shadow-sm transition-transform active:scale-95"
              title="Pause"
            >
              <Pause className="w-4 h-4 fill-current" />
            </button>
          ) : (
            <button
              onClick={onPlay}
              className="p-2 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-lg shadow-sm transition-transform active:scale-95"
              title="Partitur abspielen (Echtzeit-Synthese)"
            >
              <Play className="w-4 h-4 fill-current ml-0.5" />
            </button>
          )}

          <button
            onClick={onStop}
            className="p-1.5 text-stone-400 hover:text-stone-100 hover:bg-stone-800 rounded-md transition-colors"
            title="Stopp"
          >
            <Square className="w-4 h-4" />
          </button>

          <button
            onClick={onToggleLoop}
            className={`p-1.5 rounded-md transition-colors ${
              isLooping
                ? 'text-amber-400 bg-amber-500/20 border border-amber-500/40'
                : 'text-stone-400 hover:text-stone-100 hover:bg-stone-800'
            }`}
            title="Schleifenwiedergabe (Loop)"
          >
            <Repeat className="w-4 h-4" />
          </button>

          {/* Tempo BPM Slider & Control */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-stone-800 text-xs">
            <span className="text-stone-400">Tempo:</span>
            <input
              type="number"
              min={40}
              max={240}
              value={score.bpm || 120}
              onChange={(e) => onSetBpm(parseInt(e.target.value, 10) || 120)}
              className="w-12 bg-stone-950 border border-stone-700 rounded px-1.5 py-0.5 text-center text-xs font-mono font-semibold text-amber-300 focus:outline-none focus:border-amber-500"
            />
            <span className="text-[11px] text-stone-500">BPM</span>
          </div>

          {/* Transpose Controls (+/- Halbton) */}
          <div className="flex items-center gap-1 pl-2 border-l border-stone-800 text-xs">
            <span className="text-stone-400">Transponieren:</span>
            <button
              onClick={() => onTransposeScore(-1)}
              className="px-1.5 py-0.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded text-xs"
              title="-1 Halbton"
            >
              -1
            </button>
            <button
              onClick={() => onTransposeScore(1)}
              className="px-1.5 py-0.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded text-xs"
              title="+1 Halbton"
            >
              +1
            </button>
          </div>
        </div>

        {/* View Toggles & Export Group */}
        <div className="flex items-center gap-2">
          {/* Zoom In / Out */}
          <div className="flex items-center gap-1 bg-stone-900 px-2 py-1 rounded-lg border border-stone-800">
            <button
              onClick={() => onZoomChange(Math.max(0.7, zoomLevel - 0.1))}
              className="p-1 text-stone-400 hover:text-stone-200"
              title="Verkleinern"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono text-stone-400 px-1">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={() => onZoomChange(Math.min(1.5, zoomLevel + 0.1))}
              className="p-1 text-stone-400 hover:text-stone-200"
              title="Vergrößern"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mixer Panel Toggle */}
          <button
            onClick={() => onTogglePanel('mixer')}
            className={`p-2 rounded-lg text-xs flex items-center gap-1.5 transition-colors ${
              activePanel === 'mixer'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-800'
            }`}
            title="Spur-Mixer & Instrumente"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Mixer</span>
          </button>

          {/* Choir Guidance Toggle */}
          <button
            onClick={() => onTogglePanel('choir')}
            className={`p-2 rounded-lg text-xs flex items-center gap-1.5 transition-colors ${
              activePanel === 'choir'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-800'
            }`}
            title="Chor-Anleitung & Stimmumfang"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Chor-Guide</span>
          </button>

          {/* Export Dropdown / Buttons */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-stone-800">
            {/* MIDI Download Button */}
            <button
              onClick={() => downloadMidiFile(score)}
              className="px-3 py-1.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-stone-950 font-semibold text-xs rounded-lg flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
              title="Mehrspur-MIDI Datei exportieren (.mid)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>MIDI Export</span>
            </button>

            {/* MusicXML Download Button */}
            <button
              onClick={() => downloadMusicXmlFile(score)}
              className="px-2.5 py-1.5 bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-300 hover:text-stone-100 text-xs rounded-lg flex items-center gap-1.5 transition-colors"
              title="MusicXML für MuseScore / Sibelius (.musicxml)"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">MusicXML</span>
            </button>

            {/* Print Score */}
            <button
              onClick={onPrintScore}
              className="p-1.5 bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-400 hover:text-stone-200 rounded-lg transition-colors"
              title="Partitur drucken / als PDF speichern"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
