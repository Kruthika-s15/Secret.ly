import { useState } from 'react';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import GlowCard from '../layout/GlowCard.jsx';
import ShinyButton from '../shared/ShinyButton.jsx';
import Waveform from '../shared/Waveform.jsx';
import FileDrop from '../shared/FileDrop.jsx';
import { Input } from '../ui/input.jsx';
import { Label } from '../ui/label.jsx';
import { decryptMessage } from '@/lib/crypto.js';
import { decodeAudioFile, extractFromAudio, buildWaveformData } from '@/lib/stego/audioEmbed.js';

export default function AudioRevealTab() {
  const [file, setFile] = useState(null);
  const [audio, setAudio] = useState(null);
  const [password, setPassword] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (f) => {
    try {
      const info = await decodeAudioFile(f);
      setFile(f);
      setAudio(info);
      setResult(null);
      setError(null);
    } catch {
      toast.error('Could not decode audio');
    }
  };

  const handleExtract = async () => {
    if (!audio || !password) return;
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const payload = extractFromAudio(audio);
      const text = await decryptMessage(payload, password);
      setResult(text);
      toast.success('Message extracted ✓');
    } catch {
      setError('Wrong password or no hidden data found');
      toast.error('Wrong password or no payload found');
    } finally {
      setBusy(false);
    }
  };

  const wave = audio ? buildWaveformData(audio.samples) : [];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <GlowCard title="Stego audio">
        <FileDrop
          accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a"
          label="Drop audio file"
          sublabel="Use WAV from Hide tab for best results"
          file={file}
          onFile={handleFile}
          onClear={() => {
            setFile(null);
            setAudio(null);
            setResult(null);
            setError(null);
          }}
          preview={audio && <Waveform data={wave} label={file?.name} />}
        />
        <div className="relative mt-4">
          <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            type="password"
            className="pl-10"
            placeholder="Decryption password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </GlowCard>

      <GlowCard title="Extracted message">
        <ShinyButton size="lg" className="mb-4 w-full" disabled={busy || !audio} onClick={handleExtract}>
          Extract Hidden Message
        </ShinyButton>

        {result && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
            <Label className="text-primary">Decrypted</Label>
            <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-sm">{result}</pre>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-dashed border-muted-foreground/50 p-4 text-sm text-muted-foreground">
            {error}
          </div>
        )}

        {!result && !error && (
          <p className="text-sm text-muted-foreground">Upload stego audio and enter the password.</p>
        )}
      </GlowCard>
    </div>
  );
}
