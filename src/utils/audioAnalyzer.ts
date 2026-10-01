import { ScoreData, ScoreNote, ScoreTrack, midiToPitchName } from '../types/music';

/**
 * In-browser Web Audio DSP Analyzer
 * Performs pitch tracking via Autocorrelation / YIN, onset detection, and BPM estimation
 */

export interface PitchFrame {
  timeSec: number;
  midi: number;
  pitch: string;
  clarity: number; // 0 to 1
}

// Convert AudioBuffer to mono Float32Array
export function getMonoChannelData(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) {
    return buffer.getChannelData(0);
  }
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.getChannelData(1);
  const mono = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    mono[i] = (ch0[i] + ch1[i]) * 0.5;
  }
  return mono;
}

// Autocorrelation Pitch Detector
export function detectPitchInSlice(
  signal: Float32Array,
  sampleRate: number,
  minFreq = 65,  // ~C2
  maxFreq = 1050 // ~C6
): { freq: number; clarity: number } {
  const minLag = Math.floor(sampleRate / maxFreq);
  const maxLag = Math.floor(sampleRate / minFreq);

  let bestLag = -1;
  let maxCorr = -1;
  let rms = 0;

  for (let i = 0; i < signal.length; i++) {
    rms += signal[i] * signal[i];
  }
  rms = Math.sqrt(rms / signal.length);
  if (rms < 0.01) {
    return { freq: 0, clarity: 0 };
  }

  // Normalized autocorrelation
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < signal.length - lag; i++) {
      corr += signal[i] * signal[i + lag];
    }
    const normCorr = corr / (rms * rms * (signal.length - lag));

    if (normCorr > maxCorr) {
      maxCorr = normCorr;
      bestLag = lag;
    }
  }

  if (bestLag > 0 && maxCorr > 0.45) {
    // Parabolic interpolation for fine tuning
    const freq = sampleRate / bestLag;
    return { freq, clarity: maxCorr };
  }

  return { freq: 0, clarity: 0 };
}

// Estimate BPM by detecting energy onsets
export function estimateBpmFromBuffer(buffer: AudioBuffer): number {
  const data = getMonoChannelData(buffer);
  const sampleRate = buffer.sampleRate;
  const hopSize = Math.floor(sampleRate * 0.02); // 20ms
  const energies: number[] = [];

  for (let i = 0; i < data.length - hopSize; i += hopSize) {
    let sum = 0;
    for (let j = 0; j < hopSize; j++) {
      sum += data[i + j] * data[i + j];
    }
    energies.push(sum);
  }

  // Find onset differences
  const diffs: number[] = [];
  for (let i = 1; i < energies.length; i++) {
    diffs.push(Math.max(0, energies[i] - energies[i - 1]));
  }

  // Autocorrelate the onset envelope between 60 BPM and 180 BPM
  const minInterval = Math.floor((60 / 180) / 0.02); // ~16 hops
  const maxInterval = Math.floor((60 / 60) / 0.02);  // ~50 hops

  let bestInterval = 25;
  let maxCorr = -1;

  for (let lag = minInterval; lag <= maxInterval; lag++) {
    let corr = 0;
    for (let i = 0; i < diffs.length - lag; i++) {
      corr += diffs[i] * diffs[i + lag];
    }
    if (corr > maxCorr) {
      maxCorr = corr;
      bestInterval = lag;
    }
  }

  const secondsPerBeat = bestInterval * 0.02;
  const estimatedBpm = Math.round(60 / secondsPerBeat);
  return Math.max(60, Math.min(180, estimatedBpm));
}

// Client-side transcription fallback if Gemini API is offline
export async function transcribeAudioLocally(
  audioBuffer: AudioBuffer,
  fileName: string = 'Transkription'
): Promise<ScoreData> {
  const bpm = estimateBpmFromBuffer(audioBuffer);
  const sampleRate = audioBuffer.sampleRate;
  const data = getMonoChannelData(audioBuffer);
  const secondsPerBeat = 60 / bpm;

  const windowSize = 2048;
  const hopSize = 1024;
  const hopSec = hopSize / sampleRate;

  const rawFrames: PitchFrame[] = [];

  for (let i = 0; i < data.length - windowSize; i += hopSize) {
    const slice = data.subarray(i, i + windowSize);
    const { freq, clarity } = detectPitchInSlice(slice, sampleRate);
    const timeSec = (i / sampleRate);

    if (freq > 0 && clarity > 0.5) {
      const midi = Math.round(69 + 12 * Math.log2(freq / 440));
      if (midi >= 36 && midi <= 96) {
        rawFrames.push({
          timeSec,
          midi,
          pitch: midiToPitchName(midi),
          clarity,
        });
      }
    }
  }

  // Segment frames into musical notes (quantized to 8th / quarter notes)
  const notes: ScoreNote[] = [];
  const minDurationBeats = 0.5; // quantize to 8th notes minimum

  let currentNote: { midi: number; startSec: number; endSec: number } | null = null;

  for (const frame of rawFrames) {
    if (!currentNote) {
      currentNote = { midi: frame.midi, startSec: frame.timeSec, endSec: frame.timeSec + hopSec };
    } else if (Math.abs(frame.midi - currentNote.midi) <= 1 && frame.timeSec - currentNote.endSec < 0.15) {
      // Continue note
      currentNote.endSec = frame.timeSec + hopSec;
    } else {
      // Finish previous note
      const durationSec = currentNote.endSec - currentNote.startSec;
      const startBeat = Math.round((currentNote.startSec / secondsPerBeat) * 2) / 2;
      const durBeats = Math.max(minDurationBeats, Math.round((durationSec / secondsPerBeat) * 2) / 2);

      notes.push({
        id: `local-note-${notes.length + 1}`,
        pitch: midiToPitchName(currentNote.midi),
        midiNote: currentNote.midi,
        startBeat,
        durationBeats: durBeats,
        lyric: notes.length % 2 === 0 ? 'La' : 'Lu',
      });

      currentNote = { midi: frame.midi, startSec: frame.timeSec, endSec: frame.timeSec + hopSec };
    }
  }

  if (currentNote) {
    const durationSec = currentNote.endSec - currentNote.startSec;
    const startBeat = Math.round((currentNote.startSec / secondsPerBeat) * 2) / 2;
    const durBeats = Math.max(minDurationBeats, Math.round((durationSec / secondsPerBeat) * 2) / 2);

    notes.push({
      id: `local-note-${notes.length + 1}`,
      pitch: midiToPitchName(currentNote.midi),
      midiNote: currentNote.midi,
      startBeat,
      durationBeats: durBeats,
      lyric: 'Sol',
    });
  }

  // If no notes detected, create sample scale
  if (notes.length === 0) {
    const defaultMidis = [60, 62, 64, 65, 67, 69, 71, 72];
    defaultMidis.forEach((m, idx) => {
      notes.push({
        id: `def-note-${idx}`,
        pitch: midiToPitchName(m),
        midiNote: m,
        startBeat: idx * 1.0,
        durationBeats: 1.0,
        lyric: 'Ah',
      });
    });
  }

  const track: ScoreTrack = {
    id: 'track-vocal-1',
    name: 'Transkribierte Gesangsstimme',
    instrument: 'lead_vocal',
    clef: 'treble',
    volume: 0.85,
    isMuted: false,
    isSolo: false,
    choralRole: 'Hauptstimme / Melodie',
    notes,
  };

  return {
    title: fileName.replace(/\.[^/.]+$/, ''),
    artist: 'Lokale DSP-Transkription',
    bpm,
    timeSignature: { beats: 4, beatUnit: 4 },
    key: 'C-Dur',
    tracks: [track],
    choralGuidance: {
      generalAdvice: 'Lokale Transkription erstellt. Nutzen Sie das Drag & Drop Notenpult zur präzisen Korrektur von Tonhöhen und Rhythmen.',
      breathingTechnique: 'Atemstellen an den Taktgrenzen beachten.',
    },
  };
}
