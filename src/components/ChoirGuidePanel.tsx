import React, { useState } from 'react';
import { ScoreData, CHORAL_RANGES } from '../types/music';
import { BookOpen, AlertCircle, CheckCircle2, Sparkles, Send, Loader2, Music } from 'lucide-react';

interface ChoirGuidePanelProps {
  score: ScoreData;
  onClose: () => void;
}

export const ChoirGuidePanel: React.FC<ChoirGuidePanelProps> = ({ score, onClose }) => {
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [isLoadingAdvice, setIsLoadingAdvice] = useState(false);
  const [adviceError, setAdviceError] = useState<string | null>(null);

  // Check choral vocal ranges for vocal tracks
  const voiceChecks = score.tracks
    .filter((t) => t.instrument.startsWith('choir') || t.instrument === 'lead_vocal')
    .map((track) => {
      let rangeKey: keyof typeof CHORAL_RANGES = 'soprano';
      if (track.instrument === 'choir_alto') rangeKey = 'alto';
      else if (track.instrument === 'choir_tenor') rangeKey = 'tenor';
      else if (track.instrument === 'choir_bass') rangeKey = 'bass';

      const rangeDef = CHORAL_RANGES[rangeKey];
      const outOfRangeNotes: { pitch: string; midi: number }[] = [];

      track.notes.forEach((n) => {
        if (!n.isRest && (n.midiNote < rangeDef.minMidi || n.midiNote > rangeDef.maxMidi)) {
          outOfRangeNotes.push({ pitch: n.pitch, midi: n.midiNote });
        }
      });

      return {
        trackName: track.name,
        rangeLabel: rangeDef.label,
        role: track.choralRole || 'Gesangsstimme',
        noteCount: track.notes.filter((n) => !n.isRest).length,
        hasWarnings: outOfRangeNotes.length > 0,
        warningCount: outOfRangeNotes.length,
        outOfRangeNotes,
      };
    });

  // Query AI Choral Advisor via backend API
  const handleAskChoralAdvisor = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsLoadingAdvice(true);
    setAdviceError(null);

    try {
      const res = await fetch('/api/ai-arrangement-advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scoreContext: {
            title: score.title,
            key: score.key,
            bpm: score.bpm,
            tracks: score.tracks.map((t) => ({ name: t.name, instrument: t.instrument })),
          },
          userQuestion:
            aiQuestion.trim() ||
            'Gib mir konkrete Einstudierungstipps für diesen Chorsatz, Atemanweisungen und Hinweise zur Intonation.',
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.message || 'Fehler bei der KI-Analyse');
      }

      setAiAdvice(data.advice);
    } catch (err: any) {
      setAdviceError(
        err.message || 'KI-Chorberater konnte nicht erreicht werden. Prüfen Sie Ihren API-Schlüssel.'
      );
    } finally {
      setIsLoadingAdvice(false);
    }
  };

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-xl p-5 shadow-2xl text-stone-100 space-y-6">
      <div className="flex items-center justify-between pb-3 border-b border-stone-800">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-amber-400" />
          <h2 className="font-serif font-bold text-base text-amber-200">
            Chor-Anleitung & Vokale Einstudierung
          </h2>
        </div>
        <button
          onClick={onClose}
          className="text-stone-400 hover:text-stone-200 text-xs px-2.5 py-1 bg-stone-800 hover:bg-stone-700 rounded-md transition-colors"
        >
          Schließen
        </button>
      </div>

      {/* General Advice & Breathing from Transcribed Score */}
      {score.choralGuidance && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-stone-950/80 border border-stone-800 rounded-xl">
            <h3 className="font-serif font-semibold text-sm text-amber-300 mb-2">
              Allgemeine Choranweisung
            </h3>
            <p className="text-xs text-stone-300 leading-relaxed">
              {score.choralGuidance.generalAdvice}
            </p>
          </div>

          <div className="p-4 bg-stone-950/80 border border-stone-800 rounded-xl">
            <h3 className="font-serif font-semibold text-sm text-amber-300 mb-2">
              Atemtechnik & Phrasierung
            </h3>
            <p className="text-xs text-stone-300 leading-relaxed">
              {score.choralGuidance.breathingTechnique ||
                'Gleichmäßiger Atemfluss, Atemstellen stets nach Phrasenenden einlegen. Atemzeichen in der Partitur beachten.'}
            </p>
          </div>
        </div>
      )}

      {/* Voice Range Audit for SATB / Vocals */}
      <div>
        <h3 className="font-serif font-semibold text-sm text-amber-300 mb-3 flex items-center gap-2">
          <Music className="w-4 h-4 text-amber-400" />
          Stimmumfang-Prüfung (Ambitus der Stimmen)
        </h3>

        {voiceChecks.length === 0 ? (
          <p className="text-xs text-stone-400">
            Keine spezifischen Chorspuren in diesem Arrangement vorhanden.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {voiceChecks.map((v, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-stone-950/70 border border-stone-800 rounded-xl text-xs space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-100">{v.trackName}</span>
                  {v.hasWarnings ? (
                    <span className="flex items-center gap-1 text-amber-400 text-[11px]">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {v.warningCount} Randnoten
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-emerald-400 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Ideal
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-stone-400">
                  Rolle: <strong className="text-stone-300">{v.role}</strong>
                </div>
                <div className="text-[11px] text-stone-400">
                  Idealbereich: <strong className="text-amber-200 font-mono">{v.rangeLabel}</strong>
                </div>

                {v.hasWarnings && (
                  <p className="text-[10px] text-amber-300/80 pt-1 border-t border-stone-800">
                    Einige Noten liegen an der extremen Höhengrenze. Nutzen Sie die Transponier-Funktion im Mixer bei Bedarf.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Interactive AI Choral Advisor */}
      <div className="p-4 bg-stone-950/90 border border-stone-800 rounded-xl space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h3 className="font-serif font-semibold text-sm text-amber-200">
            KI-Chormeister & Proben-Assistent
          </h3>
        </div>
        <p className="text-xs text-stone-400">
          Stellen Sie Fragen zur Einstudierung, Stimmtrennung, Vokalbalance oder Intonation für dieses Werk:
        </p>

        <form onSubmit={handleAskChoralAdvisor} className="flex gap-2">
          <input
            type="text"
            value={aiQuestion}
            onChange={(e) => setAiQuestion(e.target.value)}
            placeholder="z.B. Wie kann der Sopran das F#5 mühelos erreichen? Gibt es schwierige Sprünge?"
            className="flex-1 bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
          />
          <button
            type="submit"
            disabled={isLoadingAdvice}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-stone-800 text-stone-950 font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-colors shrink-0"
          >
            {isLoadingAdvice ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Analysiert...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Fragen</span>
              </>
            )}
          </button>
        </form>

        {adviceError && (
          <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-lg text-xs text-red-300">
            {adviceError}
          </div>
        )}

        {aiAdvice && (
          <div className="p-3.5 bg-stone-900/90 border border-stone-800 rounded-lg text-xs text-stone-200 whitespace-pre-line leading-relaxed">
            {aiAdvice}
          </div>
        )}
      </div>
    </div>
  );
};
