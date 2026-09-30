# Greed Island

An always-on stream of AI-vs-AI fights on the [IKEMEN GO](https://github.com/ikemen-engine/Ikemen-GO) engine, with free play-money betting (Salt), rating-based odds, Glicko-2 ratings and tiers.

**Status:** Phase 1 (Stream MVP) and Phase 2 (Ownership) are built: betting, odds and ratings, accounts, a character shop, upgrades, titles, owner rewards, exhibition challenges and tournaments with their own T-Salt balance. Phase 3 (community roster) is under way: staff roles, reviewed custom names, seasons and fighter submissions (staff-only for now) so far. Salt can never be bought, sold or cashed out.

- **Start here:** [ROADMAP.md](ROADMAP.md): the mission, what's done, what's next, and how to pick up the work
- Game design: [docs/DESIGN.md](docs/DESIGN.md)
- How it's built: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Setting it up: [docs/SETUP.md](docs/SETUP.md)
- Engine facts, with source references: [docs/ikemen-notes.md](docs/ikemen-notes.md); OBS facts: [docs/obs-notes.md](docs/obs-notes.md)
- Streaming: the overlay page and OBS setup are in [docs/SETUP.md](docs/SETUP.md) §5

On the project's Mac: double-click **Start Greed Island.command** (and **Stop Greed Island.command** to stop).

Quick start (needs Node 24, pnpm 10 and Docker; no IKEMEN needed):

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm demo
```

IKEMEN GO, its characters and stages are not included in this repo and have their own licenses.
