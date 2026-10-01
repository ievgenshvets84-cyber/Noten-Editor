/**
 * Musical Data Structures and Helpers for PartiturStudio AI
 */

export type ClefType = 'treble' | 'bass' | 'alto';

export type InstrumentType =
  | 'choir_soprano'
  | 'choir_alto'
  | 'choir_tenor'
  | 'choir_bass'
  | 'lead_vocal'
  | 'piano'
  | 'guitar'
  | 'strings'
  | 'bass'
  | 'brass';

export type ArticulationType = 'normal' | 'staccato' | 'tenuto' | 'accent' | 'fermata';

export interface ScoreNote {
  id: string;
  pitch: string;          // e.g. "C4", "D#4", "Bb3", "E5"
  midiNote: number;       // 60 = C4, 62 = D4, etc.
  startBeat: number;      // beat relative to score start (0 = measure 1 beat 1)
  durationBeats: number;  // 1 = quarter note, 0.5 = eighth, 2 = half, 4 = whole, 0.25 = sixteenth
  lyric?: string;         // syllable or word under the note (e.g. "Freu-", "-de", "Göt-", "-ter-")
  isRest?: boolean;       // if true, this is a pause / rest
  choralMarking?: string; // e.g. "Atemzeichen", "Crescendo", "Kopfstimme", "Solo", "Tutti", "p", "f", "Legato"
  articulation?: ArticulationType;
  selected?: boolean;
}

export interface ScoreTrack {
  id: string;
  name: string;             // e.g. "Sopran (Chor)", "Alt", "Tenor", "Bass", "Klavier"
  instrument: InstrumentType;
  clef: ClefType;
  choralRole?: string;      // e.g. "Hauptmelodie", "Harmoniestimme (Terzen)", "Bassfundament"
  vocalRange?: string;      // e.g. "C4 - A5"
  volume: number;           // 0.0 to 1.0
  isMuted: boolean;
  isSolo: boolean;
  pan?: number;             // -1.0 to 1.0
  notes: ScoreNote[];
}

export interface TimeSignature {
  beats: number;     // e.g. 4
  beatUnit: number;  // e.g. 4 (quarter notes)
}

export interface ChoralGuidance {
  generalAdvice: string;
  breathingTechnique?: string;
  vocalTuningTips?: string;
  suggestedWarmups?: string[];
}

export interface SongSection {
  name: string;        // e.g. "Intro", "Strophe 1", "Refrain / Chor", "Outro"
  startMeasure: number; // 1-indexed
  endMeasure: number;
}

export interface ScoreData {
  title: string;
  artist?: string;
  bpm: number;
  timeSignature: TimeSignature;
  key: string;         // e.g. "C-Dur", "G-Dur", "d-Moll", "F-Dur"
  tracks: ScoreTrack[];
  sections?: SongSection[];
  choralGuidance?: ChoralGuidance;
}

// Note and Pitch Utilities
export const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLAT_PITCH_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export function midiToPitchName(midi: number, preferFlat = false): string {
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = midi % 12;
  const name = preferFlat ? FLAT_PITCH_NAMES[noteIndex] : PITCH_NAMES[noteIndex];
  return `${name}${octave}`;
}

export function pitchNameToMidi(pitch: string): number {
  if (!pitch) return 60;
  const match = pitch.match(/^([A-G][b#]?)(-?\d+)$/);
  if (!match) return 60;
  const note = match[1];
  const octave = parseInt(match[2], 10);
  let noteIndex = PITCH_NAMES.indexOf(note);
  if (noteIndex === -1) {
    noteIndex = FLAT_PITCH_NAMES.indexOf(note);
  }
  if (noteIndex === -1) return 60;
  return (octave + 1) * 12 + noteIndex;
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Stave line calculations
// Returns stave step position relative to Middle C (C4 = 0).
// In diatonic steps: C4=0, D4=1, E4=2, F4=3, G4=4, A4=5, B4=6, C5=7, etc.
export const DIATONIC_STEPS: Record<string, number> = {
  C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6
};

export function pitchToDiatonicStep(pitch: string): number {
  const match = pitch.match(/^([A-G])[b#]?(-?\d+)$/);
  if (!match) return 0;
  const letter = match[1];
  const octave = parseInt(match[2], 10);
  const baseStep = DIATONIC_STEPS[letter] || 0;
  // C4 is octave 4
  return (octave - 4) * 7 + baseStep;
}

export function diatonicStepToPitch(step: number, accidental: '' | '#' | 'b' = ''): string {
  const octave = Math.floor(step / 7) + 4;
  let modStep = step % 7;
  if (modStep < 0) modStep += 7;
  const letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const letter = letters[modStep];
  return `${letter}${accidental}${octave}`;
}

// Convert duration in beats to common musical name
export function durationToName(durationBeats: number): string {
  if (durationBeats >= 4) return 'Ganze Note (1)';
  if (durationBeats >= 2) return 'Halbe Note (1/2)';
  if (durationBeats >= 1) return 'Viertelnote (1/4)';
  if (durationBeats >= 0.5) return 'Achtelnote (1/8)';
  if (durationBeats >= 0.25) return 'Sechzehntelnote (1/16)';
  return `${durationBeats} Beats`;
}

// Standard German voice range references for choir checking
export const CHORAL_RANGES = {
  soprano: { minMidi: 60, maxMidi: 81, name: 'Sopran', label: 'C4 – A5' },
  alto: { minMidi: 55, maxMidi: 74, name: 'Alt', label: 'G3 – D5' },
  tenor: { minMidi: 48, maxMidi: 69, name: 'Tenor', label: 'C3 – A4' },
  bass: { minMidi: 40, maxMidi: 60, name: 'Bass', label: 'E2 – C4' },
};
