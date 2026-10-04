# The Linux packages IKEMEN GO v1.0.0 (Ikemen_GO_Linux, x86-64) needs on a server with no screen:
# its libraries (from `ldd`), a virtual display (Xvfb), OpenGL in software (Mesa llvmpipe), a sound
# server with no speakers (PulseAudio, a null sink) and ffmpeg to capture both for a stream. Tried in Docker on 2026-10-03 (docs/DEPLOY.md
# "Linux server"); on a plain Debian/Ubuntu server, the same apt-get line does it.
#
#   docker build --platform linux/amd64 -t greed-island-linux deploy/linux
#   docker run --rm --platform linux/amd64 -v "$PWD/Ikemen_GO-v1.0.0-linux:/ikemen" greed-island-linux <command>
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      libgl1 libgl1-mesa-dri libglx-mesa0 libegl1 \
      libx11-6 libxext6 libxcursor1 libxinerama1 libxi6 libxfixes3 libxrandr2 libxss1 libxxf86vm1 \
      libdrm2 libgbm1 libwayland-client0 libwayland-cursor0 libwayland-egl1 libxkbcommon0 libdecor-0-0 \
      libgtk-3-0 libasound2 libpulse0 \
      xvfb xauth mesa-utils ffmpeg ca-certificates pulseaudio pulseaudio-utils \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --create-home stream
USER stream
WORKDIR /ikemen
