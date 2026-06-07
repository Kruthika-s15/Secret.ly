import { useState } from 'react';
import { toast } from 'sonner';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import GlowCard from '../layout/GlowCard.jsx';
import ShinyButton from '../shared/ShinyButton.jsx';
import MetricCard from '../shared/MetricCard.jsx';
import FileDrop from '../shared/FileDrop.jsx';
import { Progress } from '../ui/progress.jsx';
import { detectImageStego } from '@/lib/stego/imageAnalysis.js';
import { detectAudioStego } from '@/lib/stego/audioAnalysis.js';
import { embedInImage } from '@/lib/stego/imageEmbed.js';
import { encryptMessage } from '@/lib/crypto.js';
import { decodeAudioFile } from '@/lib/stego/audioEmbed.js';
import { fileToImageData } from '@/lib/utils.js';

const TEST_PAYLOAD = 'SonicVeil forensic test payload';

export default function DetectorTab() {
  const [file, setFile] = useState(null);
  const [mediaType, setMediaType] = useState(null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);

  const [attackFile, setAttackFile] = useState(null);
  const [attackPreview, setAttackPreview] = useState(null);
  const [beforeScore, setBeforeScore] = useState(null);
  const [afterScore, setAfterScore] = useState(null);
  const [attackBusy, setAttackBusy] = useState(false);

  const runDetection = async (f) => {
    setBusy(true);
    try {
      if (f.type.startsWith('image/')) {
        const img = await fileToImageData(f);
        setMediaType('image');
        setReport(detectImageStego(img));
      } else if (f.type.startsWith('audio/')) {
        const audio = await decodeAudioFile(f);
        setMediaType('audio');
        setReport(detectAudioStego(audio));
      } else {
        const ext = f.name.split('.').pop()?.toLowerCase();
        if (['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext)) {
          const img = await fileToImageData(f);
          setMediaType('image');
          setReport(detectImageStego(img));
        } else {
          const audio = await decodeAudioFile(f);
          setMediaType('audio');
          setReport(detectAudioStego(audio));
        }
      }
    } catch (e) {
      toast.error(e.message || 'Analysis failed');
    } finally {
      setBusy(false);
    }
  };

  const handleFile = (f) => {
    setFile(f);
    setReport(null);
    runDetection(f);
  };

  const handleAttack = async () => {
    if (!attackFile) {
      toast.error('Upload a clean image first');
      return;
    }
    setAttackBusy(true);
    try {
      const img = await fileToImageData(attackFile);
      const before = detectImageStego(img);
      setBeforeScore(before.suspicionScore);

      const payload = await encryptMessage(TEST_PAYLOAD, 'demo-password');
      const { stego } = embedInImage(img, payload);
      const after = detectImageStego(stego);
      setAfterScore(after.suspicionScore);
      setReport(after);
      setMediaType('image');
      toast.success('Attack demo complete — suspicion elevated');
    } catch (e) {
      toast.error(e.message || 'Attack demo failed');
    } finally {
      setAttackBusy(false);
    }
  };

  const chartData = report?.histogram || [];
  const scoreColor =
    (report?.suspicionScore ?? 0) >= 80
      ? 'hsl(0 0% 100%)'
      : (report?.suspicionScore ?? 0) >= 50
        ? 'hsl(0 0% 70%)'
        : 'hsl(0 0% 40%)';

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <GlowCard title="Forensic scan">
          <FileDrop
            accept="image/*,audio/*"
            label="Upload image or audio"
            sublabel="Statistical steganalysis — client-side only"
            file={file}
            onFile={handleFile}
            onClear={() => {
              setFile(null);
              setReport(null);
            }}
          />
          {busy && <p className="mt-2 text-xs text-muted-foreground">Analyzing…</p>}
        </GlowCard>

        <GlowCard title="Suspicion score">
          {report ? (
            <div className="space-y-4 animate-fade-in-up">
              <MetricCard
                label="Suspicion"
                value={report.suspicionScore}
                unit="/ 100"
                big
                sub={
                  report.suspicionScore > 60
                    ? report.technique
                    : report.suspicionScore > 35
                      ? 'Elevated anomalies'
                      : 'Likely clean'
                }
              />
              <Progress value={report.suspicionScore} />
              <p className="text-xs text-muted-foreground">
                0 = clean · 50 = suspicious · 80+ = likely stego ({mediaType})
              </p>
              <div className="space-y-2">
                {report.tests.map((t) => (
                  <div
                    key={t.name}
                    className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-xs"
                  >
                    <div>
                      <p className="font-medium text-foreground">{t.name}</p>
                      <p className="text-muted-foreground">{t.detail}</p>
                    </div>
                    <span className="font-mono text-lg">{t.score}</span>
                  </div>
                ))}
              </div>
              {chartData.length > 0 && (
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 15%)" />
                      <XAxis dataKey="bin" tick={{ fill: 'hsl(0 0% 50%)', fontSize: 9 }} />
                      <YAxis tick={{ fill: 'hsl(0 0% 50%)', fontSize: 9 }} />
                      <Tooltip
                        contentStyle={{
                          background: 'hsl(0 0% 5%)',
                          border: '1px solid hsl(0 0% 20%)',
                        }}
                      />
                      <Bar dataKey={chartData[0].count !== undefined ? 'count' : 'energy'} fill={scoreColor}>
                        {chartData.map((_, i) => (
                          <Cell key={i} fill={`hsl(0 0% ${40 + (i % 5) * 12}%)`} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Upload a file to run forensic detection.</p>
          )}
        </GlowCard>
      </div>

      <GlowCard title="Live attack demo">
        <p className="mb-4 text-xs text-muted-foreground">
          Inject a test payload into a clean image, then compare suspicion scores before and after.
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          <FileDrop
            accept="image/png,image/jpeg,image/webp"
            label="Clean image"
            sublabel="For attack injection only"
            file={attackFile}
            onFile={(f) => {
              setAttackFile(f);
              setAttackPreview(URL.createObjectURL(f));
              setBeforeScore(null);
              setAfterScore(null);
            }}
            onClear={() => {
              setAttackFile(null);
              setAttackPreview(null);
              setBeforeScore(null);
              setAfterScore(null);
            }}
            preview={
              attackPreview && (
                <img src={attackPreview} alt="" className="max-h-32 rounded-lg border border-border" />
              )
            }
          />
          <div className="flex flex-col justify-center gap-4">
            <ShinyButton disabled={attackBusy || !attackFile} onClick={handleAttack}>
              Inject Test Payload
            </ShinyButton>
            {(beforeScore !== null || afterScore !== null) && (
              <div className="grid grid-cols-2 gap-3">
                <MetricCard label="Before" value={beforeScore ?? '—'} unit="/ 100" />
                <MetricCard label="After" value={afterScore ?? '—'} unit="/ 100" />
              </div>
            )}
            {beforeScore !== null && afterScore !== null && (
              <p className="text-center text-sm text-primary">
                Δ +{afterScore - beforeScore} suspicion points after LSB embed
              </p>
            )}
          </div>
        </div>
      </GlowCard>
    </div>
  );
}
