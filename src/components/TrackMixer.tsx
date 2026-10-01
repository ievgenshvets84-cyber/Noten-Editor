import React from 'react';
import { ScoreData, ScoreTrack, InstrumentType } from '../types/music';
import { Volume2, VolumeX, Sliders, ChevronDown, Music, Mic } from 'lucide-react';
import { audioSynth } from '../utils/audioSynth';

interface TrackMixerProps {
  score: ScoreData;
  onUpdateScore: (updatedScore: ScoreData) => void;
  onClose: () => void;
}

const INSTRUMENT_OPTIONS: { id: InstrumentType; label: string; group: string }[] = [
  { id: 'choir_soprano', label: 'Chor: Sopran (Aahs)', group: 'Vokal / Chor' },
  { id: 'choir_alto', label: 'Chor: Alt (Aahs)', group: 'Vokal / Chor' },
  { id: 'choir_tenor', label: 'Chor: Tenor (Oohs)', group: 'Vokal / Chor' },
  { id: 'choir_bass', label: 'Chor: Bass (Aahs)', group: 'Vokal / Chor' },
  { id: 'lead_vocal', label: 'Lead Gesang / Solo', group: 'Vokal / Chor' },
  { id: 'piano', label: 'Konzertflügel (Piano)', group: 'Tasten' },
  { id: 'guitar', label: 'Akustikgitarre', group: 'Saiten' },
  { id: 'strings', label: 'Streicher-Ensemble', group: 'Streicher' },
  { id: 'bass', label: 'Akustik-/E-Bass', group: 'Bass' },
];

export const TrackMixer: React.FC<TrackMixerProps> = ({
  score,
  onUpdateScore,
  onClose,
}) => {
  const handleToggleMute = (trackId: string) => {
    const updated = score.tracks.map((t) =>
      t.id === trackId ? { ...t, isMuted: !t.isMuted } : t
    );
    onUpdateScore({ ...score, tracks: updated });
  };

  const handleToggleSolo = (trackId: string) => {
    const updated = score.tracks.map((t) =>
      t.id === trackId ? { ...t, isSolo: !t.isSolo } : t
    );
    onUpdateScore({ ...score, tracks: updated });
  };

  const handleVolumeChange = (trackId: string, vol: number) => {
    const updated = score.tracks.map((t) =>
      t.id === trackId ? { ...t, volume: vol } : t
    );
    onUpdateScore({ ...score, tracks: updated });
  };

  const handleInstrumentChange = (trackId: string, inst: InstrumentType) => {
    const updated = score.tracks.map((t) =>
      t.id === trackId ? { ...t, instrument: inst } : t
    );
    onUpdateScore({ ...score, tracks: updated });
  };

  const handleTransposeTrack = (trackId: string, semitones: number) => {
    const updated = score.tracks.map((t) => {
      if (t.id !== trackId) return t;
      return {
        ...t,
        notes: t.notes.map((n) => {
          if (n.isRest) return n;
          const newMidi = n.midiNote + semitones;
          // compute pitch name
          const octave = Math.floor(newMidi / 12) - 1;
          const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
          const newPitch = `${notes[newMidi % 12]}${octave}`;
          return {
            ...n,
            midiNote: newMidi,
            pitch: newPitch,
          };
        }),
      };
    });
    onUpdateScore({ ...score, tracks: updated });
  };

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-xl p-5 shadow-2xl text-stone-100">
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-stone-800">
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-amber-400" />
          <h2 className="font-serif font-bold text-base text-amber-200">
            Multi-Track Spur-Mixer & Arrangement
          </h2>
          <span className="text-xs text-stone-400">
            ({score.tracks.length} Spuren)
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-stone-400 hover:text-stone-200 text-xs px-2.5 py-1 bg-stone-800 hover:bg-stone-700 rounded-md transition-colors"
        >
          Schließen
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {score.tracks.map((track) => {
          const isVocal =
            track.instrument.startsWith('choir') || track.instrument === 'lead_vocal';

          return (
            <div
              key={track.id}
              className={`p-4 rounded-xl border transition-all ${
                track.isSolo
                  ? 'bg-amber-950/20 border-amber-500/50 shadow-md'
                  : track.isMuted
                  ? 'bg-stone-950/40 border-stone-800 opacity-60'
                  : 'bg-stone-950/80 border-stone-800 hover:border-stone-700'
              }`}
            >
              {/* Track Title & Badge */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  {isVocal ? (
                    <Mic className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : (
                    <Music className="w-4 h-4 text-stone-400 shrink-0" />
                  )}
                  <span className="font-semibold text-sm truncate text-stone-100">
                    {track.name}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Mute Button */}
                  <button
                    onClick={() => handleToggleMute(track.id)}
                    className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${
                      track.isMuted
                        ? 'bg-red-600 text-white'
                        : 'bg-stone-800 hover:bg-stone-700 text-stone-400'
                    }`}
                    title="Spur stummschalten (Mute)"
                  >
                    M
                  </button>

                  {/* Solo Button */}
                  <button
                    onClick={() => handleToggleSolo(track.id)}
                    className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${
                      track.isSolo
                        ? 'bg-amber-500 text-stone-950'
                        : 'bg-stone-800 hover:bg-stone-700 text-stone-400'
                    }`}
                    title="Spur solo schalten"
                  >
                    S
                  </button>
                </div>
              </div>

              {/* Sub-label role */}
              {track.choralRole && (
                <p className="text-[11px] text-amber-300/80 mb-3 truncate">
                  {track.choralRole}
                </p>
              )}

              {/* Volume Slider */}
              <div className="space-y-1 mb-3">
                <div className="flex justify-between text-[11px] text-stone-400">
                  <span>Lautstärke</span>
                  <span className="font-mono">{Math.round((track.volume ?? 0.8) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={track.volume ?? 0.8}
                  onChange={(e) => handleVolumeChange(track.id, parseFloat(e.target.value))}
                  className="w-full accent-amber-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Instrument Sound Selector */}
              <div className="space-y-1 mb-3">
                <label className="text-[11px] text-stone-400 block">Klangfarbe / Instrument</label>
                <select
                  value={track.instrument}
                  onChange={(e) =>
                    handleInstrumentChange(track.id, e.target.value as InstrumentType)
                  }
                  className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2.5 py-1.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                >
                  {INSTRUMENT_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Track Metadata & Quick Transposition */}
              <div className="pt-2 border-t border-stone-800/80 flex items-center justify-between text-[11px] text-stone-400">
                <span>{track.notes.length} Noten</span>
                <div className="flex items-center gap-1">
                  <span>Okt:</span>
                  <button
                    onClick={() => handleTransposeTrack(track.id, -12)}
                    className="px-1.5 py-0.5 bg-stone-800 hover:bg-stone-700 rounded text-stone-300"
                    title="-1 Oktave"
                  >
                    -8va
                  </button>
                  <button
                    onClick={() => handleTransposeTrack(track.id, 12)}
                    className="px-1.5 py-0.5 bg-stone-800 hover:bg-stone-700 rounded text-stone-300"
                    title="+1 Oktave"
                  >
                    +8va
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
