import { ScoreData, ScoreTrack, ScoreNote } from '../types/music';

/**
 * Pure TypeScript Standard MIDI File (SMF Format 1) Generator
 * Creates multi-track .mid files compatible with DAWs, Sibelius, MuseScore, Logic Pro, etc.
 */

const TICKS_PER_BEAT = 480;

// General MIDI Program Numbers (0-indexed)
const INSTRUMENT_GM_MAP: Record<string, number> = {
  choir_soprano: 52, // Choir Aahs
  choir_alto: 52,    // Choir Aahs
  choir_tenor: 53,   // Voice Oohs
  choir_bass: 52,    // Choir Aahs
  lead_vocal: 54,    // Synth Voice
  piano: 0,          // Acoustic Grand Piano
  guitar: 24,        // Acoustic Guitar (nylon/steel)
  strings: 48,       // String Ensemble 1
  bass: 32,          // Acoustic Bass
  brass: 56,         // Trumpet
};

// Encode a number as MIDI Variable Length Quantity (VLQ)
function writeVLQ(value: number): number[] {
  let buffer = value & 0x7f;
  const bytes: number[] = [];

  while ((value >>= 7) > 0) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }

  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) {
      buffer >>= 8;
    } else {
      break;
    }
  }

  return bytes;
}

// Convert string to ASCII byte array
function stringToBytes(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i) & 0xff);
  }
  return bytes;
}

// Convert 32-bit integer to 4 bytes big endian
function write32Bit(num: number): number[] {
  return [
    (num >> 24) & 0xff,
    (num >> 16) & 0xff,
    (num >> 8) & 0xff,
    num & 0xff,
  ];
}

// Convert 16-bit integer to 2 bytes big endian
function write16Bit(num: number): number[] {
  return [(num >> 8) & 0xff, num & 0xff];
}

interface MidiTimedEvent {
  tick: number;
  data: number[];
}

export function generateMidiBytes(score: ScoreData): Uint8Array {
  const tracksBytes: number[][] = [];

  // Track 0: Conductor Track (Tempo, Time Signature, Title, Copyright)
  const conductorEvents: MidiTimedEvent[] = [];

  // Sequence/Track Name Meta Event
  if (score.title) {
    const titleBytes = stringToBytes(score.title);
    conductorEvents.push({
      tick: 0,
      data: [0xff, 0x03, titleBytes.length, ...titleBytes],
    });
  }

  // Time Signature: 0xFF 0x58 0x04 [nn, dd, cc, bb]
  const beats = score.timeSignature?.beats || 4;
  const beatUnit = score.timeSignature?.beatUnit || 4;
  const denomPower = Math.round(Math.log2(beatUnit));
  conductorEvents.push({
    tick: 0,
    data: [0xff, 0x58, 0x04, beats, denomPower, 24, 8],
  });

  // Tempo: 0xFF 0x51 0x03 [tt tt tt] (microseconds per quarter note)
  const bpm = Math.max(20, Math.min(300, score.bpm || 120));
  const usPerQuarter = Math.round(60000000 / bpm);
  conductorEvents.push({
    tick: 0,
    data: [
      0xff,
      0x51,
      0x03,
      (usPerQuarter >> 16) & 0xff,
      (usPerQuarter >> 8) & 0xff,
      usPerQuarter & 0xff,
    ],
  });

  // Compile Conductor Track
  const conductorTrackBytes = compileMidiTrack(conductorEvents);
  tracksBytes.push(conductorTrackBytes);

  // Tracks 1..N: Instrument & Vocal Tracks
  score.tracks.forEach((track, index) => {
    // Avoid channel 9 (which is reserved for drums in GM)
    let channel = index % 16;
    if (channel === 9) channel = 10;

    const trackEvents: MidiTimedEvent[] = [];

    // Track Name
    const nameBytes = stringToBytes(track.name || `Spur ${index + 1}`);
    trackEvents.push({
      tick: 0,
      data: [0xff, 0x03, nameBytes.length, ...nameBytes],
    });

    // Program Change (Instrument)
    const patch = INSTRUMENT_GM_MAP[track.instrument] ?? 0;
    trackEvents.push({
      tick: 0,
      data: [0xc0 | channel, patch],
    });

    // Volume Controller CC 7
    const vol = Math.round(Math.max(0, Math.min(1, track.volume ?? 0.8)) * 127);
    trackEvents.push({
      tick: 0,
      data: [0xb0 | channel, 0x07, vol],
    });

    // Pan Controller CC 10
    const panVal = Math.round(((track.pan ?? 0) + 1) * 63.5);
    trackEvents.push({
      tick: 0,
      data: [0xb0 | channel, 0x0a, Math.max(0, Math.min(127, panVal))],
    });

    // Process all notes
    track.notes.forEach((note) => {
      if (note.isRest) return;

      const noteOnTick = Math.round(note.startBeat * TICKS_PER_BEAT);
      const durationTicks = Math.max(20, Math.round(note.durationBeats * TICKS_PER_BEAT));
      const noteOffTick = noteOnTick + durationTicks;

      // Lyric meta event if syllable exists
      if (note.lyric && note.lyric.trim()) {
        const lyricBytes = stringToBytes(note.lyric.trim());
        trackEvents.push({
          tick: noteOnTick,
          data: [0xff, 0x05, lyricBytes.length, ...lyricBytes],
        });
      }

      // Note On: 0x90 | channel, pitch, velocity
      const velocity = note.articulation === 'accent' ? 115 : 90;
      trackEvents.push({
        tick: noteOnTick,
        data: [0x90 | channel, Math.max(1, Math.min(127, note.midiNote)), velocity],
      });

      // Note Off: 0x80 | channel, pitch, 0
      trackEvents.push({
        tick: noteOffTick,
        data: [0x80 | channel, Math.max(1, Math.min(127, note.midiNote)), 0],
      });
    });

    // Sort events by tick (with Note Off before Note On at the same tick)
    trackEvents.sort((a, b) => {
      if (a.tick !== b.tick) return a.tick - b.tick;
      return a.data[0] - b.data[0];
    });

    tracksBytes.push(compileMidiTrack(trackEvents));
  });

  // Assemble full MIDI File
  const totalTracks = tracksBytes.length;
  const header: number[] = [
    0x4d, 0x54, 0x68, 0x64, // 'MThd'
    0x00, 0x00, 0x00, 0x06, // Header length = 6
    0x00, 0x01,             // Format 1 (multi-track synchronous)
    ...write16Bit(totalTracks),
    ...write16Bit(TICKS_PER_BEAT),
  ];

  const fullBytes: number[] = [...header];
  for (const tBytes of tracksBytes) {
    fullBytes.push(...tBytes);
  }

  return new Uint8Array(fullBytes);
}

function compileMidiTrack(events: MidiTimedEvent[]): number[] {
  const body: number[] = [];
  let currentTick = 0;

  for (const event of events) {
    const delta = Math.max(0, event.tick - currentTick);
    currentTick = event.tick;

    body.push(...writeVLQ(delta));
    body.push(...event.data);
  }

  // End of Track Meta Event: delta 0, 0xFF 0x2F 0x00
  body.push(0x00, 0xff, 0x2f, 0x00);

  // 'MTrk' + 4-byte length + track body
  return [
    0x4d, 0x54, 0x72, 0x6b, // 'MTrk'
    ...write32Bit(body.length),
    ...body,
  ];
}

export function exportScoreToMidiBlob(score: ScoreData): Blob {
  const bytes = generateMidiBytes(score);
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/midi' });
}

export function downloadMidiFile(score: ScoreData, filename?: string): void {
  const blob = exportScoreToMidiBlob(score);
  const safeName = (filename || score.title || 'partitur')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/gi, '_');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.mid`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
