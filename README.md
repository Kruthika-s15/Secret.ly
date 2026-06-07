# SonicVeil

Dual-mode steganography platform — hide encrypted messages in images and audio, with forensic detection. Final-year cybersecurity project demo.

## Stack

- React 18 + Vite 5
- Tailwind CSS 3 + shadcn-style UI
- Web Crypto API (Fernet-style AES-128-CBC + HMAC)
- Client-side only — no backend

## Setup

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (typically `http://localhost:5173`).

## Build

```bash
npm run build
npm run preview
```

## Tabs

1. **Image Hide** — ROI-guided LSB + encryption
2. **Image Reveal** — extract and decrypt
3. **Audio Hide** — LSB in PCM (download WAV)
4. **Audio Reveal** — extract from stego audio
5. **Detector** — statistical steganalysis + live attack demo
