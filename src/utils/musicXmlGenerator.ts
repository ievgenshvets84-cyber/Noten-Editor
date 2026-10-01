import { ScoreData, ScoreTrack, ScoreNote } from '../types/music';

/**
 * Generates MusicXML 3.1 file content from ScoreData
 * Compatible with MuseScore, Sibelius, Finale, and Dorico.
 */

export function generateMusicXml(score: ScoreData): string {
  const divisions = 4; // 1 beat = 4 divisions (sixteenth note = 1 division)
  const beats = score.timeSignature?.beats || 4;
  const beatType = score.timeSignature?.beatUnit || 4;

  let partListXml = '';
  let partsXml = '';

  score.tracks.forEach((track, trackIdx) => {
    const partId = `P${trackIdx + 1}`;
    partListXml += `
    <score-part id="${partId}">
      <part-name>${escapeXml(track.name)}</part-name>
      <score-instrument id="${partId}-I1">
        <instrument-name>${escapeXml(track.name)}</instrument-name>
      </score-instrument>
    </score-part>`;

    // Group notes into measures
    const beatsPerMeasure = beats * (4 / beatType);
    let maxBeat = 0;
    track.notes.forEach((n) => {
      const end = n.startBeat + n.durationBeats;
      if (end > maxBeat) maxBeat = end;
    });

    const totalMeasures = Math.max(1, Math.ceil(maxBeat / beatsPerMeasure));

    let measuresXml = '';
    for (let m = 1; m <= totalMeasures; m++) {
      const mStartBeat = (m - 1) * beatsPerMeasure;
      const mEndBeat = m * beatsPerMeasure;

      const measureNotes = track.notes.filter(
        (n) => n.startBeat >= mStartBeat - 0.001 && n.startBeat < mEndBeat - 0.001
      );
      // Sort notes by start beat
      measureNotes.sort((a, b) => a.startBeat - b.startBeat);

      let notesInMeasureXml = '';

      // If measure 1, include attributes (divisions, key, time, clef)
      if (m === 1) {
        notesInMeasureXml += `
        <attributes>
          <divisions>${divisions}</divisions>
          <key>
            <fifths>0</fifths>
            <mode>major</mode>
          </key>
          <time>
            <beats>${beats}</beats>
            <beat-type>${beatType}</beat-type>
          </time>
          <clef>
            <sign>${track.clef === 'bass' ? 'F' : 'G'}</sign>
            <line>${track.clef === 'bass' ? '4' : '2'}</line>
          </clef>
        </attributes>
        <direction placement="above">
          <direction-type>
            <metronome>
              <beat-unit>quarter</beat-unit>
              <per-minute>${score.bpm || 120}</per-minute>
            </metronome>
          </direction-type>
          <sound tempo="${score.bpm || 120}"/>
        </direction>`;
      }

      if (measureNotes.length === 0) {
        // Full measure rest
        notesInMeasureXml += `
        <note>
          <rest/>
          <duration>${beatsPerMeasure * divisions}</duration>
          <voice>1</voice>
          <type>whole</type>
        </note>`;
      } else {
        let currentMeasurePos = mStartBeat;

        measureNotes.forEach((note) => {
          // If there is a gap before this note, insert a rest
          const gap = note.startBeat - currentMeasurePos;
          if (gap > 0.05) {
            notesInMeasureXml += `
          <note>
            <rest/>
            <duration>${Math.round(gap * divisions)}</duration>
            <voice>1</voice>
          </note>`;
          }

          const durDiv = Math.max(1, Math.round(note.durationBeats * divisions));
          const stepAndOctave = parseStepAndOctave(note.pitch);

          let noteType = 'quarter';
          if (note.durationBeats >= 4) noteType = 'whole';
          else if (note.durationBeats >= 2) noteType = 'half';
          else if (note.durationBeats >= 1) noteType = 'quarter';
          else if (note.durationBeats >= 0.5) noteType = 'eighth';
          else if (note.durationBeats >= 0.25) noteType = '16th';

          let lyricXml = '';
          if (note.lyric && note.lyric.trim()) {
            lyricXml = `
            <lyric number="1">
              <syllabic>single</syllabic>
              <text>${escapeXml(note.lyric.trim())}</text>
            </lyric>`;
          }

          let notationXml = '';
          if (note.articulation === 'fermata') {
            notationXml = '<notations><fermata type="upright"/></notations>';
          } else if (note.articulation === 'staccato') {
            notationXml = '<notations><articulations><staccato/></articulations></notations>';
          } else if (note.articulation === 'accent') {
            notationXml = '<notations><articulations><accent/></articulations></notations>';
          }

          if (note.isRest) {
            notesInMeasureXml += `
          <note>
            <rest/>
            <duration>${durDiv}</duration>
            <voice>1</voice>
            <type>${noteType}</type>
          </note>`;
          } else {
            notesInMeasureXml += `
          <note>
            <pitch>
              <step>${stepAndOctave.step}</step>
              ${stepAndOctave.alter !== 0 ? `<alter>${stepAndOctave.alter}</alter>` : ''}
              <octave>${stepAndOctave.octave}</octave>
            </pitch>
            <duration>${durDiv}</duration>
            <voice>1</voice>
            <type>${noteType}</type>
            ${lyricXml}
            ${notationXml}
          </note>`;
          }

          currentMeasurePos = note.startBeat + note.durationBeats;
        });
      }

      measuresXml += `
      <measure number="${m}">
        ${notesInMeasureXml}
      </measure>`;
    }

    partsXml += `
  <part id="${partId}">
    ${measuresXml}
  </part>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work>
    <work-title>${escapeXml(score.title || 'Partitur')}</work-title>
  </work>
  <identification>
    <creator type="composer">${escapeXml(score.artist || 'PartiturStudio AI')}</creator>
    <encoding>
      <software>PartiturStudio AI</software>
      <encoding-date>${new Date().toISOString().split('T')[0]}</encoding-date>
    </encoding>
  </identification>
  <part-list>
    ${partListXml}
  </part-list>
  ${partsXml}
</score-partwise>`;
}

function parseStepAndOctave(pitch: string): { step: string; alter: number; octave: number } {
  if (!pitch) return { step: 'C', alter: 0, octave: 4 };
  const m = pitch.match(/^([A-G])([b#]?)(-?\d+)$/);
  if (!m) return { step: 'C', alter: 0, octave: 4 };
  const step = m[1];
  const acc = m[2];
  const octave = parseInt(m[3], 10);
  let alter = 0;
  if (acc === '#') alter = 1;
  else if (acc === 'b') alter = -1;
  return { step, alter, octave };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function downloadMusicXmlFile(score: ScoreData, filename?: string): void {
  const xml = generateMusicXml(score);
  const blob = new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' });
  const safeName = (filename || score.title || 'partitur')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/gi, '_');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.musicxml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
