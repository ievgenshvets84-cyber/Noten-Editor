import React, { useState, useRef } from 'react';
import { ScoreData } from '../types/music';
import { ALL_PRESETS } from '../utils/presets';
import { transcribeAudioLocally } from '../utils/audioAnalyzer';
import {
  Upload,
  Mic,
  Square,
  Sparkles,
  Music,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileAudio,
  X,
} from 'lucide-react';

interface AudioUploaderProps {
  onScoreLoaded: (score: ScoreData) => void;
  onClose: () => void;
}

export const AudioUploader: React.FC<AudioUploaderProps> = ({
  onScoreLoaded,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'mic' | 'presets'>('presets');
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Options
  const [detectChoir, setDetectChoir] = useState(true);
  const [detectInstruments, setDetectInstruments] = useState(true);
  const [choralMode, setChoralMode] = useState<'SATB' | 'lead-backing' | 'solo-choir'>('SATB');

  // Mic recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setErrorMsg(null);
    }
  };

  // Convert blob/file to Base64
  const fileToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result as string;
        // Strip data:audio/xyz;base64,
        const base64 = res.split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Start Mic Recording
  const startRecording = async () => {
    setErrorMsg(null);
    audioChunksRef.current = [];
    setRecordSeconds(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(250);
      setIsRecording(true);

      timerRef.current = window.setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      setErrorMsg(
        'Mikrofon-Zugriff nicht gestattet oder nicht verfügbar: ' + (err?.message || '')
      );
    }
  };

  // Stop Mic Recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  // Process and Transcribe Audio
  const handleTranscribe = async (audioBlob: Blob, filename = 'Aufnahme.mp3') => {
    setIsProcessing(true);
    setErrorMsg(null);
    setProcessingStage('Audio wird dekodiert und vorbereitet...');

    try {
      const base64Data = await fileToBase64(audioBlob);
      setProcessingStage('KI-Transkription: Stimmen & Noten werden analysiert...');

      // Attempt server-side Gemini Transcription
      const response = await fetch('/api/transcribe-music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64Data,
          mimeType: audioBlob.type || 'audio/mp3',
          filename,
          options: {
            detectChoir,
            detectInstruments,
            choralArrangement: choralMode,
          },
        }),
      });

      const data = await response.json();

      if (response.ok && data.success && data.score) {
        setProcessingStage('Notenpartitur wird gerendert...');
        onScoreLoaded(data.score);
        onClose();
        return;
      }

      // If server returned NO_API_KEY or failed, trigger in-browser DSP pitch analysis fallback
      console.warn('AI API unavailable or returned fallback:', data?.message);
      setProcessingStage('Verwende integrierte DSP-Frequenzanalyse (Offline-Engine)...');

      // Decode audio into AudioBuffer for local analysis
      const arrayBuffer = await audioBlob.arrayBuffer();
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtxClass();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      const localScore = await transcribeAudioLocally(audioBuffer, filename);
      onScoreLoaded(localScore);
      onClose();
    } catch (err: any) {
      console.error('Transcription error:', err);
      setErrorMsg(
        'Fehler bei der Audioverarbeitung: ' +
          (err?.message || 'Audiodatei konnte nicht analysiert werden.')
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // Load a preset directly
  const handleLoadPreset = (key: string) => {
    const preset = ALL_PRESETS[key];
    if (preset) {
      onScoreLoaded(preset.data);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col text-stone-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-stone-950 border-b border-stone-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-serif font-bold text-base text-amber-200">
                Musik & Gesang transkribieren
              </h2>
              <p className="text-[11px] text-stone-400">
                Erzeugt spielbare Notenpartitur, Chor-Stimmen und MIDI-Export
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-stone-400 hover:text-stone-100 rounded-lg hover:bg-stone-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-stone-800 bg-stone-950/60 px-6 pt-2">
          <button
            onClick={() => setActiveTab('presets')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'presets'
                ? 'border-amber-500 text-amber-300'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Music className="w-3.5 h-3.5" />
            <span>Klassiker & Demo-Presets</span>
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'upload'
                ? 'border-amber-500 text-amber-300'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Audio-Datei hochladen</span>
          </button>
          <button
            onClick={() => setActiveTab('mic')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'mic'
                ? 'border-amber-500 text-amber-300'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Mikrofon-Aufnahme</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-6 space-y-6 flex-1 overflow-y-auto max-h-[460px]">
          {/* TAB 1: PRESETS */}
          {activeTab === 'presets' && (
            <div className="space-y-3">
              <p className="text-xs text-stone-300">
                Wählen Sie ein vorkonfiguriertes, mehrstimmiges Meisterwerk zum sofortigen Ausprobieren des Partitur-Editors, der Chor-Anleitung und des MIDI-Exports:
              </p>
              <div className="grid grid-cols-1 gap-3">
                {Object.entries(ALL_PRESETS).map(([key, item]) => (
                  <div
                    key={key}
                    onClick={() => handleLoadPreset(key)}
                    className="p-4 rounded-xl bg-stone-950/70 border border-stone-800 hover:border-amber-500/50 hover:bg-stone-950 cursor-pointer transition-all flex items-center justify-between group"
                  >
                    <div>
                      <h4 className="font-serif font-bold text-sm text-stone-100 group-hover:text-amber-300 transition-colors">
                        {item.label}
                      </h4>
                      <p className="text-xs text-stone-400 mt-0.5">
                        {item.description}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-stone-500">
                        <span>{item.data.tracks.length} Spuren</span>
                        <span>·</span>
                        <span>{item.data.bpm} BPM</span>
                        <span>·</span>
                        <span>{item.data.key}</span>
                      </div>
                    </div>
                    <span className="px-3 py-1.5 bg-amber-500/10 text-amber-300 group-hover:bg-amber-500 group-hover:text-stone-950 rounded-lg text-xs font-semibold transition-all">
                      Laden →
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: FILE UPLOAD */}
          {activeTab === 'upload' && (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileChange}
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-stone-700 hover:border-amber-500/60 rounded-xl p-8 text-center cursor-pointer bg-stone-950/40 hover:bg-stone-950/80 transition-all"
              >
                <div className="w-12 h-12 mx-auto rounded-full bg-stone-800 flex items-center justify-center text-amber-400 mb-3">
                  <FileAudio className="w-6 h-6" />
                </div>
                {selectedFile ? (
                  <div>
                    <span className="text-sm font-semibold text-amber-300 block">
                      {selectedFile.name}
                    </span>
                    <span className="text-xs text-stone-400 mt-1 block">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Klicke zum Ändern
                    </span>
                  </div>
                ) : (
                  <div>
                    <span className="text-sm font-semibold text-stone-200 block">
                      Audio-Datei auswählen oder hierher ziehen
                    </span>
                    <span className="text-xs text-stone-400 mt-1 block">
                      Unterstützt MP3, WAV, FLAC, M4A, OGG
                    </span>
                  </div>
                )}
              </div>

              {selectedFile && (
                <button
                  onClick={() => handleTranscribe(selectedFile, selectedFile.name)}
                  disabled={isProcessing}
                  className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-stone-800 text-stone-950 font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-98"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{processingStage}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Partitur & MIDI jetzt transkribieren</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* TAB 3: MIC RECORDING */}
          {activeTab === 'mic' && (
            <div className="space-y-4 text-center py-4">
              <p className="text-xs text-stone-400">
                Singen Sie ein Lied oder spielen Sie ein Instrument direkt über Ihr Mikrofon ein:
              </p>

              <div className="flex flex-col items-center justify-center gap-3">
                <div
                  className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                    isRecording
                      ? 'bg-red-600/20 text-red-400 border-2 border-red-500 animate-pulse'
                      : 'bg-stone-800 text-stone-300 border border-stone-700'
                  }`}
                >
                  <Mic className="w-8 h-8" />
                </div>

                <div className="font-mono text-xl font-bold text-stone-200">
                  {Math.floor(recordSeconds / 60)
                    .toString()
                    .padStart(2, '0')}
                  :{(recordSeconds % 60).toString().padStart(2, '0')}
                </div>

                {isRecording ? (
                  <button
                    onClick={stopRecording}
                    className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    <span>Aufnahme stoppen</span>
                  </button>
                ) : (
                  <button
                    onClick={startRecording}
                    className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg"
                  >
                    <Mic className="w-4 h-4" />
                    <span>Aufnahme starten</span>
                  </button>
                )}
              </div>

              {!isRecording && audioChunksRef.current.length > 0 && (
                <div className="pt-4 border-t border-stone-800">
                  <button
                    onClick={() => {
                      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                      handleTranscribe(blob, 'Mikrofon_Aufnahme.webm');
                    }}
                    disabled={isProcessing}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{processingStage}</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Aufnahme in Notenpartitur umwandeln</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Advanced Transcription Options */}
          {(activeTab === 'upload' || activeTab === 'mic') && (
            <div className="p-4 bg-stone-950/60 border border-stone-800 rounded-xl space-y-3 text-xs">
              <h4 className="font-semibold text-stone-300">Erweiterte Transkriptions-Optionen:</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={detectChoir}
                    onChange={(e) => setDetectChoir(e.target.checked)}
                    className="accent-amber-500 rounded"
                  />
                  <span>Chor & Gesang getrennt transkribieren</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={detectInstruments}
                    onChange={(e) => setDetectInstruments(e.target.checked)}
                    className="accent-amber-500 rounded"
                  />
                  <span>Instrumente erkennen (Klavier, Gitarre, Bass)</span>
                </label>
              </div>

              <div>
                <label className="block text-stone-400 mb-1">Chor-Stimmverteilung:</label>
                <select
                  value={choralMode}
                  onChange={(e) => setChoralMode(e.target.value as any)}
                  className="bg-stone-900 border border-stone-700 rounded-lg px-2.5 py-1 text-xs text-stone-200"
                >
                  <option value="SATB">SATB (Sopran, Alt, Tenor, Bass)</option>
                  <option value="lead-backing">Lead Gesang + Begleitstimmen</option>
                  <option value="solo-choir">Solo Stimme + Tutti Chor</option>
                </select>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-xs text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
