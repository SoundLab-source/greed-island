-- Bot players: house-run accounts that bet on fights so the stream is never empty. They hold Salt like anyone
-- (same ledger, same rules), never sign in, and are left out of the crowd numbers, leaderboards and prizes.
ALTER TYPE "UserKind" ADD VALUE 'BOT';
