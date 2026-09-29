/** How a player is shown publicly: their leaderboard name, or a short anonymous tag. */
export function playerName(u: { id: string; displayName: string | null }): string {
  return u.displayName ?? `Anon-${u.id.slice(0, 6)}`;
}
