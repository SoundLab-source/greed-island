# OBS notes

Facts the stream code relies on, with where they come from. Same legend as `ikemen-notes.md`:
- **SOURCE**: confirmed in the official obs-websocket protocol document (`docs/generated/protocol.md` in github.com/obsproject/obs-websocket) or its source code (`src/Config.cpp`, `src/Config.h`), read 2026-09-29.
- **RUN**: confirmed with a real OBS (OBS 32.2.2 with obs-websocket 5.7.4 on macOS 27, 2026-09-29; on Linux, OBS 30.2.3 with obs-websocket 5.5.2 from ppa:obsproject/obs-studio on Ubuntu 22.04, in Docker under x86-64 emulation, 2026-10-03).
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
| Virtual Camera | SOURCE, RUN | `GetVirtualCamStatus` (`outputActive`) and `StartVirtualCam` (protocol.md, added in 5.0.0). OBS 32.2.2 accepted `StartVirtualCam` (2026-10-06); on macOS the camera is a system extension (`com.obsproject.obs-studio.mac-camera-extension`) that stays "activated waiting for user" until the user switches it on in System Settings → General → Login Items & Extensions → Camera Extensions. Used by the local preview (`GI_LOCAL_VIDEO`, packages/orchestrator/src/local-video.ts). |
| Crop a scene item | SOURCE | `SetSceneItemTransform` takes `cropLeft`, `cropRight`, `cropTop`, `cropBottom` (pixels of the source) and `cropToBounds`; `GetSceneItemTransform` returns them with `sourceWidth` and `sourceHeight` (obs-websocket `src/requesthandler/RequestHandler_SceneItems.cpp`, `src/utils/Obs_ObjectHelper.cpp`). |

## Capturing IKEMEN

| Item | Status | Finding |
|---|---|---|
| Screen capture needs a display | RUN | macOS `screen_capture` with an empty `display_uuid` captures nothing (log: "init_screen_stream: Invalid target display ID: 0"). Setting `{type: 0, display_uuid: <main display UUID>}` works; the UUID comes from CoreGraphics (`CGDisplayCreateUUIDFromDisplayID(CGMainDisplayID())`, read through `osascript -l JavaScript`). `pnpm obs:setup` does this. |
| Screen capture only while on air | RUN | A `screen_capture` source only produces frames while its scene is showing; a screenshot of the Fight scene taken while Betting was on air had an empty capture. |
| Whole-screen capture of real fights | RUN | Works, but shows whatever is on the main screen. IKEMEN's window (1280x720, windowed) opens **behind** the app in front, because the runner launches it in the background, so on a Mac you're using, the capture shows your own windows. |
| Where IKEMEN's window is | RUN | CoreGraphics' window list (`CGWindowListCopyWindowInfo`, through `osascript -l JavaScript`) lists it with owner "I.K.E.M.E.N-Go" and its bounds in points from the main screen's top-left, title bar included: 1280 x 748 for the 1280 x 720 game (2026-10-06). The local preview crops the whole-screen capture to it (`gameWindow`, `gameCrop` in packages/engine/src/ikemen/window.ts; the capture is in pixels, twice the points on a Retina screen). |
| Capturing only IKEMEN | SOURCE, RUN | Works if the capture source is **created** for the window: OBS's macOS capture builds its list of capturable windows when a source is created (and in its Properties box), not when its settings change (`sck_video_capture_create` and `content_settings_changed`; `sck_video_capture_update` doesn't rebuild it: obs-studio `plugins/mac-capture/mac-sck-video-capture.m`, `mac-sck-common.m`). Setting a new fight's window number with `SetInputSettings` logged "init_screen_stream: Invalid target window ID: 177389" and captured nothing (size 0); `RemoveInput` (finishes a moment later: wait until `GetInputList` no longer lists it), then `CreateInput` with `{type: 1, window: <CGWindowID>}` captured the fight's window, title bar included (2560 x 1496 for a 1280 x 748 point window), in a real fight (2026-10-06). The local preview does this at every fight (packages/orchestrator/src/local-video.ts). Earlier tries: window capture "Invalid target window ID", application capture (`type: 2`) showed nothing. |
| Streaming only IKEMEN, game behind other apps | SOURCE, RUN | The same window capture now runs for the stream too, not only the local preview (`game-capture.ts`, on whenever `GI_OBS_URL` is set; `GI_OBS_FOLLOW_GAME=false` turns it off). Real run 2026-10-09 (OBS 32.2.2, `ENGINE_MODE=live GI_GAME_TO_FRONT=false GI_LOCAL_VIDEO=false`): with the Fight scene's capture reset to the whole screen first, the server hid it at start (`GetSceneItemEnabled` false); each of two fights' windows (new window numbers) was then filmed at 2560 x 1496 with the 56-pixel title bar cropped, shown (`enabled` true), while macOS reported another app (OBS) in front of the game. `GetSceneItemEnabled`/`SetSceneItemEnabled` (sceneName, sceneItemId, sceneItemEnabled) and `GetSourceScreenshot` (sourceName, imageFormat, imageWidth, imageHeight → imageData) from protocol.md, added in 5.0.0. Without `GI_GAME_TO_FRONT` (and outside the local preview) a window capture that shows nothing is hidden rather than replaced by the whole screen (unit-tested; not seen in a real run). |
| macOS permission | RUN | Screen Recording must be allowed for OBS (System Settings → Privacy & Security → Screen & System Audio Recording) and OBS restarted; the log then says "Permission for screen capture granted". macOS 27 also asks whether OBS may "bypass the system private window picker": the user answers that. |
| Browser source transparency | RUN | The fight bar's transparent page lets the screen capture show through underneath. |
| Browser sources rendering | RUN | Works after OBS was restarted. On the very first start, while OBS's first-run windows (permissions review, auto-configuration wizard) were open, no browser renderer process started and the overlay stayed blank even after closing them; restarting OBS fixed it. |

## Linux (a server with no screen)

| Item | Status | Finding |
|---|---|---|
| Which OBS | RUN | The OBS project's Ubuntu build (`ppa:obsproject/obs-studio`, OBS 30.2.3) ships `obs-browser.so` (browser sources), `obs-websocket.so` and `linux-capture.so`; it ran on Xvfb with Mesa's software OpenGL. `deploy/linux/Dockerfile.obs`. |
| WebSocket settings | RUN | `~/.config/obs-studio/plugin_config/obs-websocket/config.json`, same keys as on macOS, written before OBS starts; obs-websocket 5.5.2 logged "Some configurations have been migrated from old config" and took the password. |
| First-run wizard | RUN | Without `~/.config/obs-studio/global.ini` it opens the auto-configuration wizard (a window, not blocking the WebSocket server). `[General] FirstRun=true` there skips it (`deploy/linux/start-screens.sh`). |
| Screen capture | RUN | The kind is `xshm_input` (`pnpm obs:setup` already looked for it). It captures a whole X screen, so on the game's screen OBS's own window and dialogs were in the picture; OBS on a second Xvfb screen and `{advanced: true, server: ":99"}` captures only the game's, and `show_cursor: false` hides the cursor (`linuxDisplayCaptureSettings`). |
| Browser sources | RUN | The overlay loaded from the server and drew the live betting screen and the fight bar. |
| Recording | RUN | `SetRecordDirectory`, `StartRecord`, `StopRecord`: 1920x1080 H.264 60 fps with AAC sound; `GetStats` showed 0 skipped output frames, 480 of 3,970 skipped render frames (36 fps) under emulation. |
| Streaming to Twitch from Linux | UNVERIFIED | Not tried yet (no stream key). |

