# OBS notes

Facts the stream code relies on, with where they come from. Same legend as `ikemen-notes.md`:
- **SOURCE**: confirmed in the official obs-websocket protocol document (`docs/generated/protocol.md` in github.com/obsproject/obs-websocket) or its source code (`src/Config.cpp`, `src/Config.h`), read 2026-09-29.
- **RUN**: confirmed with a real OBS (OBS 32.2.2 with obs-websocket 5.7.4 on macOS 27, 2026-09-29).
- **UNVERIFIED**: not confirmed yet.
- **OPEN**: a problem was seen and its cause isn't known yet.

The scene switcher is `packages/orchestrator/src/obs.ts`; its tests run against a stand-in server that follows the protocol document.

## obs-websocket 5 protocol

| Item | Status | Finding |
|---|---|---|
| Built into OBS | RUN | OBS 32.2.2 ships obs-websocket 5.7.4 (log: "you can haz websockets"). |
| Settings file | SOURCE, RUN | `plugin_config/obs-websocket/config.json` in OBS's settings folder (`~/Library/Application Support/obs-studio/` on macOS), keys `server_enabled`, `server_port`, `auth_required`, `server_password`, `alerts_enabled`, `first_load` (obs-websocket `src/Config.cpp`); read at startup. Defaults: server off, port 4455, password required (`src/Config.h`). Writing it before OBS's first start enabled the server with our password. |
| Default port | SOURCE | 4455 (`src/Config.h`). We read it from `GI_OBS_URL`. |
| Listening address | RUN | All interfaces (`*:4455`), so other machines on the network can reach it: keep the password on. |
| Subprotocol | SOURCE | `obswebsocket.json` (JSON over text frames); `obswebsocket.msgpack` also exists. We use JSON. |
| Handshake | SOURCE, RUN | Server sends Hello (`op` 0, `d: {obsWebSocketVersion, rpcVersion, authentication?: {challenge, salt}}`); client sends Identify (`op` 1, `d: {rpcVersion, authentication?, eventSubscriptions?}`); server replies Identified (`op` 2, `d: {negotiatedRpcVersion}`). Current `rpcVersion` is 1. |
| Authentication | SOURCE, RUN | base64(sha256(base64(sha256(password + salt)) + challenge)). A missing or wrong string closes the connection with code 4009 (AuthenticationFailed). 4010 is UnsupportedRpcVersion. |
| Events | SOURCE | `eventSubscriptions: 0` (EventSubscription::None) subscribes to nothing; we only send requests. |
| Requests | SOURCE | Request `op` 6 `d: {requestType, requestId, requestData?}`; RequestResponse `op` 7 `d: {requestType, requestId, requestStatus: {result, code, comment?}, responseData?}`. Success code 100; ResourceNotFound 600. |
| Switch scene | SOURCE, RUN | `SetCurrentProgramScene` with `requestData: {sceneName}` (or `sceneUuid`). With `pnpm dev` running fake fights, OBS switched Betting → Fight → Betting on every fight. |
| Scene setup | SOURCE, RUN | `pnpm obs:setup` uses GetVersion, GetInputKindList (macOS screen capture kind: `screen_capture`), GetInputDefaultSettings (`browser_source` has `url`, `width`, `height`), SetVideoSettings, GetSceneList, CreateScene, GetInputList, CreateInput, GetSceneItemId, SetSceneItemTransform, SetCurrentProgramScene; re-running changes nothing. |
| Reload a browser source | SOURCE, RUN | `PressInputPropertiesButton` with `propertyName: "refreshnocache"` (accepted by OBS 32.2.2). A browser source doesn't retry a failed page load by itself. |

## Capturing IKEMEN

| Item | Status | Finding |
|---|---|---|
| Window capture across fights | UNVERIFIED | IKEMEN runs as a new process for every fight, so a window capture has to find the new window each time. Display capture (the whole screen) avoids the question. Try both before a real stream. |
| macOS permission | UNVERIFIED | macOS asks the user to allow Screen Recording for OBS (System Settings → Privacy & Security). |
| Browser source transparency | UNVERIFIED | OBS browser sources render a transparent page background as transparent, which the fight bar relies on (`overlay.html?scene=fight`). |
| Browser sources rendering | OPEN | On the first run, while OBS's first-run dialogs (permissions review, auto-configuration wizard) were open and Screen Recording wasn't granted, no browser renderer process started and `GetSourceScreenshot` of the overlay scenes was blank. To re-check once those are closed. |
