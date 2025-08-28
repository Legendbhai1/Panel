Komi Ai (frontend-only MVP)
=================================

Features implemented:

- Login with guest option
- Conversation history per user (localStorage)
- Voice recognition (Web Speech API)
- Text-to-speech for replies
- Feedback (👍/👎) and Copy buttons per message
- Rotating recommendations at the start of each conversation
- Uses your OpenRouter API key directly from the browser for speed

Run locally
----------

- Open `public/index.html` directly in a Chromium-based browser, or
- Serve the `public/` folder with any static server, for example:

```
python3 -m http.server -d public 5173
# open http://localhost:5173
```

Notes
-----

- Data is saved locally in your browser (guest included) — no backend needed.
- Putting API keys in frontend is insecure; for production, proxy via your server.
- Voice features require a browser that supports the Web Speech API.

