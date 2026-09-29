# OBS notes

Facts the stream code relies on, with where they come from. Same legend as `ikemen-notes.md`:
- **SOURCE**: confirmed in the official obs-websocket protocol document (`docs/generated/protocol.md` in github.com/obsproject/obs-websocket, read 2026-09-29).
- **RUN**: confirmed with a real OBS.
- **UNVERIFIED**: not confirmed yet.

The scene switcher is `packages/orchestrator/src/obs.ts`; its tests run against a stand-in server that follows the protocol document.

## obs-websocket 5 protocol

| Item | Status | Finding |
|---|---|---|
| Built into OBS | UNVERIFIED | obs-websocket 5 ships with OBS 28 and later (Tools → WebSocket Server Settings). |
| Default port | UNVERIFIED | The protocol document doesn't state it; OBS's settings dialog shows it (commonly 4455). We read it from `GI_OBS_URL`. |
| Subprotocol | SOURCE | `obswebsocket.json` (JSON over text frames); `obswebsocket.msgpack` also exists. We use JSON. |
| Handshake | SOURCE | Server sends Hello (`op` 0, `d: {obsWebSocketVersion, rpcVersion, authentication?: {challenge, salt}}`); client sends Identify (`op` 1, `d: {rpcVersion, authentication?, eventSubscriptions?}`); server replies Identified (`op` 2, `d: {negotiatedRpcVersion}`). Current `rpcVersion` is 1. |
| Authentication | SOURCE | base64(sha256(base64(sha256(password + salt)) + challenge)). A missing or wrong string closes the connection with code 4009 (AuthenticationFailed). 4010 is UnsupportedRpcVersion. |
| Events | SOURCE | `eventSubscriptions: 0` (EventSubscription::None) subscribes to nothing; we only send requests. |
| Requests | SOURCE | Request `op` 6 `d: {requestType, requestId, requestData?}`; RequestResponse `op` 7 `d: {requestType, requestId, requestStatus: {result, code, comment?}, responseData?}`. Success code 100; ResourceNotFound 600. |
| Switch scene | SOURCE | `SetCurrentProgramScene` with `requestData: {sceneName}` (or `sceneUuid`). |

## Capturing IKEMEN

| Item | Status | Finding |
|---|---|---|
| Window capture across fights | UNVERIFIED | IKEMEN runs as a new process for every fight, so a window capture has to find the new window each time. Display capture (the whole screen) avoids the question. Try both before a real stream. |
| macOS permission | UNVERIFIED | macOS asks the user to allow Screen Recording for OBS (System Settings → Privacy & Security). |
| Browser source transparency | UNVERIFIED | OBS browser sources render a transparent page background as transparent, which the fight bar relies on (`overlay.html?scene=fight`). |
