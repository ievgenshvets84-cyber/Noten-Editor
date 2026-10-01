import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ScoreData,
  ScoreNote,
  ScoreTrack,
  pitchToDiatonicStep,
  diatonicStepToPitch,
  pitchNameToMidi,
  midiToPitchName,
  durationToName,
  ClefType,
} from '../types/music';
import { audioSynth } from '../utils/audioSynth';
import {
  Music,
  Plus,
  Trash2,
  Edit3,
  MoveVertical,
  Volume2,
  Check,
  X,
  Sparkles,
} from 'lucide-react';

interface ScoreViewerProps {
  score: ScoreData;
  currentBeat: number;
  activeNoteIds: Set<string>;
  zoomLevel: number;
  selectedTrackId: string | null;
  onSelectTrack: (trackId: string | null) => void;
  onUpdateScore: (updatedScore: ScoreData) => void;
  onSeekBeat: (beat: number) => void;
  activePaletteTool: {
    type: 'note' | 'rest' | 'accidental' | 'choral';
    value: string;
    duration?: number;
  } | null;
}

const LINE_SPACING = 10;
const STEP_SIZE = 5;
const STAFF_MARGIN_LEFT = 110;
const TRACK_HEIGHT = 160;

export const ScoreViewer: React.FC<ScoreViewerProps> = ({
  score,
  currentBeat,
  activeNoteIds,
  zoomLevel,
  selectedTrackId,
  onSelectTrack,
  onUpdateScore,
  onSeekBeat,
  activePaletteTool,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredNote, setHoveredNote] = useState<ScoreNote | null>(null);
  const [selectedNote, setSelectedNote] = useState<{ trackId: string; note: ScoreNote } | null>(null);

  // Dragging state for pitch & timing
  const [dragState, setDragState] = useState<{
    trackId: string;
    noteId: string;
    startClientX: number;
    startClientY: number;
    initialPitch: string;
    initialBeat: number;
    currentPitch: string;
    currentBeat: number;
    isDraggingPitch: boolean;
    isDraggingBeat: boolean;
  } | null>(null);

  // Editing lyric modal / popover
  const [editingLyricNote, setEditingLyricNote] = useState<{
    trackId: string;
    note: ScoreNote;
    text: string;
    choralMarking: string;
  } | null>(null);

  const beatWidth = 52 * zoomLevel;
  const beatsPerMeasure = (score.timeSignature?.beats || 4) * (4 / (score.timeSignature?.beatUnit || 4));

  // Calculate max beats across all tracks
  let maxBeat = 16;
  score.tracks.forEach((t) => {
    t.notes.forEach((n) => {
      const end = n.startBeat + n.durationBeats;
      if (end > maxBeat) maxBeat = end;
    });
  });
  const totalMeasures = Math.max(4, Math.ceil(maxBeat / beatsPerMeasure));
  const totalScoreWidth = STAFF_MARGIN_LEFT + totalMeasures * beatsPerMeasure * beatWidth + 120;

  // Filter tracks if user wants to isolate one, or show all
  const visibleTracks = selectedTrackId
    ? score.tracks.filter((t) => t.id === selectedTrackId)
    : score.tracks;

  // Calculate Y coordinate for a diatonic step in a staff
  const getNoteY = (pitch: string, clef: ClefType, staffTopY: number): number => {
    const step = pitchToDiatonicStep(pitch);
    if (clef === 'bass') {
      return staffTopY + (-2 - step) * STEP_SIZE;
    }
    // Treble clef
    return staffTopY + (10 - step) * STEP_SIZE;
  };

  // Convert client Y coordinate to pitch in a staff
  const clientYToPitch = (
    clientY: number,
    staffTopY: number,
    clef: ClefType,
    containerRect: DOMRect
  ): string => {
    const relY = clientY - containerRect.top;
    const diffFromStaffTop = relY - staffTopY;
    const stepOffset = Math.round(diffFromStaffTop / STEP_SIZE);

    let step: number;
    if (clef === 'bass') {
      step = -2 - stepOffset;
    } else {
      step = 10 - stepOffset;
    }
    return diatonicStepToPitch(step);
  };

  // Mouse move handler for dragging note
  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      // Find staff info
      const trackIdx = visibleTracks.findIndex((t) => t.id === dragState.trackId);
      if (trackIdx === -1) return;
      const staffTopY = 60 + trackIdx * TRACK_HEIGHT;
      const track = visibleTracks[trackIdx];

      // Vertical drag = pitch change
      const deltaY = Math.abs(e.clientY - dragState.startClientY);
      const deltaX = Math.abs(e.clientX - dragState.startClientX);

      let newPitch = dragState.currentPitch;
      let newBeat = dragState.currentBeat;

      if (deltaY > 6) {
        newPitch = clientYToPitch(e.clientY, staffTopY, track.clef, rect);
        if (newPitch !== dragState.currentPitch) {
          // Play sound preview of new pitch!
          audioSynth.playAuditionNote(newPitch, track.instrument, 0.4, 0.7);
        }
      }

      if (deltaX > 8) {
        const beatDelta = (e.clientX - dragState.startClientX) / beatWidth;
        const rawBeat = dragState.initialBeat + beatDelta;
        // Snap to nearest 0.5 beat
        newBeat = Math.max(0, Math.round(rawBeat * 2) / 2);
      }

      setDragState((prev) =>
        prev
          ? {
              ...prev,
              currentPitch: newPitch,
              currentBeat: newBeat,
              isDraggingPitch: deltaY > 6,
              isDraggingBeat: deltaX > 8,
            }
          : null
      );
    };

    const handleMouseUp = () => {
      if (dragState) {
        // Commit changes to score
        const updatedTracks = score.tracks.map((t) => {
          if (t.id !== dragState.trackId) return t;
          const updatedNotes = t.notes.map((n) => {
            if (n.id !== dragState.noteId) return n;
            const newMidi = pitchNameToMidi(dragState.currentPitch);
            return {
              ...n,
              pitch: dragState.currentPitch,
              midiNote: newMidi,
              startBeat: dragState.currentBeat,
            };
          });
          return { ...t, notes: updatedNotes };
        });

        onUpdateScore({ ...score, tracks: updatedTracks });
        setDragState(null);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, visibleTracks, score, beatWidth, onUpdateScore]);

  // Click on stave to insert new note or seek
  const handleStaveClick = (
    e: React.MouseEvent<SVGRectElement>,
    trackId: string,
    clef: ClefType,
    staffTopY: number
  ) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickBeat = Math.max(0, Math.floor(((clickX - STAFF_MARGIN_LEFT) / beatWidth) * 2) / 2);

    if (activePaletteTool?.type === 'note' || activePaletteTool?.type === 'rest') {
      // Insert note at position
      const clickedPitch = clientYToPitch(e.clientY, staffTopY, clef, rect);
      const isRest = activePaletteTool.type === 'rest';
      const dur = activePaletteTool.duration || 1.0;

      const track = score.tracks.find((t) => t.id === trackId);
      if (!track) return;

      const newNote: ScoreNote = {
        id: `note-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        pitch: clickedPitch,
        midiNote: pitchNameToMidi(clickedPitch),
        startBeat: clickBeat,
        durationBeats: dur,
        isRest,
        lyric: track.instrument.includes('choir') || track.instrument.includes('vocal') ? 'La' : undefined,
      };

      if (!isRest) {
        audioSynth.playAuditionNote(clickedPitch, track.instrument);
      }

      const updatedTracks = score.tracks.map((t) => {
        if (t.id !== trackId) return t;
        const newNotes = [...t.notes, newNote].sort((a, b) => a.startBeat - b.startBeat);
        return { ...t, notes: newNotes };
      });

      onUpdateScore({ ...score, tracks: updatedTracks });
    } else {
      // Seek playback to this beat
      onSeekBeat(clickBeat);
    }
  };

  // Delete note
  const handleDeleteNote = (trackId: string, noteId: string) => {
    const updatedTracks = score.tracks.map((t) => {
      if (t.id !== trackId) return t;
      return { ...t, notes: t.notes.filter((n) => n.id !== noteId) };
    });
    onUpdateScore({ ...score, tracks: updatedTracks });
    setSelectedNote(null);
  };

  // Adjust duration of selected note
  const handleAdjustDuration = (trackId: string, noteId: string, delta: number) => {
    const updatedTracks = score.tracks.map((t) => {
      if (t.id !== trackId) return t;
      return {
        ...t,
        notes: t.notes.map((n) => {
          if (n.id !== noteId) return n;
          const newDur = Math.max(0.25, Math.min(4, n.durationBeats + delta));
          return { ...n, durationBeats: newDur };
        }),
      };
    });
    onUpdateScore({ ...score, tracks: updatedTracks });
  };

  return (
    <div className="relative w-full overflow-hidden flex flex-col bg-stone-900 border border-stone-800 rounded-xl shadow-2xl">
      {/* Score Header Info & Track Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 bg-stone-950 border-b border-stone-800 text-xs text-stone-300">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-serif font-bold text-base text-amber-300">
              {score.title || 'Partitur'}
            </span>
            {score.artist && (
              <span className="text-stone-400 font-sans">· {score.artist}</span>
            )}
          </div>
          <span className="text-stone-600">|</span>
          <div className="flex items-center gap-2 text-stone-400">
            <span>Tonart: <strong className="text-amber-200">{score.key || 'C-Dur'}</strong></span>
            <span>·</span>
            <span>Takt: <strong className="text-amber-200">{score.timeSignature?.beats || 4}/{score.timeSignature?.beatUnit || 4}</strong></span>
            <span>·</span>
            <span>Tempo: <strong className="text-amber-200">{score.bpm || 120} BPM</strong></span>
          </div>
        </div>

        {/* Track Isolate Selector */}
        <div className="flex items-center gap-1.5 bg-stone-900 p-1 rounded-lg border border-stone-800">
          <button
            onClick={() => onSelectTrack(null)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              selectedTrackId === null
                ? 'bg-amber-500 text-stone-950 font-semibold'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            Alle Stimmen ({score.tracks.length})
          </button>
          {score.tracks.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelectTrack(t.id)}
              className={`px-2.5 py-1 rounded text-xs transition-colors flex items-center gap-1.5 ${
                selectedTrackId === t.id
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <span>{t.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div
        ref={containerRef}
        className="w-full overflow-x-auto overflow-y-auto max-h-[640px] bg-stone-900 select-none relative"
        style={{ cursor: activePaletteTool ? 'crosshair' : 'default' }}
      >
        <svg
          width={totalScoreWidth}
          height={60 + visibleTracks.length * TRACK_HEIGHT + 40}
          className="block"
        >
          <defs>
            {/* Playhead glow gradient */}
            <linearGradient id="playheadGlow" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.4" />
            </linearGradient>
            {/* Active note highlight filter */}
            <filter id="activeGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#f59e0b" floodOpacity="0.9" />
            </filter>
          </defs>

          {/* Timeline / Measure Ruler Bar at Top */}
          <rect x={0} y={0} width={totalScoreWidth} height={32} fill="#141210" />
          <line x1={0} y1={32} x2={totalScoreWidth} y2={32} stroke="#292524" strokeWidth={1} />

          {/* Measure Numbers & Beat subdivisions */}
          {Array.from({ length: totalMeasures }).map((_, mIdx) => {
            const measureStartBeat = mIdx * beatsPerMeasure;
            const measureX = STAFF_MARGIN_LEFT + measureStartBeat * beatWidth;
            return (
              <g key={`ruler-m-${mIdx}`}>
                {/* Measure Line */}
                <line
                  x1={measureX}
                  y1={0}
                  x2={measureX}
                  y2={32}
                  stroke="#44403c"
                  strokeWidth={1.5}
                />
                <text
                  x={measureX + 6}
                  y={20}
                  fill="#a8a29e"
                  fontSize={11}
                  fontWeight="bold"
                  fontFamily="'JetBrains Mono', monospace"
                >
                  Takt {mIdx + 1}
                </text>
                {/* Sub-beats ticks */}
                {Array.from({ length: beatsPerMeasure }).map((__, bIdx) => {
                  if (bIdx === 0) return null;
                  const bx = measureX + bIdx * beatWidth;
                  return (
                    <line
                      key={`ruler-b-${mIdx}-${bIdx}`}
                      x1={bx}
                      y1={24}
                      x2={bx}
                      y2={32}
                      stroke="#292524"
                      strokeWidth={1}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* Render Each Track Staff */}
          {visibleTracks.map((track, trackIdx) => {
            const staffTopY = 60 + trackIdx * TRACK_HEIGHT;
            const staffBottomY = staffTopY + 4 * LINE_SPACING;

            return (
              <g key={track.id} id={`track-group-${track.id}`}>
                {/* Track Background Hover & Click Receptor */}
                <rect
                  x={STAFF_MARGIN_LEFT}
                  y={staffTopY - 20}
                  width={totalMeasures * beatsPerMeasure * beatWidth}
                  height={TRACK_HEIGHT - 20}
                  fill="transparent"
                  onClick={(e) => handleStaveClick(e, track.id, track.clef, staffTopY)}
                />

                {/* Track Header Label & Choral Role */}
                <g transform={`translate(16, ${staffTopY + 16})`}>
                  <text
                    x={0}
                    y={0}
                    fill="#f5f5f4"
                    fontSize={13}
                    fontWeight="600"
                    fontFamily="'Plus Jakarta Sans', sans-serif"
                  >
                    {track.name}
                  </text>
                  {track.choralRole && (
                    <text
                      x={0}
                      y={14}
                      fill="#78716c"
                      fontSize={10}
                      fontFamily="'Plus Jakarta Sans', sans-serif"
                    >
                      {track.choralRole}
                    </text>
                  )}
                  {track.vocalRange && (
                    <text
                      x={0}
                      y={26}
                      fill="#a8a29e"
                      fontSize={9.5}
                      fontFamily="'JetBrains Mono', monospace"
                    >
                      Stimmumfang: {track.vocalRange}
                    </text>
                  )}
                </g>

                {/* Clef Sign */}
                <text
                  x={STAFF_MARGIN_LEFT - 32}
                  y={track.clef === 'bass' ? staffTopY + 28 : staffTopY + 34}
                  fill="#e7e5e4"
                  fontSize={track.clef === 'bass' ? 38 : 46}
                  fontFamily="'Cinzel', serif"
                  style={{ pointerEvents: 'none' }}
                >
                  {track.clef === 'bass' ? '𝄢' : '𝄞'}
                </text>

                {/* Time Signature fraction at start of staff */}
                <g
                  transform={`translate(${STAFF_MARGIN_LEFT - 10}, ${staffTopY + 14})`}
                  style={{ pointerEvents: 'none' }}
                >
                  <text
                    x={0}
                    y={5}
                    fill="#d6d3d1"
                    fontSize={14}
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {score.timeSignature?.beats || 4}
                  </text>
                  <text
                    x={0}
                    y={21}
                    fill="#d6d3d1"
                    fontSize={14}
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {score.timeSignature?.beatUnit || 4}
                  </text>
                </g>

                {/* Five Stave Lines */}
                {[0, 1, 2, 3, 4].map((lineIndex) => {
                  const y = staffTopY + lineIndex * LINE_SPACING;
                  return (
                    <line
                      key={`staff-line-${track.id}-${lineIndex}`}
                      x1={STAFF_MARGIN_LEFT}
                      y1={y}
                      x2={STAFF_MARGIN_LEFT + totalMeasures * beatsPerMeasure * beatWidth}
                      y2={y}
                      stroke="#57534e"
                      strokeWidth={1}
                      style={{ pointerEvents: 'none' }}
                    />
                  );
                })}

                {/* Vertical Bar Lines across measures */}
                {Array.from({ length: totalMeasures + 1 }).map((_, mIdx) => {
                  const x = STAFF_MARGIN_LEFT + mIdx * beatsPerMeasure * beatWidth;
                  const isEnd = mIdx === totalMeasures;
                  return (
                    <g key={`barline-${track.id}-${mIdx}`} style={{ pointerEvents: 'none' }}>
                      <line
                        x1={x}
                        y1={staffTopY}
                        x2={x}
                        y2={staffBottomY}
                        stroke={isEnd ? '#d97706' : '#44403c'}
                        strokeWidth={isEnd ? 3 : 1.5}
                      />
                      {/* Subtle measure beat guidelines */}
                      {!isEnd &&
                        Array.from({ length: beatsPerMeasure }).map((__, bIdx) => {
                          if (bIdx === 0) return null;
                          return (
                            <line
                              key={`grid-${mIdx}-${bIdx}`}
                              x1={x + bIdx * beatWidth}
                              y1={staffTopY}
                              x2={x + bIdx * beatWidth}
                              y2={staffBottomY}
                              stroke="#292524"
                              strokeWidth={0.8}
                              strokeDasharray="2 2"
                            />
                          );
                        })}
                    </g>
                  );
                })}

                {/* Notes in Track */}
                {track.notes.map((note) => {
                  const isBeingDragged =
                    dragState?.trackId === track.id && dragState?.noteId === note.id;
                  const activePitch = isBeingDragged ? dragState.currentPitch : note.pitch;
                  const activeStartBeat = isBeingDragged ? dragState.currentBeat : note.startBeat;

                  const noteX = STAFF_MARGIN_LEFT + activeStartBeat * beatWidth;
                  const noteY = getNoteY(activePitch, track.clef, staffTopY);
                  const isCurrentActive = activeNoteIds.has(note.id);
                  const isSelected = selectedNote?.note.id === note.id;

                  // Ledger line check (Hilfslinien above/below staff)
                  const step = pitchToDiatonicStep(activePitch);
                  const ledgerLines: number[] = [];
                  if (track.clef === 'treble') {
                    // Below staff: C4 (step 0), A3 (step -2)
                    if (step <= 0) {
                      for (let s = 0; s >= step; s -= 2) {
                        ledgerLines.push(staffTopY + (10 - s) * STEP_SIZE);
                      }
                    }
                    // Above staff: A5 (step 12), C6 (step 14)
                    if (step >= 12) {
                      for (let s = 12; s <= step; s += 2) {
                        ledgerLines.push(staffTopY + (10 - s) * STEP_SIZE);
                      }
                    }
                  } else {
                    // Bass clef
                    if (step <= -12) {
                      for (let s = -12; s >= step; s -= 2) {
                        ledgerLines.push(staffTopY + (-2 - s) * STEP_SIZE);
                      }
                    }
                    if (step >= 0) {
                      for (let s = 0; s <= step; s += 2) {
                        ledgerLines.push(staffTopY + (-2 - s) * STEP_SIZE);
                      }
                    }
                  }

                  const stemDirection = noteY > staffTopY + 20 ? 'up' : 'down';
                  const stemLength = 28;
                  const stemX = stemDirection === 'up' ? noteX + 6.5 : noteX - 6.5;
                  const stemY2 = stemDirection === 'up' ? noteY - stemLength : noteY + stemLength;

                  return (
                    <g
                      key={note.id}
                      className="cursor-pointer group"
                      onMouseEnter={() => setHoveredNote(note)}
                      onMouseLeave={() => setHoveredNote(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedNote({ trackId: track.id, note });
                        audioSynth.playAuditionNote(note.pitch, track.instrument);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingLyricNote({
                          trackId: track.id,
                          note,
                          text: note.lyric || '',
                          choralMarking: note.choralMarking || '',
                        });
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDragState({
                          trackId: track.id,
                          noteId: note.id,
                          startClientX: e.clientX,
                          startClientY: e.clientY,
                          initialPitch: note.pitch,
                          initialBeat: note.startBeat,
                          currentPitch: note.pitch,
                          currentBeat: note.startBeat,
                          isDraggingPitch: false,
                          isDraggingBeat: false,
                        });
                      }}
                    >
                      {/* Ledger Lines */}
                      {ledgerLines.map((ly, lIdx) => (
                        <line
                          key={`ledger-${note.id}-${lIdx}`}
                          x1={noteX - 11}
                          y1={ly}
                          x2={noteX + 11}
                          y2={ly}
                          stroke="#78716c"
                          strokeWidth={1.2}
                        />
                      ))}

                      {/* Note Rest Glyph */}
                      {note.isRest ? (
                        <text
                          x={noteX - 5}
                          y={staffTopY + 25}
                          fill={isSelected ? '#fbbf24' : '#a8a29e'}
                          fontSize={22}
                          fontFamily="'Cinzel', serif"
                        >
                          𝄽
                        </text>
                      ) : (
                        <>
                          {/* Note Accidental (# / b) */}
                          {activePitch.includes('#') && (
                            <text
                              x={noteX - 14}
                              y={noteY + 4}
                              fill={isSelected ? '#fbbf24' : '#e7e5e4'}
                              fontSize={16}
                              fontFamily="'Plus Jakarta Sans', sans-serif"
                            >
                              ♯
                            </text>
                          )}
                          {activePitch.includes('b') && (
                            <text
                              x={noteX - 13}
                              y={noteY + 3}
                              fill={isSelected ? '#fbbf24' : '#e7e5e4'}
                              fontSize={16}
                              fontFamily="'Plus Jakarta Sans', sans-serif"
                            >
                              ♭
                            </text>
                          )}

                          {/* Note Stem */}
                          {note.durationBeats < 4 && (
                            <line
                              x1={stemX}
                              y1={noteY}
                              x2={stemX}
                              y2={stemY2}
                              stroke={isCurrentActive ? '#f59e0b' : isSelected ? '#fbbf24' : '#f5f5f4'}
                              strokeWidth={1.6}
                            />
                          )}

                          {/* Eighth Note Flag */}
                          {note.durationBeats <= 0.5 && (
                            <path
                              d={
                                stemDirection === 'up'
                                  ? `M ${stemX} ${stemY2} Q ${stemX + 8} ${stemY2 + 10}, ${stemX + 4} ${stemY2 + 18}`
                                  : `M ${stemX} ${stemY2} Q ${stemX + 8} ${stemY2 - 10}, ${stemX + 4} ${stemY2 - 18}`
                              }
                              stroke={isCurrentActive ? '#f59e0b' : isSelected ? '#fbbf24' : '#f5f5f4'}
                              strokeWidth={1.8}
                              fill="none"
                            />
                          )}

                          {/* Note Head (filled for quarter/eighth, hollow for half/whole) */}
                          <ellipse
                            cx={noteX}
                            cy={noteY}
                            rx={6.8}
                            ry={4.8}
                            transform={`rotate(-22 ${noteX} ${noteY})`}
                            fill={
                              note.durationBeats >= 2
                                ? '#1c1917'
                                : isCurrentActive
                                ? '#f59e0b'
                                : isSelected
                                ? '#fbbf24'
                                : '#f5f5f4'
                            }
                            stroke={isCurrentActive ? '#f59e0b' : isSelected ? '#fbbf24' : '#f5f5f4'}
                            strokeWidth={note.durationBeats >= 2 ? 1.8 : 1}
                            filter={isCurrentActive ? 'url(#activeGlow)' : undefined}
                          />

                          {/* Duration extension bar/tie visually previewing note length */}
                          {note.durationBeats > 1 && (
                            <line
                              x1={noteX + 8}
                              y1={noteY}
                              x2={noteX + note.durationBeats * beatWidth - 10}
                              y2={noteY}
                              stroke={isSelected ? '#f59e0b' : '#78716c'}
                              strokeWidth={1.2}
                              strokeDasharray="3 3"
                            />
                          )}
                        </>
                      )}

                      {/* Choral Marking / Vocal Guidance (Atemzeichen, Dynamik, Solo) */}
                      {note.choralMarking && (
                        <g transform={`translate(${noteX - 4}, ${staffTopY - 8})`}>
                          {note.choralMarking.includes('Atem') ? (
                            <text
                              x={10}
                              y={2}
                              fill="#38bdf8"
                              fontSize={16}
                              fontWeight="bold"
                            >
                              ’
                            </text>
                          ) : (
                            <text
                              x={0}
                              y={0}
                              fill="#f59e0b"
                              fontSize={9.5}
                              fontWeight="600"
                              fontStyle="italic"
                              fontFamily="'Plus Jakarta Sans', sans-serif"
                            >
                              {note.choralMarking}
                            </text>
                          )}
                        </g>
                      )}

                      {/* Lyrics underneath the note */}
                      {note.lyric && (
                        <text
                          x={noteX}
                          y={staffBottomY + 22}
                          fill={isCurrentActive ? '#fef08a' : '#e7e5e4'}
                          fontSize={12}
                          fontWeight="500"
                          textAnchor="middle"
                          fontFamily="'Plus Jakarta Sans', sans-serif"
                        >
                          {note.lyric}
                        </text>
                      )}

                      {/* Pitch Tag badge while dragging */}
                      {isBeingDragged && (
                        <g transform={`translate(${noteX + 12}, ${noteY - 14})`}>
                          <rect
                            x={0}
                            y={0}
                            width={36}
                            height={18}
                            rx={4}
                            fill="#d97706"
                          />
                          <text
                            x={18}
                            y={13}
                            fill="#ffffff"
                            fontSize={10}
                            fontWeight="bold"
                            textAnchor="middle"
                            fontFamily="'JetBrains Mono', monospace"
                          >
                            {activePitch}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Dynamic Playhead Cursor */}
          {currentBeat >= 0 && (
            <g style={{ pointerEvents: 'none' }}>
              <line
                x1={STAFF_MARGIN_LEFT + currentBeat * beatWidth}
                y1={0}
                x2={STAFF_MARGIN_LEFT + currentBeat * beatWidth}
                y2={60 + visibleTracks.length * TRACK_HEIGHT}
                stroke="#f59e0b"
                strokeWidth={2}
              />
              {/* Playhead Head Marker */}
              <polygon
                points={`
                  ${STAFF_MARGIN_LEFT + currentBeat * beatWidth - 6}, 0
                  ${STAFF_MARGIN_LEFT + currentBeat * beatWidth + 6}, 0
                  ${STAFF_MARGIN_LEFT + currentBeat * beatWidth}, 12
                `}
                fill="#f59e0b"
              />
            </g>
          )}
        </svg>
      </div>

      {/* Selected Note Inspector / Quick Action Footer */}
      {selectedNote && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-2.5 bg-stone-950 border-t border-stone-800 text-xs text-stone-300">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-amber-300 flex items-center gap-1.5">
              <Music className="w-3.5 h-3.5" />
              Note: {selectedNote.note.pitch} ({selectedNote.note.midiNote})
            </span>
            <span className="text-stone-600">·</span>
            <span className="text-stone-400">
              Dauer: <strong className="text-stone-200">{durationToName(selectedNote.note.durationBeats)}</strong>
            </span>
            <span className="text-stone-600">·</span>
            <span className="text-stone-400">
              Takt: <strong className="text-stone-200">
                {Math.floor(selectedNote.note.startBeat / beatsPerMeasure) + 1}, Beat {(selectedNote.note.startBeat % beatsPerMeasure) + 1}
              </strong>
            </span>
            {selectedNote.note.lyric && (
              <>
                <span className="text-stone-600">·</span>
                <span className="text-amber-200 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-900/60">
                  Text: &ldquo;{selectedNote.note.lyric}&rdquo;
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-stone-500 mr-1">Dauer anpassen:</span>
            <button
              onClick={() => handleAdjustDuration(selectedNote.trackId, selectedNote.note.id, -0.5)}
              className="px-2 py-0.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded transition-colors"
              title="Kürzer (z.B. Achtel / Viertel)"
            >
              - 0.5 Beat
            </button>
            <button
              onClick={() => handleAdjustDuration(selectedNote.trackId, selectedNote.note.id, 0.5)}
              className="px-2 py-0.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded transition-colors"
              title="Länger (z.B. Halbe / Ganze)"
            >
              + 0.5 Beat
            </button>
            <button
              onClick={() =>
                setEditingLyricNote({
                  trackId: selectedNote.trackId,
                  note: selectedNote.note,
                  text: selectedNote.note.lyric || '',
                  choralMarking: selectedNote.note.choralMarking || '',
                })
              }
              className="px-2.5 py-1 bg-stone-800 hover:bg-stone-700 text-amber-300 rounded flex items-center gap-1 transition-colors"
            >
              <Edit3 className="w-3 h-3" />
              Text / Anweisung bearbeiten
            </button>
            <button
              onClick={() => handleDeleteNote(selectedNote.trackId, selectedNote.note.id)}
              className="px-2.5 py-1 bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/50 rounded flex items-center gap-1 transition-colors"
              title="Note löschen"
            >
              <Trash2 className="w-3 h-3" />
              Löschen
            </button>
          </div>
        </div>
      )}

      {/* Lyric & Choral Marking Quick Edit Modal */}
      {editingLyricNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-stone-900 border border-stone-700 rounded-xl p-6 w-full max-w-md shadow-2xl text-stone-100">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-stone-800">
              <h3 className="font-serif font-bold text-lg text-amber-300">
                Note & Gesangshinweis bearbeiten
              </h3>
              <button
                onClick={() => setEditingLyricNote(null)}
                className="text-stone-400 hover:text-stone-100 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <label className="block text-stone-400 text-xs mb-1.5">
                  Liedtext / Silbe (wird direkt unter der Note angezeigt):
                </label>
                <input
                  type="text"
                  value={editingLyricNote.text}
                  onChange={(e) =>
                    setEditingLyricNote({ ...editingLyricNote, text: e.target.value })
                  }
                  placeholder="z.B. Freu-, -de, Halleluja"
                  className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-stone-400 text-xs mb-1.5">
                  Chor- & Vokalanweisung (Dynamik, Atem, Phrasierung):
                </label>
                <input
                  type="text"
                  value={editingLyricNote.choralMarking}
                  onChange={(e) =>
                    setEditingLyricNote({ ...editingLyricNote, choralMarking: e.target.value })
                  }
                  placeholder="z.B. Atem, Kopfstimme, Crescendo, Solo, p, mf, f"
                  className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-500"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {['Atem', 'p (dolce)', 'f (Tutti)', 'Crescendo', 'Kopfstimme', 'Legato'].map(
                    (tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          setEditingLyricNote({ ...editingLyricNote, choralMarking: tag })
                        }
                        className="px-2 py-0.5 bg-stone-800 hover:bg-stone-700 text-xs rounded text-stone-300"
                      >
                        +{tag}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setEditingLyricNote(null)}
                  className="px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const updatedTracks = score.tracks.map((t) => {
                      if (t.id !== editingLyricNote.trackId) return t;
                      return {
                        ...t,
                        notes: t.notes.map((n) => {
                          if (n.id !== editingLyricNote.note.id) return n;
                          return {
                            ...n,
                            lyric: editingLyricNote.text.trim() || undefined,
                            choralMarking: editingLyricNote.choralMarking.trim() || undefined,
                          };
                        }),
                      };
                    });
                    onUpdateScore({ ...score, tracks: updatedTracks });
                    setEditingLyricNote(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold"
                >
                  Speichern
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
