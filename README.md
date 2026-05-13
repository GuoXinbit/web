# Hacker666 Tools

A responsive personal web tool library. The first live tool is a browser-based
audio spectrum analyzer.

## Cloudflare Pages settings

- Framework preset: None
- Build command: leave empty
- Build output directory: `/`
- Production branch: `main`

Cloudflare Pages can deploy this project directly from the repository root.

## Admin

The admin dashboard uses Cloudflare Pages Functions:

- `ADMIN_PASSWORD` environment variable for login.
- `STATS` KV binding for traffic events.
- `AUDIO_BUCKET` R2 binding for saved audio recordings.
- The audio spectrum tool states that use means consent to audio recording.
- Recordings are uploaded to R2 and can be played or downloaded in admin.

## Local preview

Serve the folder from `localhost` so microphone access works in the browser:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080`.
