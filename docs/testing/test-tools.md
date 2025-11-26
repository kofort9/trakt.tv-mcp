# MCP Tool Testing Guide

## Prerequisites
1. Open MCP Inspector: http://localhost:6274/?MCP_PROXY_AUTH_TOKEN=a1f9820eeb447bf0882f9d3e849a603b8a18802690a49cd2c4e0bcd207e23958
2. Ensure server is running and authenticated with Trakt.tv
3. Test each tool sequentially using the JSON inputs below

---

## Test 1: search_episode

### Test 1.1: Breaking Bad S1E1 (Happy Path)
```json
{
  "showName": "Breaking Bad",
  "season": 1,
  "episode": 1
}
```
**Expected:** Episode with title "Pilot"

---

### Test 1.2: The Office S2E5
```json
{
  "showName": "The Office",
  "season": 2,
  "episode": 5
}
```
**Expected:** Episode metadata (should find US version)

---

### Test 1.3: Season 0 (Specials)
```json
{
  "showName": "Breaking Bad",
  "season": 0,
  "episode": 1
}
```
**Expected:** Special episode or appropriate error

---

### Test 1.4: Invalid Show Name
```json
{
  "showName": "ThisShowDoesNotExist12345",
  "season": 1,
  "episode": 1
}
```
**Expected:** NOT_FOUND error with helpful message

---

### Test 1.5: Invalid Episode Number
```json
{
  "showName": "Breaking Bad",
  "season": 1,
  "episode": 999
}
```
**Expected:** NOT_FOUND error

---

### Test 1.6: Negative Season
```json
{
  "showName": "Breaking Bad",
  "season": -1,
  "episode": 1
}
```
**Expected:** VALIDATION_ERROR

---

## Test 2: bulk_log

### Test 2.1: Episode Range "1-5"
```json
{
  "type": "episodes",
  "showName": "Breaking Bad",
  "season": 1,
  "episodes": "1-5",
  "watchedAt": "yesterday"
}
```
**Expected:** 5 episodes added to history

---

### Test 2.2: Complex Range "1-3,5,7-9"
```json
{
  "type": "episodes",
  "showName": "The Office",
  "season": 2,
  "episodes": "1-3,5,7-9",
  "watchedAt": "last week"
}
```
**Expected:** 7 episodes added (1,2,3,5,7,8,9)

---

### Test 2.3: Single Episode
```json
{
  "type": "episodes",
  "showName": "Breaking Bad",
  "season": 1,
  "episodes": "7",
  "watchedAt": "today"
}
```
**Expected:** 1 episode added

---

### Test 2.4: Multiple Movies
```json
{
  "type": "movies",
  "movieNames": ["Inception", "Interstellar"],
  "watchedAt": "yesterday"
}
```
**Expected:** 2 movies added

---

### Test 2.5: Invalid Range
```json
{
  "type": "episodes",
  "showName": "Breaking Bad",
  "season": 1,
  "episodes": "abc-xyz"
}
```
**Expected:** VALIDATION_ERROR

---

### Test 2.6: Missing Fields
```json
{
  "type": "episodes",
  "showName": "Breaking Bad"
}
```
**Expected:** VALIDATION_ERROR for missing season/episodes

---

## Test 3: get_history

### Test 3.1: Last 10 Items
```json
{
  "limit": 10
}
```
**Expected:** Up to 10 recent items

---

### Test 3.2: Shows Only
```json
{
  "type": "shows",
  "limit": 10
}
```
**Expected:** Only TV episodes

---

### Test 3.3: Movies Only
```json
{
  "type": "movies",
  "limit": 10
}
```
**Expected:** Only movies

---

### Test 3.4: Date Range
```json
{
  "startDate": "last week",
  "endDate": "today"
}
```
**Expected:** Items from last week

---

### Test 3.5: Empty Range
```json
{
  "startDate": "2020-01-01",
  "endDate": "2020-01-02"
}
```
**Expected:** Empty array

---

## Test 4: get_upcoming

### Test 4.1: Default (7 days)
```json
{}
```
**Expected:** Upcoming episodes for next 7 days

---

### Test 4.2: 30 Days
```json
{
  "days": 30
}
```
**Expected:** Next 30 days of episodes

---

### Test 4.3: 1 Day
```json
{
  "days": 1
}
```
**Expected:** Today's episodes

---

### Test 4.4: Invalid - Too Low
```json
{
  "days": 0
}
```
**Expected:** VALIDATION_ERROR

---

### Test 4.5: Invalid - Too High
```json
{
  "days": 31
}
```
**Expected:** VALIDATION_ERROR

---

## Test 5: follow_show & unfollow_show

### Test 5.1: Follow Show
```json
{
  "showName": "Stranger Things"
}
```
**Expected:** Show added to watchlist

---

### Test 5.2: Follow Same Show Again
```json
{
  "showName": "Stranger Things"
}
```
**Expected:** Should handle gracefully

---

### Test 5.3: Unfollow Show
```json
{
  "showName": "Stranger Things"
}
```
**Expected:** Show removed from watchlist

---

### Test 5.4: Unfollow Again
```json
{
  "showName": "Stranger Things"
}
```
**Expected:** Should handle gracefully

---

### Test 5.5: Follow Non-Existent
```json
{
  "showName": "ThisShowDoesNotExist12345"
}
```
**Expected:** NOT_FOUND error

---

## Integration Tests

### Int 1: Bulk Log then Get History
1. Log: `bulk_log` with Breaking Bad S1 episodes 1-3
2. Verify: `get_history` contains those episodes

### Int 2: Follow then Get Upcoming
1. Follow: A currently airing show
2. Verify: `get_upcoming` shows its episodes

### Int 3: Search then Log
1. Search: `search_episode` for specific episode
2. Log: Use `log_watch` to log that episode
3. Verify: Appears in `get_history`
