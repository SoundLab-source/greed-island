-- Greed Island match event emitter for IKEMEN GO v1.0.0.
--
-- Writes one JSON object per line (NDJSON) to the path given with
-- `-salty.events <path>`, flushing after every line:
--   match_start {p1, p2}
--   round_start {round}
--   round_end   {round, winnerSide (1, 2, or 0 for a draw), reason: "ko"|"time"}
--   match_end   {winnerSide, wins: [p1Wins, p2Wins]}
--
-- Without the flag it does nothing, so it is safe to leave installed in
-- external/mods/. Quick-VS mode exits before mods autoload, so the runner also
-- loads it through a generated config: [Common] Lua1 = require('external.mods.salty_events')
-- See docs/ikemen-notes.md §2. Functions used (all confirmed in v1.0.0 source):
-- getCommandLineValue, hook.add, roundNo, roundState, player, win, winKO,
-- life, name, matchOver, getWinnerTeam.

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
    emit('{"type":"round_start","round":' .. rn .. '}')
  end

  -- Report the round once win poses start: the result can no longer change.
  if roundOpen and rs >= 4 then
    roundOpen = false
    local winner = roundWinner()
    if winner > 0 then wins[winner] = wins[winner] + 1 end
    emit('{"type":"round_end","round":' .. currentRound .. ',"winnerSide":' .. winner .. ',"reason":"' .. roundReason(winner) .. '"}')
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
