import { useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import GlowCard from '../layout/GlowCard.jsx';
import ShinyButton from '../shared/ShinyButton.jsx';
import MetricCard from '../shared/MetricCard.jsx';
import Waveform from '../shared/Waveform.jsx';
import FileDrop from '../shared/FileDrop.jsx';
import { Input } from '../ui/input.jsx';
import { Textarea } from '../ui/textarea.jsx';
import { Label } from '../ui/label.jsx';
import { Progress } from '../ui/progress.jsx';
import { encryptMessage } from '@/lib/crypto.js';
import {
  decodeAudioFile,
  embedInAudio,
  buildWaveformData,
  getAudioCapacityBytes,
} from '@/lib/stego/audioEmbed.js';
import { downloadBlob, utf8Encode } from '@/lib/utils.js';

export default function AudioHideTab() {
  const [file, setFile] = useState(null);
  const [audio, setAudio] = useState(null);
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const [embedResult, setEmbedResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const msgBytes = useMemo(() => utf8Encode(message).length, [message]);
  const capacity = audio ? getAudioCapacityBytes(audio) : 0;
  const usedPct = capacity ? Math.min(100, (msgBytes / capacity) * 100) : 0;

  const handleFile = async (f) => {
    if (f.size > 50 * 1024 * 1024) {
      toast.error('Audio must be under 50MB');
      return;
    }
    try {
      const info = await decodeAudioFile(f);
      if (info.duration < 2) {
        toast.error('Audio too short — need at least 2 seconds');
        return;
      }
      setFile(f);
      setAudio(info);
      setEmbedResult(null);
    } catch {
      toast.error('Could not decode audio file');
    }
  };

  const handleHide = async () => {
    if (!audio || !message || !password) {
      toast.error('Audio, message, and password required');
      return;
    }
    if (msgBytes > capacity) {
      toast.error('Message exceeds audio capacity');
      return;
    }
    setBusy(true);
    try {
      const encrypted = await encryptMessage(message, password);
      const result = embedInAudio(audio, encrypted);
      setEmbedResult(result);
      toast.success('Message hidden ✓');
    } catch (e) {
      toast.error(e.message || 'Embedding failed');
    } finally {
      setBusy(false);
    }
  };

  const origWave = audio ? buildWaveformData(audio.samples) : [];
  const stegoWave = embedResult ? buildWaveformData(embedResult.stegoSamples) : [];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <GlowCard title="Audio input">
        <FileDrop
          accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a"
          label="Drop audio file"
          sublabel="WAV, MP3, OGG, FLAC, M4A — max 50MB"
          file={file}
          onFile={handleFile}
          onClear={() => {
            setFile(null);
            setAudio(null);
            setEmbedResult(null);
          }}
          preview={
            audio && (
              <div className="space-y-2 text-xs text-muted-foreground">
                <p className="font-mono text-foreground">{file?.name}</p>
                <p>
                  {audio.duration.toFixed(1)}s · {audio.numChannels === 1 ? 'Mono' : 'Stereo'} ·{' '}
                  {(audio.sampleRate / 1000).toFixed(1)} kHz
                </p>
                <p>Capacity: {(capacity / 1024).toFixed(1)} KB</p>
                <Waveform data={origWave} label="Waveform" color="hsl(0 0% 50%)" />
              </div>
            )
          }
        />
        <div className="relative mt-4">
          <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            type="password"
            className="pl-10"
            placeholder="Encryption password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </GlowCard>

      <GlowCard title="Message & output">
        <div className="space-y-2">
          <Label>Secret message</Label>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} />
          <p className="text-xs text-muted-foreground">{msgBytes} bytes</p>
          {audio && (
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span>Capacity used</span>
                <span className={usedPct > 80 ? 'text-muted-foreground' : ''}>{usedPct.toFixed(0)}%</span>
              </div>
              <Progress value={usedPct} className={usedPct > 80 ? '[&>div]:bg-muted-foreground' : ''} />
            </div>
          )}
        </div>

        <ShinyButton
          size="lg"
          className="mt-4 w-full"
          disabled={busy || !audio || !message || !password}
          onClick={handleHide}
        >
          Hide in Audio
        </ShinyButton>

        {embedResult && (
          <div className="mt-6 space-y-4 animate-fade-in-up">
            <div className="grid grid-cols-3 gap-3">
              <MetricCard label="SNR" value={embedResult.snrDb.toFixed(1)} unit="dB" />
              <MetricCard label="Density" value={(embedResult.densityUsed * 100).toFixed(2)} unit="%" />
              <MetricCard label="Bits" value={embedResult.bitsEmbedded} />
            </div>
            <Waveform data={origWave} label="Original (grey)" color="hsl(0 0% 45%)" />
            <Waveform data={stegoWave} label="Stego (white)" color="hsl(0 0% 100%)" />
            <p className="text-center text-xs text-muted-foreground">
              Waveforms are visually identical — imperceptible to human hearing
            </p>
            <ShinyButton
              className="w-full"
              onClick={() => {
                const blob = new Blob([embedResult.wavBuffer], { type: 'audio/wav' });
                downloadBlob(blob, 'sonicveil-stego.wav');
              }}
            >
              Download WAV
            </ShinyButton>
          </div>
        )}
      </GlowCard>
    </div>
  );
}
