#!/bin/zsh
# Back up Greed Island (docs/DEPLOY.md): a compressed SQL dump of the database in
# backups/ (or GI_BACKUP_DIR), keeping the newest GI_BACKUP_KEEP (default 14), and
# a copy of the images the database refers to (submissions/ and looks/) in
# <backup folder>/images/. pnpm service:install runs it every night; pnpm db:backup runs it now.
# Restore: gunzip -c backups/<file>.sql.gz | docker compose exec -T postgres psql -U greed -d greed_island
set -eu
cd "${0:A:h}/.." || exit 1
export PATH="$HOME/.local/node/bin:$HOME/.docker/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
# A setting from the environment, else from .env (the nightly job doesn't load it), else the default.
setting() {
  local v="${(P)1:-}"
  if [[ -z "$v" && -f .env ]]; then
    v=$(grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/") || v=""
  fi
  print -r -- "${v:-$2}"
}
dir=$(setting GI_BACKUP_DIR backups)
keep=$(setting GI_BACKUP_KEEP 14)
mkdir -p "$dir"
file="$dir/greed_island-$(date '+%Y-%m-%d-%H%M').sql.gz"
tmp="$file.partial"
docker compose exec -T postgres pg_dump -U greed -d greed_island --no-owner | gzip -9 > "$tmp"
# An empty or tiny dump means something went wrong: keep the old backups, fail loudly.
if [[ $(wc -c < "$tmp") -lt 1000 ]]; then
  rm -f "$tmp"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] backup failed: the dump was empty" >&2
  exit 1
fi
mv "$tmp" "$file"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] backed up to $file ($(du -h "$file" | cut -f1))"
# Keep the newest $keep backups.
ls -1t "$dir"/greed_island-*.sql.gz 2>/dev/null | tail -n +$((keep + 1)) | while read -r old; do rm -f "$old"; done
# The images: each file is named by its contents and never changes, so only new ones are copied.
for name in submissions looks; do
  src=$(setting "GI_${(U)name}_DIR" "$name")
  [[ -d "$src" ]] || continue
  mkdir -p "$dir/images/$name"
  rsync -a "$src/" "$dir/images/$name/"
done
echo "[$(date '+%Y-%m-%d %H:%M:%S')] images copied to $dir/images ($(du -sh "$dir/images" 2>/dev/null | cut -f1 || echo none))"
