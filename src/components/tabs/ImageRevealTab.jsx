import { useState } from 'react';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import GlowCard from '../layout/GlowCard.jsx';
import ShinyButton from '../shared/ShinyButton.jsx';
import FileDrop from '../shared/FileDrop.jsx';
import { Input } from '../ui/input.jsx';
import { Label } from '../ui/label.jsx';
import { decryptMessage } from '@/lib/crypto.js';
import { extractFromImage, extractStandard } from '@/lib/stego/imageEmbed.js';
import { fileToImageData } from '@/lib/utils.js';

export default function ImageRevealTab() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('encrypted');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleExtract = async () => {
    if (!file) { toast.error('Upload a stego image first'); return; }
    if (mode === 'encrypted' && !password) { toast.error('Password required'); return; }
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const img = await fileToImageData(file);
      let text;
      if (mode === 'standard') {
        text = extractStandard(img);
      } else {
        const payload = extractFromImage(img);
        text = await decryptMessage(payload, password);
      }
      setResult(text);
      toast.success('Message extracted ✓');
    } catch {
      setError(
        mode === 'standard'
          ? 'No hidden data found. Make sure image was encoded with Standard LSB mode.'
          : 'Wrong password or no hidden data found.'
      );
      toast.error('Extraction failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <GlowCard title="Stego image">

        {/* Mode toggle */}
        <div className="mb-4 inline-flex w-full rounded-xl border border-border/60 bg-card/40 p-1">
          {[
            { id: 'encrypted', label: '🔒 Encrypted' },
            { id: 'standard',  label: '🌐 Standard LSB' },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => { setMode(id); setResult(null); setError(null); }}
              className={
                'flex-1 rounded-lg py-2 text-xs font-medium uppercase tracking-widest transition ' +
                (mode === id
                  ? 'bg-gradient-primary text-primary-foreground shadow-neon'
                  : 'text-muted-foreground hover:text-foreground')
              }
            >
              {label}
            </button>
          ))}
        </div>

        <p className="mb-4 text-xs text-muted-foreground">
          {mode === 'standard'
            ? '🌐 Standard LSB — works with images from other steganography tools'
            : '🔒 Encrypted — for images hidden using this app with a password'}
        </p>

        <FileDrop
          accept="image/png,image/jpeg,image/webp,image/bmp"
          label="Drop stego image"
          sublabel="PNG recommended"
          file={file}
          onFile={(f) => {
            setFile(f);
            setPreviewUrl(URL.createObjectURL(f));
            setResult(null);
            setError(null);
          }}
          onClear={() => {
            setFile(null); setPreviewUrl(null);
            setResult(null); setError(null);
          }}
          preview={
            previewUrl && (
              <img src={previewUrl} alt="" className="max-h-48 rounded-lg border border-border object-contain" />
            )
          }
        />

        {/* Password — only in encrypted mode */}
        {mode === 'encrypted' && (
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
        )}
      </GlowCard>

      <GlowCard title="Extracted message">
        <ShinyButton
          size="lg"
          className="mb-4 w-full"
          disabled={busy || !file || (mode === 'encrypted' && !password)}
          onClick={handleExtract}
        >
          {mode === 'standard' ? 'Extract (Standard LSB)' : 'Extract & Decrypt'}
        </ShinyButton>

        {result && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
            <Label className="text-primary">Extracted</Label>
            <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-sm text-foreground">
              {result}
            </pre>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-dashed border-muted-foreground/50 bg-muted/30 p-4 text-sm text-muted-foreground">
            {error}
          </div>
        )}

        {!result && !error && (
          <p className="text-sm text-muted-foreground">
            {mode === 'standard'
              ? 'Upload any LSB stego image to extract the hidden text.'
              : 'Upload a stego image and enter the password to reveal the hidden message.'}
          </p>
        )}
      </GlowCard>
    </div>
  );
}