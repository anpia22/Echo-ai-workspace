# TURN setup (P1.1)

A TURN server relays call audio/video for people on strict firewalls or mobile networks.
Without one, Echo calls still work for most people (public STUN), but fail for some.

Set **one** of these in `.env.local` (and in your host's environment for production), then restart.

## Option A — Cloudflare Realtime TURN (credentials generated per request)
```
CLOUDFLARE_TURN_KEY_ID=...
CLOUDFLARE_TURN_API_TOKEN=...
```
Cloudflare dashboard > Realtime > TURN > create a TURN key. Copy the key id and the API token.

## Option B — Any provider with fixed credentials (Metered, Twilio, your own coturn)
```
TURN_URLS=turn:HOST:80,turn:HOST:443,turns:HOST:443?transport=tcp
TURN_USERNAME=...
TURN_CREDENTIAL=...
```
Copy the URLs, username and credential from the provider's dashboard.

## Check it
1. Sign in, open `http://localhost:3000/api/webrtc/ice` in the browser. `"relay": true` means a
   relay is configured; `false` means public STUN only (check the variable names, restart the server).
2. Prove the credentials work: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
   Add the TURN url, username and credential, press "Gather candidates". A line of type `relay` means it works.
3. Real test: join a call from a phone on mobile data (Wi-Fi off) and a laptop on Wi-Fi.

Never put these values in client code or commit them. `.env*` is git-ignored.
