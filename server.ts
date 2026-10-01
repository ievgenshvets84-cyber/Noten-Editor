import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Support audio base64 payloads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Server-side Gemini Client
const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

// Transcribe Music and Song Audio to Sheet Music Partitur
app.post('/api/transcribe-music', async (req, res) => {
  try {
    const { audioBase64, mimeType = 'audio/mp3', options = {} } = req.body;

    const ai = getAiClient();
    if (!ai) {
      return res.status(400).json({
        error: 'NO_API_KEY',
        message: 'Kein GEMINI_API_KEY auf dem Server konfiguriert. Bitte verwenden Sie die integrierte lokale Audio-Analyse oder Presets.',
      });
    }

    if (!audioBase64) {
      return res.status(400).json({
        error: 'NO_AUDIO_DATA',
        message: 'Keine Audiodaten übermittelt.',
      });
    }

    const {
      detectChoir = true,
      detectInstruments = true,
      choralArrangement = 'SATB',
      preferGermanTerms = true,
    } = options;

    const promptText = `Du bist ein weltklasse Musiktheoretiker, Chorleiter und Audio-Transkriptor.
Analysiere diese Audioaufnahme mit höchster musikalischer Präzision und erstelle eine vollständige, spielbare Notenpartitur (Sheet Music Partitur).

Erkenne und strukturiere:
1. Titel des Werkes / Liedes, Komponist/Interpret (falls bekannt oder Genre/Stil), Tempo in BPM (präzise Zahl), Taktart (z.B. 4/4 oder 3/4), Tonart (z.B. "C-Dur", "G-Dur", "d-Moll", "F-Dur").
2. Getrennte Partitur-Spuren (Tracks):
   ${detectChoir ? `- Chorspuren bzw. Gesangsspuren (${choralArrangement === 'SATB' ? 'Sopran, Alt, Tenor, Bass' : 'Lead Gesang und Begleitstimmen'}) mit vollständigen Textsilben (Lyrics direkt unter jeder Note silbengenau!), Gesangsanweisungen (z.B. Atemzeichen, Kopfstimme, Solo, Tutti, p, mf, f).` : '- Gesangsstimme mit Textsilben.'}
   ${detectInstruments ? '- Instrumentenspuren (z.B. Klavier, Gitarre, Bass, Streicher) mit Noten und passendem Notenschlüssel (treble für G-Schlüssel, bass für F-Schlüssel).' : ''}
3. Jede Spur muss ein Array von chronologischen Noten enthalten:
   - pitch: z.B. "C4", "D4", "E4", "F#4", "Bb3"
   - midiNote: MIDI-Nummer (60 für C4, 62 für D4, etc.)
   - startBeat: Beat-Position ab Takt 1 (0.0 = Takt 1 Schlag 1, 1.0 = Schlag 2, etc.)
   - durationBeats: Dauer in Beats (1.0 = Viertelnote, 0.5 = Achtelnote, 2.0 = Halbe, 4.0 = Ganze, 0.25 = Sechzehntel)
   - lyric: Textsilbe (nur bei Gesang/Chor)
   - choralMarking: z.B. "Atemzeichen", "Crescendo", "Kopfstimme", "Legato", "p", "f", "Solo", "Tutti"
   - isRest: boolean (falls Pause)
4. Chor-Anleitung & Vokale Hinweise:
   - Stimmumfang (z.B. "C4 - G5"), Einstiegshilfen, Atemtechnik, Aussprachetipps.
5. Liedstruktur: Abschnitte wie Intro, Strophe, Refrain / Chor, Bridge, Outro mit Taktnummern.

Erstelle mindestens 8 bis 16 Takte detaillierte Noten aus dem Audio.
Antworte ausschließlich in valider JSON-Struktur entsprechend dem Schema.`;

    const contents = {
      parts: [
        {
          inlineData: {
            mimeType: mimeType,
            data: audioBase64,
          },
        },
        {
          text: promptText,
        },
      ],
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: 'Titel des Musikstücks oder Liedes' },
            artist: { type: Type.STRING, description: 'Künstler, Komponist oder Stil' },
            bpm: { type: Type.NUMBER, description: 'Geschwindigkeit in Beats per Minute' },
            timeSignature: {
              type: Type.OBJECT,
              properties: {
                beats: { type: Type.NUMBER, description: 'Zähler z.B. 4 oder 3' },
                beatUnit: { type: Type.NUMBER, description: 'Nenner z.B. 4 oder 8' },
              },
              required: ['beats', 'beatUnit'],
            },
            key: { type: Type.STRING, description: 'Tonart z.B. C-Dur, G-Dur, a-Moll' },
            choralGuidance: {
              type: Type.OBJECT,
              properties: {
                generalAdvice: { type: Type.STRING, description: 'Allgemeine Anweisungen für den Chor' },
                breathingTechnique: { type: Type.STRING, description: 'Atemtechnische Hinweise' },
                vocalTuningTips: { type: Type.STRING, description: 'Intonations- und Harmoniehinweise' },
              },
              required: ['generalAdvice'],
            },
            sections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: 'z.B. Intro, Strophe 1, Refrain / Chor, Outro' },
                  startMeasure: { type: Type.NUMBER },
                  endMeasure: { type: Type.NUMBER },
                },
                required: ['name', 'startMeasure', 'endMeasure'],
              },
            },
            tracks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING, description: 'Name der Stimme oder des Instruments' },
                  instrument: {
                    type: Type.STRING,
                    description: 'choir_soprano, choir_alto, choir_tenor, choir_bass, lead_vocal, piano, guitar, strings, bass',
                  },
                  clef: { type: Type.STRING, description: 'treble oder bass' },
                  choralRole: { type: Type.STRING, description: 'z.B. Hauptmelodie, Harmoniestimme, Bassfundament' },
                  vocalRange: { type: Type.STRING, description: 'z.B. C4 - F5' },
                  notes: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        pitch: { type: Type.STRING, description: 'Tonhöhe z.B. E4, G#4, C5' },
                        midiNote: { type: Type.NUMBER, description: 'MIDI Nummer 21-108' },
                        startBeat: { type: Type.NUMBER, description: 'Startposition in Beats' },
                        durationBeats: { type: Type.NUMBER, description: 'Dauer in Beats z.B. 1 für Viertel, 0.5 für Achtel' },
                        lyric: { type: Type.STRING, description: 'Silbe oder Wort' },
                        isRest: { type: Type.BOOLEAN },
                        choralMarking: { type: Type.STRING, description: 'Vokale Anweisung oder Dynamik' },
                      },
                      required: ['pitch', 'midiNote', 'startBeat', 'durationBeats'],
                    },
                  },
                },
                required: ['id', 'name', 'instrument', 'clef', 'notes'],
              },
            },
          },
          required: ['title', 'bpm', 'timeSignature', 'key', 'tracks'],
        },
      },
    });

    const textOutput = response.text;
    if (!textOutput) {
      throw new Error('Keine Ausgabe von Gemini erhalten.');
    }

    const parsedData = JSON.parse(textOutput);
    res.json({
      success: true,
      score: parsedData,
    });
  } catch (error: any) {
    console.error('Gemini Transcription Error:', error);
    res.status(500).json({
      error: 'TRANSCRIPTION_FAILED',
      message: error?.message || 'Fehler bei der Transkription durch das KI-Modell.',
    });
  }
});

// AI Choral & Arrangement Assistant Endpoint
app.post('/api/ai-arrangement-advice', async (req, res) => {
  try {
    const ai = getAiClient();
    if (!ai) {
      return res.status(400).json({
        error: 'NO_API_KEY',
        message: 'Kein GEMINI_API_KEY auf dem Server konfiguriert.',
      });
    }

    const { scoreContext, userQuestion } = req.body;

    const prompt = `Du bist ein renommierter Chormeister und Arrangement-Experte.
Hier ist der aktuelle Stand der Partitur:
Titel: ${scoreContext?.title || 'Unbekannt'}
Tonart: ${scoreContext?.key || 'C-Dur'}
Tempo: ${scoreContext?.bpm || 120} BPM
Spuren: ${scoreContext?.tracks?.map((t: any) => `${t.name} (${t.instrument})`).join(', ')}

Frage des Nutzers / Aufgabe:
"${userQuestion || 'Analysiere das Chorangebot auf Stimmführung, Quintparallelen, Atempausen und schlage Verbesserungen vor.'}"

Gib präzise, musikalisch fundierte Tipps für Chor, Einstudierung, Vokaltechniken und Arrangement-Harmonisierung.
Strukturiere deine Antwort übersichtlich mit Absätzen und praktischen Empfehlungen.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
    });

    res.json({
      success: true,
      advice: response.text,
    });
  } catch (error: any) {
    console.error('Choral Advice Error:', error);
    res.status(500).json({
      error: 'ADVICE_FAILED',
      message: error?.message || 'Fehler beim Abrufen der Ratschläge.',
    });
  }
});

// Setup Frontend Serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: PORT },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PartiturStudio AI Server läuft auf http://0.0.0.0:${PORT}`);
  });
}

startServer();
