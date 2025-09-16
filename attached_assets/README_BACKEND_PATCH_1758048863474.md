# Storylister Backend Patch (UI-preserving)

This package gives you a **backend-only** upgrade that:
- injects a fixed `injected.js` (no more `.options` syntax error)
- saves viewer chunks to **IndexedDB** with 24h/last-3-stories retention
- exposes a small `window.StorylisterCore` API (optional)
- does **not** touch your existing UI/DOM

## Files

- `content-backend.js` — loads first; injects page interceptor; persists data; no UI changes.
- `injected.js` — page-world script that intercepts IG fetch/XHR and relays viewer chunks.
- `manifest.append.json` — example of how to load the backend before your current `content.js`.

## How to integrate

1) Keep your current files as-is (`content.js`, `popup.*`, styles, etc.).  
2) Add the two new files to your extension root.  
3) Update your `manifest.json` content scripts so **content-backend.js** loads before **content.js**:

```jsonc
{
  "content_scripts": [{
    "matches": ["https://www.instagram.com/*"],
    "run_at": "document_start",
    "js": ["content-backend.js", "content.js"]
  }],
  "web_accessible_resources": [{
    "resources": ["injected.js"],
    "matches": ["https://www.instagram.com/*"]
  }]
}
```

> Note: Order matters — `content-backend.js` must come before `content.js` so the interceptor is injected early.

## Why IndexedDB here?

- Larger capacity than localStorage (tens of MBs are typical).  
- We store **compact viewer records** (id, username, displayName, profilePic URL, flags, timestamps).  
- Auto-prunes per **24h TTL** and keeps only **last 3 stories** by default (tweak in `CONFIG`).

## Debugging checklist

- Open DevTools Console; run `window.StorylisterCore?.__debug()` to inspect backend state.  
- Confirm you see `STORYLISTER_VIEWERS_CHUNK` messages in the Network/Console while the "Seen by" dialog loads.  
- Your existing UI should continue to render without modification.

