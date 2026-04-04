# Genshin Character Comparer

Side-by-side stat comparison for two Genshin Impact accounts using the [Enka.Network](https://enka.network) API.

## Features

- Load up to 8 showcase characters per UID
- Compare any two characters side by side
- Weapon info (name, level, refinement, stats)
- Stat differences shown inline (green = left player higher, red = right player higher)
- Key stats highlighted per character based on their ascension stat and element

## Setup

Node.js is required for the local proxy (Enka.Network does not send CORS headers).

**1. Start the proxy**
```bash
node proxy.js
```

**2. Open `index.html` in your browser**

The header will show **● Proxy connected** when everything is ready.

## Project structure

```
├── index.html        # markup
├── css/
│   └── style.css     # styles
├── js/
│   └── app.js        # all logic
├── proxy.js          # local CORS proxy for Enka.Network (port 3001)
└── .gitignore
```

## Data sources

| Source | Used for |
|---|---|
| [Enka.Network API](https://enka.network/api/uid/{uid}) | Live character & stat data |
| [EnkaNetwork/API-docs](https://github.com/EnkaNetwork/API-docs) | Character names, icons, locale strings |
| [gi.yatta.moe](https://gi.yatta.moe) | Fallback names/icons for newest characters |
