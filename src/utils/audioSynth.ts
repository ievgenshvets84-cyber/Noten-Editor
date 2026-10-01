import { InstrumentType, midiToFrequency, pitchNameToMidi, ScoreData, ScoreNote, ScoreTrack } from '../types/music';

/**
 * Polyphonic Web Audio Synthesizer and Score Playback Engine
 * Provides expressive sound synthesis for Choir, Piano, Guitar, Strings, and Bass
 * with real-time score auditioning and scheduled playback.
 */

class AudioSynthEngine {
  private ctx: AudioContext | null = null;
  private isPlaying: boolean = false;
  private currentBeat: number = 0;
  private timerId: number | null = null;
  private activeScore: ScoreData | null = null;
  private scheduledSources: { stop: () => void }[] = [];
  private onBeatUpdateCallback: ((beat: number, activeNoteIds: Set<string>) => void) | null = null;
  private onPlaybackEndedCallback: (() => void) | null = null;
  private startTime: number = 0;
  private startBeatOffset: number = 0;
  private loopEnabled: boolean = false;
  private loopStartBeat: number = 0;
  private loopEndBeat: number = 16;
  private masterVolume: number = 0.85;

  private initContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtxClass();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  // Play a single note for real-time auditioning (drag & drop, click)
  public playAuditionNote(
    pitch: string | number,
    instrument: InstrumentType = 'piano',
    duration = 0.6,
    volume = 0.8
  ): void {
    const ctx = this.initContext();
    const midi = typeof pitch === 'number' ? pitch : pitchNameToMidi(pitch);
    const freq = midiToFrequency(midi);
    const now = ctx.currentTime;

    this.synthesizeNote(ctx, freq, instrument, now, duration, volume * this.masterVolume);
  }

  // Synthesize sound for different instruments
  private synthesizeNote(
    ctx: AudioContext,
    freq: number,
    instrument: InstrumentType,
    startTime: number,
    duration: number,
    gainLevel: number
  ): { stop: () => void } {
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0, startTime);
    masterGain.connect(ctx.destination);

    const isChoir =
      instrument.startsWith('choir') || instrument === 'lead_vocal';

    if (isChoir) {
      // Choir Aahs synthesis: Dual detuned oscillators + Vocal Formant Filter
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(freq, startTime);
      osc2.frequency.setValueAtTime(freq * 1.003, startTime); // subtle natural chorus

      // Vocal Formant Bandpass Filters (F1 ~ 800Hz, F2 ~ 1250Hz for "Ah")
      const formantFilter = ctx.createBiquadFilter();
      formantFilter.type = 'bandpass';
      formantFilter.frequency.setValueAtTime(instrument === 'choir_bass' ? 600 : 950, startTime);
      formantFilter.Q.setValueAtTime(3.5, startTime);

      // Lowpass smoothing
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2800, startTime);

      // Vocal Envelope: Smooth vocal onset (attack ~0.08s) and release
      const attack = Math.min(0.08, duration * 0.2);
      const release = 0.15;
      const targetGain = Math.max(0.001, gainLevel * 0.7);

      masterGain.gain.setValueAtTime(0.0001, startTime);
      masterGain.gain.exponentialRampToValueAtTime(targetGain, startTime + attack);
      masterGain.gain.setValueAtTime(targetGain, startTime + Math.max(attack, duration - release));
      masterGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration + release);

      osc1.connect(formantFilter);
      osc2.connect(formantFilter);
      formantFilter.connect(lp);
      lp.connect(masterGain);

      osc1.start(startTime);
      osc2.start(startTime);
      osc1.stop(startTime + duration + release + 0.05);
      osc2.stop(startTime + duration + release + 0.05);

      return {
        stop: () => {
          try {
            masterGain.gain.setValueAtTime(0.0001, ctx.currentTime);
            osc1.stop();
            osc2.stop();
          } catch {}
        },
      };
    } else if (instrument === 'piano') {
      // Acoustic Grand Piano: Multiple harmonics with percussive attack and warm exponential decay
      const osc = ctx.createOscillator();
      const subOsc = ctx.createOscillator();
      osc.type = 'triangle';
      subOsc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      subOsc.frequency.setValueAtTime(freq * 2, startTime);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(freq * 6, startTime);
      filter.frequency.exponentialRampToValueAtTime(freq * 2, startTime + duration);

      const targetGain = Math.max(0.001, gainLevel * 0.85);
      masterGain.gain.setValueAtTime(0.0001, startTime);
      masterGain.gain.linearRampToValueAtTime(targetGain, startTime + 0.008); // crisp hammer strike
      masterGain.gain.exponentialRampToValueAtTime(targetGain * 0.4, startTime + 0.12);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration + 0.1);

      osc.connect(filter);
      subOsc.connect(filter);
      filter.connect(masterGain);

      osc.start(startTime);
      subOsc.start(startTime);
      osc.stop(startTime + duration + 0.12);
      subOsc.stop(startTime + duration + 0.12);

      return {
        stop: () => {
          try {
            osc.stop();
            subOsc.stop();
          } catch {}
        },
      };
    } else if (instrument === 'strings') {
      // Strings: Warm Sawtooth + Gentle Vibrato LFO
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, startTime);

      // Vibrato LFO (5.5 Hz)
      const vibrato = ctx.createOscillator();
      const vibratoGain = ctx.createGain();
      vibrato.frequency.setValueAtTime(5.5, startTime);
      vibratoGain.gain.setValueAtTime(freq * 0.015, startTime);
      vibrato.connect(vibratoGain);
      vibratoGain.connect(osc.frequency);
      vibrato.start(startTime);
      vibrato.stop(startTime + duration + 0.2);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(3200, freq * 4), startTime);

      const attack = 0.1;
      const release = 0.2;
      const targetGain = Math.max(0.001, gainLevel * 0.65);

      masterGain.gain.setValueAtTime(0.0001, startTime);
      masterGain.gain.linearRampToValueAtTime(targetGain, startTime + attack);
      masterGain.gain.setValueAtTime(targetGain, startTime + Math.max(attack, duration - release));
      masterGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration + release);

      osc.connect(filter);
      filter.connect(masterGain);

      osc.start(startTime);
      osc.stop(startTime + duration + release + 0.05);

      return {
        stop: () => {
          try {
            osc.stop();
            vibrato.stop();
          } catch {}
        },
      };
    } else if (instrument === 'bass') {
      // Bass: Deep sine fundamental + warm square/triangle
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(freq, startTime);
      osc2.frequency.setValueAtTime(freq * 2, startTime);

      const targetGain = Math.max(0.001, gainLevel * 0.9);
      masterGain.gain.setValueAtTime(0.0001, startTime);
      masterGain.gain.linearRampToValueAtTime(targetGain, startTime + 0.01);
      masterGain.gain.exponentialRampToValueAtTime(targetGain * 0.7, startTime + 0.15);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration + 0.05);

      osc1.connect(masterGain);
      osc2.connect(masterGain);

      osc1.start(startTime);
      osc2.start(startTime);
      osc1.stop(startTime + duration + 0.1);
      osc2.stop(startTime + duration + 0.1);

      return {
        stop: () => {
          try {
            osc1.stop();
            osc2.stop();
          } catch {}
        },
      };
    } else {
      // Default Acoustic Guitar / Pluck
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      const targetGain = Math.max(0.001, gainLevel * 0.8);
      masterGain.gain.setValueAtTime(0.0001, startTime);
      masterGain.gain.linearRampToValueAtTime(targetGain, startTime + 0.005);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration + 0.08);

      osc.connect(masterGain);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.1);

      return {
        stop: () => {
          try {
            osc.stop();
          } catch {}
        },
      };
    }
  }

  // Play full score
  public startPlayback(
    score: ScoreData,
    startBeat: number = 0,
    onBeatUpdate: (beat: number, activeNoteIds: Set<string>) => void,
    onPlaybackEnded: () => void
  ): void {
    this.stopPlayback();

    const ctx = this.initContext();
    this.isPlaying = true;
    this.activeScore = score;
    this.currentBeat = startBeat;
    this.startBeatOffset = startBeat;
    this.startTime = ctx.currentTime;
    this.onBeatUpdateCallback = onBeatUpdate;
    this.onPlaybackEndedCallback = onPlaybackEnded;

    const bpm = Math.max(20, Math.min(300, score.bpm || 120));
    const secondsPerBeat = 60 / bpm;

    // Check if any track has solo enabled
    const hasSolo = score.tracks.some((t) => t.isSolo);

    // Find the end beat of the piece
    let maxBeat = 0;
    score.tracks.forEach((track) => {
      track.notes.forEach((note) => {
        const end = note.startBeat + note.durationBeats;
        if (end > maxBeat) maxBeat = end;
      });
    });
    if (maxBeat === 0) maxBeat = 16;

    // Schedule all notes from startBeat onwards
    score.tracks.forEach((track) => {
      // If track is muted or not in solo, skip
      if (track.isMuted) return;
      if (hasSolo && !track.isSolo) return;

      const trackGain = Math.max(0, Math.min(1, track.volume ?? 0.8));

      track.notes.forEach((note) => {
        if (note.isRest) return;
        if (note.startBeat + note.durationBeats < startBeat) return;

        const beatDelta = note.startBeat - startBeat;
        if (beatDelta < 0) return;

        const noteStartTime = this.startTime + beatDelta * secondsPerBeat;
        const noteDurationSec = note.durationBeats * secondsPerBeat;
        const freq = midiToFrequency(note.midiNote);

        const source = this.synthesizeNote(
          ctx,
          freq,
          track.instrument,
          noteStartTime,
          noteDurationSec,
          trackGain
        );
        this.scheduledSources.push(source);
      });
    });

    // Run animation frame loop to update playhead position and active notes
    const updateLoop = () => {
      if (!this.isPlaying || !this.activeScore) return;

      const elapsedSec = ctx.currentTime - this.startTime;
      const currentBeat = this.startBeatOffset + elapsedSec / secondsPerBeat;
      this.currentBeat = currentBeat;

      // Determine currently playing notes
      const activeIds = new Set<string>();
      score.tracks.forEach((track) => {
        if (track.isMuted || (hasSolo && !track.isSolo)) return;
        track.notes.forEach((n) => {
          if (
            !n.isRest &&
            currentBeat >= n.startBeat &&
            currentBeat < n.startBeat + n.durationBeats
          ) {
            activeIds.add(n.id);
          }
        });
      });

      if (this.onBeatUpdateCallback) {
        this.onBeatUpdateCallback(currentBeat, activeIds);
      }

      // Check for end of playback or loop
      if (currentBeat >= maxBeat) {
        if (this.loopEnabled) {
          this.startPlayback(
            score,
            this.loopStartBeat,
            this.onBeatUpdateCallback!,
            this.onPlaybackEndedCallback!
          );
          return;
        } else {
          this.stopPlayback();
          if (this.onPlaybackEndedCallback) {
            this.onPlaybackEndedCallback();
          }
          return;
        }
      }

      this.timerId = requestAnimationFrame(updateLoop);
    };

    this.timerId = requestAnimationFrame(updateLoop);
  }

  public stopPlayback(): void {
    this.isPlaying = false;
    if (this.timerId !== null) {
      cancelAnimationFrame(this.timerId);
      this.timerId = null;
    }
    this.scheduledSources.forEach((s) => s.stop());
    this.scheduledSources = [];
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public setMasterVolume(vol: number): void {
    this.masterVolume = Math.max(0, Math.min(1, vol));
  }

  public setLoop(enabled: boolean, startBeat = 0, endBeat = 16): void {
    this.loopEnabled = enabled;
    this.loopStartBeat = startBeat;
    this.loopEndBeat = endBeat;
  }
}

export const audioSynth = new AudioSynthEngine();
