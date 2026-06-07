import { useMemo, useState } from 'react';
import { Download, Eye, KeyRound, Lock, ScanSearch, Send, Sparkles, Globe, X, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import GlowCard from '../layout/GlowCard.jsx';
import ShinyButton from '../shared/ShinyButton.jsx';
import MetricCard from '../shared/MetricCard.jsx';
import FileDrop from '../shared/FileDrop.jsx';
import { encryptMessage } from '@/lib/crypto.js';
import { embedInImage, embedStandard } from '@/lib/stego/imageEmbed.js';
import { analyzeImage } from '@/lib/stego/imageAnalysis.js';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { getOrCreateConversation, uploadStegoImage, sendMessage, searchProfiles } from '@/lib/chat.js';
import {
  fileToImageData,
  imageDataToDataUrl,
  imageDataToPngBlob,
  downloadBlob,
  utf8Encode,
} from '@/lib/utils.js';
import { cn } from '@/lib/utils.js';

function RoiHeatmap({ roi, imageUrl }) {
  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-border" style={{ aspectRatio: '4/3' }}>
      {imageUrl && <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />}
      <div className="absolute inset-0 grid mix-blend-overlay" style={{ gridTemplateColumns: 'repeat(32, 1fr)' }}>
        {roi.flat().map((v, i) => (
          <div key={i} style={{ background: `hsl(0 0% 100% / ${v.toFixed(3)})` }} />
        ))}
      </div>
    </div>
  );
}

// ── Send to Chat Dialog ──────────────────────────────────────────────────────
function SendToChatDialog({ open, onClose, stegoBlob, mode }) {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [conversations, setConversations] = useState([]);

  // Load existing conversations on open
  useMemo(() => {
    if (!open || !user) return;
    (async () => {
      const { data } = await supabase
        .from('conversations').select('*')
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .order('last_message_at', { ascending: false });
      const convs = data ?? [];
      const peerIds = convs.map((c) => (c.user_a === user.id ? c.user_b : c.user_a));
      if (!peerIds.length) { setConversations([]); return; }
      const { data: p } = await supabase.from('profiles')
        .select('id, username, display_name, email').in('id', peerIds);
      const peers = p ?? [];
      setConversations(convs.map((c) => ({
        ...c,
        peer: peers.find((pp) => pp.id === (c.user_a === user.id ? c.user_b : c.user_a)),
      })));
    })();
  }, [open, user]);

  // Search users
  useMemo(() => {
    if (!search.trim()) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try { setResults(await searchProfiles(search, user.id)); }
      finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [search, user]);

  const sendTo = async (peerId, peerName) => {
    if (!stegoBlob || !user) return;
    setSending(true);
    try {
      const conv = await getOrCreateConversation(user.id, peerId);
      const path = await uploadStegoImage(conv.id, stegoBlob);
      await sendMessage({
        conversationId: conv.id,
        senderId: user.id,
        content: null,
        imagePath: path,
        imageKind: mode === 'standard' ? 'Standard LSB' : 'Encrypted LSB',
      });
      toast.success(`Sent to @${peerName} ✓`);
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  const showList = search.trim() ? results : conversations.map((c) => ({
    id: c.peer?.id,
    username: c.peer?.username,
    email: c.peer?.email,
    display_name: c.peer?.display_name,
  })).filter((p) => p.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border/60 bg-card shadow-neon">
        <div className="flex items-center justify-between border-b border-border/40 p-4">
          <div className="flex items-center gap-2 text-primary">
            <MessageSquare className="h-4 w-4" />
            <h3 className="text-sm font-semibold uppercase tracking-widest">Send to Chat</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by username or email…"
            className="w-full rounded-xl border border-border bg-input/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />

          <div className="max-h-64 space-y-1 overflow-y-auto">
            {searching && <p className="px-2 text-xs text-muted-foreground">Searching…</p>}
            {!searching && showList.length === 0 && (
              <p className="px-2 text-xs text-muted-foreground">
                {search.trim() ? 'No users found' : 'No conversations yet — search for a user'}
              </p>
            )}
            {showList.map((p) => (
              <button
                key={p.id}
                onClick={() => sendTo(p.id, p.username)}
                disabled={sending}
                className="flex w-full items-center gap-3 rounded-lg border border-transparent p-2 text-left transition hover:border-border hover:bg-card/60 disabled:opacity-50"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-primary-foreground">
                  {p.username?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">@{p.username}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{p.email}</p>
                </div>
                <Send className="h-4 w-4 shrink-0 text-primary" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Tab ─────────────────────────────────────────────────────────────────
export default function ImageHideTab() {
  const [file, setFile] = useState(null);
  const [imageData, setImageData] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('encrypted');
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [embedResult, setEmbedResult] = useState(null);
  const [stegoUrl, setStegoUrl] = useState(null);
  const [stegoBlob, setStegoBlob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  const byteCount = useMemo(() => utf8Encode(message).length, [message]);

  const reset = () => {
    setFile(null); setImageData(null); setPreviewUrl(null);
    setAnalysis(null); setEmbedResult(null);
    setStegoUrl(null); setStegoBlob(null);
  };

  const handleFile = async (f) => {
    if (f.size > 20 * 1024 * 1024) { toast.error('Image must be under 20MB'); return; }
    reset();
    setFile(f);
    const data = await fileToImageData(f);
    setImageData(data);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const onAnalyze = () => {
    if (!imageData) { toast.error('Upload an image first'); return; }
    setAnalyzing(true);
    setTimeout(() => {
      try {
        const result = analyzeImage(imageData);
        setAnalysis(result);
        if (result.verdict === 'REJECTED') toast.error('Image rejected — unsuitable carrier');
        else if (result.verdict === 'WARNING') toast.warning('Proceed with caution — limited texture');
        else toast.success('Image accepted as a strong carrier');
      } catch (e) {
        toast.error('Analysis failed: ' + e.message);
      } finally {
        setAnalyzing(false);
      }
    }, 50);
  };

  const onEmbed = async () => {
    if (!imageData) return toast.error('Upload an image first');
    if (!message) return toast.error('Enter a secret message');
    if (mode === 'encrypted' && password.length < 4) return toast.error('Password must be at least 4 chars');
    if (mode === 'standard' && file && !file.name.match(/\.png$/i)) {
      return toast.error('Standard LSB requires PNG — JPG compression destroys hidden bits');
    }
    if (analysis?.verdict === 'REJECTED') return toast.error('Image rejected — choose a more textured carrier');
    setBusy(true);
    try {
      let result;
      if (mode === 'standard') {
        result = embedStandard(imageData, message);
      } else {
        const payload = await encryptMessage(message, password);
        result = embedInImage(imageData, payload);
      }
      setEmbedResult(result);
      setStegoUrl(imageDataToDataUrl(result.stego));
      setStegoBlob(await imageDataToPngBlob(result.stego));
      toast.success(`Hidden ✓  PSNR ${result.psnr.toFixed(2)} dB`);
    } catch (e) {
      toast.error(e.message || 'Embedding failed');
    } finally {
      setBusy(false);
    }
  };

  const onDownload = () => {
    if (!stegoBlob) return;
    downloadBlob(stegoBlob, 'secret-stego.png');
  };

  const chartData = embedResult
    ? [
        { name: 'Standard LSB', psnr: Math.max(0, embedResult.psnr - 4.5) },
        { name: 'Secret (ROI)', psnr: embedResult.psnr },
      ]
    : [];

  const verdictBadge = analysis ? (
    <span className={cn(
      'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest',
      analysis.verdict === 'ACCEPTED' ? 'bg-green-500/10 text-green-400 ring-1 ring-green-500/40'
        : analysis.verdict === 'WARNING' ? 'bg-yellow-500/10 text-yellow-400 ring-1 ring-yellow-500/40'
        : 'bg-red-500/10 text-red-400 ring-1 ring-red-500/40'
    )}>
      {analysis.verdict}
    </span>
  ) : null;

  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* ══ CARD 1: INPUT ══ */}
        <GlowCard>
          <div className="space-y-5 p-6">
            <header className="flex items-center gap-2 text-primary">
              <Lock className="h-4 w-4" />
              <h2 className="text-sm uppercase tracking-[0.25em]">Input</h2>
            </header>

            <div className="inline-flex w-full rounded-xl border border-border/60 bg-card/40 p-1">
              {[
                { id: 'encrypted', label: '🔒 Encrypted' },
                { id: 'standard',  label: '🌐 Standard' },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  className={cn(
                    'flex-1 rounded-lg py-2 text-[11px] font-medium uppercase tracking-widest transition',
                    mode === id
                      ? 'bg-gradient-primary text-primary-foreground shadow-neon'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <p className="text-[11px] text-muted-foreground">
              {mode === 'standard'
                ? '🌐 Plain LSB — PNG only, compatible with other stego apps'
                : '🔒 Fernet AES-128 — only decodable by Secret app'}
            </p>

            <FileDrop
              accept={mode === 'standard' ? 'image/png' : 'image/png,image/jpeg,image/webp,image/bmp'}
              label="Drop carrier image"
              sublabel={mode === 'standard' ? 'PNG only (LSB requires lossless)' : 'PNG, JPG, WEBP, BMP · max 20MB'}
              file={file}
              onFile={handleFile}
              onClear={reset}
              preview={
                previewUrl && (
                  <img src={previewUrl} alt="" className="max-h-40 w-full rounded-lg border border-border object-contain" />
                )
              }
            />

            <div className="space-y-2">
              <label className="text-[11px] uppercase tracking-widest text-muted-foreground">Secret message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="Type something only the right key can read…"
                className="w-full resize-none rounded-xl border border-border bg-input/60 p-3 text-sm font-mono outline-none focus:border-primary focus:ring-2 focus:ring-primary/40"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{message.length} chars · {byteCount} bytes</span>
                {imageData && <span>{imageData.width}×{imageData.height}</span>}
              </div>
            </div>

            {mode === 'encrypted' && (
              <div className="space-y-2">
                <label className="text-[11px] uppercase tracking-widest text-muted-foreground">Password</label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/70" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-border bg-input/60 py-2.5 pl-10 pr-3 text-sm font-mono outline-none focus:border-primary focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>
            )}
          </div>
        </GlowCard>

        {/* ══ CARD 2: ANALYSIS ══ */}
        <GlowCard>
          <div className="space-y-5 p-6">
            <header className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary">
                <ScanSearch className="h-4 w-4" />
                <h2 className="text-sm uppercase tracking-[0.25em]">Analysis</h2>
              </div>
              {verdictBadge}
            </header>

            <ShinyButton onClick={onAnalyze} disabled={!imageData || analyzing} className="w-full">
              <Eye className="h-4 w-4" />
              {analyzing ? 'Analyzing…' : 'Analyze Image'}
            </ShinyButton>

            {analysis ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <MetricCard label="Texture" value={analysis.textureScore} unit="/100" />
                  <MetricCard label="Edges" value={analysis.edgeDensityPct.toFixed(1)} unit="%" />
                  <MetricCard label="Complexity" value={analysis.complexityScore} unit="/100" />
                </div>
                {analysis.roi && (
                  <div>
                    <p className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                      ROI Heatmap · {imageData?.width}×{imageData?.height}
                    </p>
                    <RoiHeatmap roi={analysis.roi} imageUrl={previewUrl} />
                  </div>
                )}
                <ul className="space-y-1 rounded-lg border border-border/60 bg-card/40 p-3 text-xs text-muted-foreground">
                  {analysis.reasons.map((r, i) => (
                    <li key={i} className="flex gap-2"><span className="text-primary">›</span>{r}</li>
                  ))}
                </ul>
                {analysis.capacityBytes && (
                  <p className="text-[11px] text-muted-foreground">Capacity: ~{analysis.capacityBytes} bytes</p>
                )}
              </>
            ) : (
              <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border/60 text-xs text-muted-foreground">
                Run analysis to view metrics & ROI heatmap
              </div>
            )}
          </div>
        </GlowCard>

        {/* ══ CARD 3: OUTPUT ══ */}
        <GlowCard>
          <div className="space-y-5 p-6">
            <header className="flex items-center gap-2 text-primary">
              <Sparkles className="h-4 w-4" />
              <h2 className="text-sm uppercase tracking-[0.25em]">Output</h2>
            </header>

            <ShinyButton
              onClick={onEmbed}
              disabled={busy || !imageData || !message || (mode === 'encrypted' && password.length < 4)}
              className="w-full"
            >
              <Lock className="h-4 w-4" />
              {busy ? 'Embedding…' : mode === 'standard' ? 'Hide (Standard LSB)' : 'Hide & Encrypt'}
            </ShinyButton>

            {embedResult && stegoUrl ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <MetricCard label="PSNR" value={embedResult.psnr.toFixed(2)} unit="dB" />
                  <MetricCard label="Density" value={(embedResult.densityUsed * 100).toFixed(2)} unit="%" />
                </div>

                <div className="rounded-lg border border-border/60 bg-card/40 p-3">
                  <p className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">PSNR Comparison</p>
                  <ResponsiveContainer width="100%" height={130}>
                    <BarChart data={chartData}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} domain={[0, 80]} />
                      <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="psnr" radius={[6, 6, 0, 0]}>
                        {chartData.map((_, i) => (
                          <Cell key={i} fill={i === 0 ? 'hsl(var(--muted-foreground))' : 'hsl(var(--primary))'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">Original</p>
                    <img src={previewUrl} alt="" className="w-full rounded-lg border border-border object-contain" />
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">Stego</p>
                    <img src={stegoUrl} alt="" className="w-full rounded-lg border border-border object-contain" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <ShinyButton onClick={onDownload} variant="ghost" className="w-full">
                    <Download className="h-4 w-4" /> Download
                  </ShinyButton>
                  <ShinyButton onClick={() => setSendOpen(true)} className="w-full col-span-2" disabled={!stegoBlob}>
                    <Send className="h-4 w-4" /> Send to Chat
                  </ShinyButton>
                </div>
              </>
            ) : (
              <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border/60 text-xs text-muted-foreground">
                Run "Hide & Encrypt" to view results
              </div>
            )}
          </div>
        </GlowCard>
      </div>

      <SendToChatDialog
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        stegoBlob={stegoBlob}
        mode={mode}
      />
    </>
  );
}