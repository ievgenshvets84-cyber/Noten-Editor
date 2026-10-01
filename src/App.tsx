import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ScoreData, ScoreTrack, ScoreNote, PITCH_NAMES } from './types/music';
import { PRESET_ODE_AN_DIE_FREUDE } from './utils/presets';
import { audioSynth } from './utils/audioSynth';
import { Toolbar } from './components/Toolbar';
import { ScoreViewer } from './components/ScoreViewer';
import { NotationPalette, PaletteTool } from './components/NotationPalette';
import { TrackMixer } from './components/TrackMixer';
import { ChoirGuidePanel } from './components/ChoirGuidePanel';
import { AudioUploader } from './components/AudioUploader';
import { Undo2, Redo2, Sliders, BookOpen, Music } from 'lucide-react';

export default function App() {
  const [score, setScore] = useState<ScoreData>(PRESET_ODE_AN_DIE_FREUDE);
  const [history, setHistory] = useState<ScoreData[]>([PRESET_ODE_AN_DIE_FREUDE]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [activeNoteIds, setActiveNoteIds] = useState<Set<string>>(new Set());

  // UI state
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<'score' | 'mixer' | 'choir' | 'upload'>('score');
  const [activePaletteTool, setActivePaletteTool] = useState<PaletteTool | null>(null);

  // Synchronize score updates with history
  const updateScoreWithHistory = useCallback((newScore: ScoreData) => {
    setScore(newScore);
    setHistory((prev) => {
      const sliced = prev.slice(0, historyIndex + 1);
      return [...sliced, newScore];
    });
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  // Undo / Redo
  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIdx = historyIndex - 1;
      setHistoryIndex(newIdx);
      setScore(history[newIdx]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIdx = historyIndex + 1;
      setHistoryIndex(newIdx);
      setScore(history[newIdx]);
    }
  };

  // Keyboard shortcuts (Space for Play/Pause, Ctrl+Z for Undo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If typing in an input field, do not hijack
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (isPlaying) {
          handlePause();
        } else {
          handlePlay();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, currentBeat, score, historyIndex]);

  // Playback handlers
  const handlePlay = () => {
    setIsPlaying(true);
    audioSynth.startPlayback(
      score,
      currentBeat,
      (beat, noteIds) => {
        setCurrentBeat(beat);
        setActiveNoteIds(noteIds);
      },
      () => {
        setIsPlaying(false);
        setActiveNoteIds(new Set());
        setCurrentBeat(0);
      }
    );
  };

  const handlePause = () => {
    audioSynth.stopPlayback();
    setIsPlaying(false);
    setActiveNoteIds(new Set());
  };

  const handleStop = () => {
    audioSynth.stopPlayback();
    setIsPlaying(false);
    setCurrentBeat(0);
    setActiveNoteIds(new Set());
  };

  const handleToggleLoop = () => {
    const newLoop = !isLooping;
    setIsLooping(newLoop);
    audioSynth.setLoop(newLoop, 0, 32);
  };

  const handleRewind = () => {
    handleStop();
  };

  const handleSeekBeat = (beat: number) => {
    setCurrentBeat(beat);
    if (isPlaying) {
      audioSynth.startPlayback(
        score,
        beat,
        (b, noteIds) => {
          setCurrentBeat(b);
          setActiveNoteIds(noteIds);
        },
        () => {
          setIsPlaying(false);
          setActiveNoteIds(new Set());
          setCurrentBeat(0);
        }
      );
    }
  };

  const handleSetBpm = (newBpm: number) => {
    const updated = { ...score, bpm: newBpm };
    updateScoreWithHistory(updated);
    if (isPlaying) {
      audioSynth.stopPlayback();
      audioSynth.startPlayback(
        updated,
        currentBeat,
        (b, noteIds) => {
          setCurrentBeat(b);
          setActiveNoteIds(noteIds);
        },
        () => {
          setIsPlaying(false);
          setActiveNoteIds(new Set());
          setCurrentBeat(0);
        }
      );
    }
  };

  // Transpose whole score by semitones (+1 / -1)
  const handleTransposeScore = (semitones: number) => {
    const updatedTracks = score.tracks.map((t) => ({
      ...t,
      notes: t.notes.map((n) => {
        if (n.isRest) return n;
        const newMidi = n.midiNote + semitones;
        const octave = Math.floor(newMidi / 12) - 1;
        const pitchLetter = PITCH_NAMES[newMidi % 12];
        return {
          ...n,
          midiNote: newMidi,
          pitch: `${pitchLetter}${octave}`,
        };
      }),
    }));

    updateScoreWithHistory({
      ...score,
      tracks: updatedTracks,
    });
  };

  const handlePrintScore = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col font-sans selection:bg-amber-500/30 selection:text-amber-200">
      {/* Top Application Toolbar */}
      <Toolbar
        score={score}
        isPlaying={isPlaying}
        isLooping={isLooping}
        zoomLevel={zoomLevel}
        activePanel={activePanel}
        onPlay={handlePlay}
        onPause={handlePause}
        onStop={handleStop}
        onToggleLoop={handleToggleLoop}
        onRewind={handleRewind}
        onSetBpm={handleSetBpm}
        onTransposeScore={handleTransposeScore}
        onZoomChange={setZoomLevel}
        onTogglePanel={(p) => setActivePanel(activePanel === p ? 'score' : p)}
        onPrintScore={handlePrintScore}
      />

      {/* Floating / Sub-bar with Notation Palette & Undo/Redo */}
      <div className="flex items-center justify-between px-4 border-b border-stone-800 bg-stone-950/70">
        <NotationPalette
          activeTool={activePaletteTool}
          onSelectTool={setActivePaletteTool}
        />

        {/* Undo / Redo controls */}
        <div className="flex items-center gap-1 shrink-0 pl-2">
          <button
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            className="p-1 text-stone-400 hover:text-stone-200 disabled:opacity-30 rounded transition-colors"
            title="Rückgängig (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            className="p-1 text-stone-400 hover:text-stone-200 disabled:opacity-30 rounded transition-colors"
            title="Wiederholen (Ctrl+Shift+Z)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Workspace Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* Conditional Auxiliary Panels */}
        {activePanel === 'mixer' && (
          <TrackMixer
            score={score}
            onUpdateScore={updateScoreWithHistory}
            onClose={() => setActivePanel('score')}
          />
        )}

        {activePanel === 'choir' && (
          <ChoirGuidePanel
            score={score}
            onClose={() => setActivePanel('score')}
          />
        )}

        {/* Interactive Sheet Music Score Viewer */}
        <section aria-label="Notenpartitur" className="space-y-2">
          <ScoreViewer
            score={score}
            currentBeat={currentBeat}
            activeNoteIds={activeNoteIds}
            zoomLevel={zoomLevel}
            selectedTrackId={selectedTrackId}
            onSelectTrack={setSelectedTrackId}
            onUpdateScore={updateScoreWithHistory}
            onSeekBeat={handleSeekBeat}
            activePaletteTool={activePaletteTool}
          />
        </section>

        {/* Song Structure & Vocal Directions Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* Box 1: Song & Choir Overview */}
          <div className="p-4 bg-stone-900/60 border border-stone-800/80 rounded-xl space-y-2 text-xs">
            <h3 className="font-serif font-semibold text-sm text-amber-300 flex items-center gap-1.5">
              <Music className="w-3.5 h-3.5 text-amber-400" />
              Partitur-Übersicht
            </h3>
            <p className="text-stone-300">
              <strong>{score.title}</strong> · {score.tracks.length} Stimmen/Instrumente
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {score.tracks.map((t) => (
                <span
                  key={t.id}
                  className="px-2 py-0.5 rounded bg-stone-800 text-[11px] text-stone-300"
                >
                  {t.name}
                </span>
              ))}
            </div>
          </div>

          {/* Box 2: Drag & Drop Quick Guide */}
          <div className="p-4 bg-stone-900/60 border border-stone-800/80 rounded-xl space-y-1.5 text-xs text-stone-300">
            <h3 className="font-serif font-semibold text-sm text-amber-300">
              Drag-and-Drop Editor
            </h3>
            <p className="text-stone-400">
              • <strong>Vertikal ziehen</strong>: Tonhöhe verändern mit Sofort-Klang
            </p>
            <p className="text-stone-400">
              • <strong>Horizontal ziehen</strong>: Note auf Zählzeit verschieben
            </p>
            <p className="text-stone-400">
              • <strong>Doppelklick</strong>: Silbentext & Atemhinweise direkt bearbeiten
            </p>
          </div>

          {/* Box 3: Quick Actions */}
          <div className="p-4 bg-stone-900/60 border border-stone-800/80 rounded-xl space-y-2 text-xs flex flex-col justify-between">
            <div>
              <h3 className="font-serif font-semibold text-sm text-amber-300 mb-1">
                Echtzeit-Arrangement
              </h3>
              <p className="text-stone-400">
                Spur-Lautstärken anpassen, Stimmen stummschalten (Mute) oder im Chor-Guide Tonumfänge prüfen.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setActivePanel('mixer')}
                className="flex-1 py-1.5 px-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <Sliders className="w-3 h-3 text-amber-400" />
                Mixer öffnen
              </button>
              <button
                onClick={() => setActivePanel('choir')}
                className="flex-1 py-1.5 px-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <BookOpen className="w-3 h-3 text-amber-400" />
                Chor-Guide
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Audio Uploader Modal */}
      {activePanel === 'upload' && (
        <AudioUploader
          onScoreLoaded={(newScore) => {
            updateScoreWithHistory(newScore);
            setActivePanel('score');
          }}
          onClose={() => setActivePanel('score')}
        />
      )}

      {/* Delicate, quiet Footer */}
      <footer className="w-full border-t border-stone-800/80 py-4 px-6 text-center text-xs text-stone-500">
        PartiturStudio AI · Notengenerierung &amp; Chor-Arrangements mit MIDI- &amp; MusicXML-Export
      </footer>
    </div>
  );
}
