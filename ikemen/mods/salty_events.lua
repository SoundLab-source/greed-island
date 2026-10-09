-- Greed Island match event emitter for IKEMEN GO v1.0.0.
--
-- Writes one JSON object per line (NDJSON) to the path given with
-- `-salty.events <path>`, flushing after every line:
--   match_start {p1, p2}
--   round_start {round}
--   round_end   {round, winnerSide (1, 2, or 0 for a draw), reason: "ko"|"time",
--                life: [p1, p2] life left and low: [p1, p2] the lowest it fell this round (per mille of full life),
--                firstHit (the side that hit first, 0 if nobody was hit), ticks (fighting time of the round),
--                signatures: [p1, p2] signature moves that landed (state 1400: our fighters' signature moves),
--                signatureKo (the side that knocked the other out during its signature move, else 0)}
--   match_end   {winnerSide, wins: [p1Wins, p2Wins]}
--
-- Without the flag it does nothing, so it is safe to leave installed in
-- external/mods/. Quick-VS mode exits before mods autoload, so the runner also
-- loads it through a generated config: [Common] Lua1 = require('external.mods.salty_events')
-- See docs/ikemen-notes.md §2. Functions used (all confirmed in v1.0.0 source):
-- getCommandLineValue, hook.add, roundNo, roundState, player, win, winKO,
-- life, lifeMax, name, matchOver, getWinnerTeam, stateNo, moveHit.

local M = {}

local path = getCommandLineValue('-salty.events')
if path == nil or path == '' or path == 'true' then
  return M
end
if salty_events_active then
  return M
end
salty_events_active = true

local out = io.open(path, 'a')
if out == nil then
  print('salty_events: cannot open ' .. path)
  return M
end

local function jsonString(s)
  s = tostring(s or '')
  s = s:gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('[%c]', function(c)
    return string.format('\\u%04x', string.byte(c))
  end)
  return '"' .. s .. '"'
end

local function emit(line)
  out:write(line .. '\n')
  out:flush()
end

-- roundState(): 0 pre-intro, 1 intro, 2 fight, 3 round decided, 4 win poses.
local started = false
local currentRound = 0
local roundOpen = false
local ended = false
local wins = {0, 0}
-- This round so far: life (per mille), the lowest it fell, who hit first, fighting ticks.
local low = {1000, 1000}
local firstHit = 0
local roundTicks = 0
-- Signature moves (state 1400 in our fighters): landed this round, counted once per use, and a KO with one.
local SIGNATURE = 1400
local signatures = {0, 0}
local counted = {false, false}
local signatureKo = 0

local function lifeOf(n)
  if not player(n) then return 1000 end
  local max = lifeMax()
  if max == nil or max <= 0 then return 1000 end
  local v = math.floor(life() * 1000 / max + 0.5)
  if v < 0 then v = 0 end
  if v > 1000 then v = 1000 end
  return v
end

local function sideWon(n)
  return player(n) and win()
end

local function roundWinner()
  if sideWon(1) then return 1 end
  if sideWon(2) then return 2 end
  return 0
end

local function roundReason(winner)
  if winner > 0 then
    player(winner)
    if winKO() then return 'ko' end
    return 'time'
  end
  -- Draw: double KO if both are down, otherwise a time-out with equal life.
  local down1 = player(1) and life() <= 0
  local down2 = player(2) and life() <= 0
  if down1 and down2 then return 'ko' end
  return 'time'
end

local function tick()
  if ended then return end
  local rs = roundState()
  local rn = roundNo()

  if not started then
    if not (player(1) and player(2)) then return end
    local p1 = (player(1) and name()) or ''
    local p2 = (player(2) and name()) or ''
    emit('{"type":"match_start","p1":' .. jsonString(p1) .. ',"p2":' .. jsonString(p2) .. '}')
    started = true
  end

  if rs == 2 and rn > currentRound then
    currentRound = rn
    roundOpen = true
    low = {1000, 1000}
    firstHit = 0
    roundTicks = 0
    signatures = {0, 0}
    counted = {false, false}
    signatureKo = 0
    emit('{"type":"round_start","round":' .. rn .. '}')
  end

  -- While the round is on: the lowest life each side falls to, and who drew blood first.
  if roundOpen and rs == 2 then
    roundTicks = roundTicks + 1
    local l1, l2 = lifeOf(1), lifeOf(2)
    if firstHit == 0 then
      if l2 < 1000 and l1 >= 1000 then firstHit = 1 elseif l1 < 1000 and l2 >= 1000 then firstHit = 2 end
    end
    if l1 < low[1] then low[1] = l1 end
    if l2 < low[2] then low[2] = l2 end
    for n = 1, 2 do
      if player(n) and stateNo() == SIGNATURE then
        if not counted[n] and moveHit() > 0 then
          signatures[n] = signatures[n] + 1
          counted[n] = true
        end
      else
        counted[n] = false
      end
    end
  end
  -- The tick a side goes down (the round may already be decided): was the other in its signature move?
  if roundOpen and rs >= 2 and rs < 4 and signatureKo == 0 then
    local l1, l2 = lifeOf(1), lifeOf(2)
    if l2 <= 0 and player(1) and stateNo() == SIGNATURE then signatureKo = 1
    elseif l1 <= 0 and player(2) and stateNo() == SIGNATURE then signatureKo = 2 end
  end

  -- Report the round once win poses start: the result can no longer change.
  if roundOpen and rs >= 4 then
    roundOpen = false
    local winner = roundWinner()
    if winner > 0 then wins[winner] = wins[winner] + 1 end
    local reason = roundReason(winner)
    local l1, l2 = lifeOf(1), lifeOf(2)
    if l1 < low[1] then low[1] = l1 end
    if l2 < low[2] then low[2] = l2 end
    emit('{"type":"round_end","round":' .. currentRound .. ',"winnerSide":' .. winner .. ',"reason":"' .. reason .. '"'
      .. ',"life":[' .. l1 .. ',' .. l2 .. '],"low":[' .. low[1] .. ',' .. low[2] .. '],"firstHit":' .. firstHit .. ',"ticks":' .. roundTicks
      .. ',"signatures":[' .. signatures[1] .. ',' .. signatures[2] .. '],"signatureKo":' .. signatureKo .. '}')
    if matchOver() then
      local w = getWinnerTeam()
      if w ~= 1 and w ~= 2 then w = 0 end
      emit('{"type":"match_end","winnerSide":' .. w .. ',"wins":[' .. wins[1] .. ',' .. wins[2] .. ']}')
      ended = true
      out:close()
    end
  end
end

hook.add('loop', 'salty_events', tick)

return M
