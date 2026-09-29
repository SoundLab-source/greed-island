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
| **Crash: listing a screen capture's displays** | RUN | `GetInputPropertiesListPropertyItems` for a `screen_capture` source's `display_uuid` crashed OBS 32.2.2 (SIGSEGV in `strlen` inside obs-websocket 5.7.4). Never send it; get the display's UUID from macOS instead. |
| Change a source's settings | SOURCE, RUN | `SetInputSettings` `{inputName, inputSettings, overlay}`; `GetInputSettings` returns them. |

## Capturing IKEMEN

| Item | Status | Finding |
|---|---|---|
| Screen capture needs a display | RUN | macOS `screen_capture` with an empty `display_uuid` captures nothing (log: "init_screen_stream: Invalid target display ID: 0"). Setting `{type: 0, display_uuid: <main display UUID>}` works; the UUID comes from CoreGraphics (`CGDisplayCreateUUIDFromDisplayID(CGMainDisplayID())`, read through `osascript -l JavaScript`). `pnpm obs:setup` does this. |
| Screen capture only while on air | RUN | A `screen_capture` source only produces frames while its scene is showing; a screenshot of the Fight scene taken while Betting was on air had an empty capture. |
| Whole-screen capture of real fights | RUN | Works, but shows whatever is on the main screen. IKEMEN's window (1280x720, windowed) opens **behind** the app in front, because the runner launches it in the background, so on a Mac you're using, the capture shows your own windows. |
| Capturing only IKEMEN | OPEN | Window capture (`type: 1`, the window's CGWindowID) logged "Invalid target window ID" and application capture (`type: 2`, `com.github.ikemen-engine.ikemen-go`) showed nothing, though macOS lists the window (owner "I.K.E.M.E.N-Go"). Likely OBS's list of capturable windows doesn't include a game our server launches directly. Until solved: whole-screen capture on a machine where the game is the only window. |
| macOS permission | RUN | Screen Recording must be allowed for OBS (System Settings → Privacy & Security → Screen & System Audio Recording) and OBS restarted; the log then says "Permission for screen capture granted". macOS 27 also asks whether OBS may "bypass the system private window picker": the user answers that. |
| Browser source transparency | RUN | The fight bar's transparent page lets the screen capture show through underneath. |
| Browser sources rendering | RUN | Works after OBS was restarted. On the very first start, while OBS's first-run windows (permissions review, auto-configuration wizard) were open, no browser renderer process started and the overlay stayed blank even after closing them; restarting OBS fixed it. |
