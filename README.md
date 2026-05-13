# Real-Time Audio Spectrum Analyzer

A responsive browser-based audio spectrum analyzer for desktop and mobile.
It uses the Web Audio API to analyze microphone input in real time.

## Cloudflare Pages settings

- Framework preset: None
- Build command: leave empty
- Build output directory: `/`
- Production branch: `main`

Cloudflare Pages can deploy this project directly from the repository root.

## Local preview

Serve the folder from `localhost` so microphone access works in the browser:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080`.
