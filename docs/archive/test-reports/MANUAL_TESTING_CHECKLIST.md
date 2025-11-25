# Manual Testing Checklist for PR Review

This checklist covers scenarios that require manual testing and cannot be automated.

## Prerequisites

- [ ] Build the project: `npm run build`
- [ ] Ensure `.env` file has valid Trakt.tv credentials
- [ ] Delete any existing token: `rm ~/.trakt-mcp-token.json`

## 1. OAuth Authentication Flow

### Test 1.1: First-time Authentication

**Steps:**
1. Start MCP inspector: `npx @modelcontextprotocol/inspector node dist/index.js`
2. Open the inspector URL in your browser
3. Call the `authenticate` tool (no parameters needed)
4. Observe the response - should contain:
   - Verification URL (https://trakt.tv/activate)
   - User code (8-character alphanumeric)
   - Message about waiting for authorization

**Expected Result:**
```
Please visit https://trakt.tv/activate and enter code: ABC12345

Waiting for authorization...
```

**Verify:**
- [ ] Verification URL is clickable/copyable
- [ ] User code is clearly displayed
- [ ] Message is user-friendly

**Steps (continued):**
5. Open https://trakt.tv/activate in a new browser tab
6. Log in to your Trakt.tv account (if not already logged in)
7. Enter the user code from step 4
8. Authorize the application

**Expected Result:**
- [ ] Browser shows success message
- [ ] Token file created: `ls -la ~/.trakt-mcp-token.json`
- [ ] Token file contains JSON with access_token, refresh_token, expires_at

**Verify Token File:**
```bash
cat ~/.trakt-mcp-token.json | python3 -m json.tool
```

Should contain:
- [ ] `access_token` (long string)
- [ ] `refresh_token` (long string)
- [ ] `expires_at` (timestamp in milliseconds)
- [ ] `expires_in` (7776000 = 90 days)

### Test 1.2: Already Authenticated

**Prerequisites:** Complete Test 1.1 first

**Steps:**
1. In the same MCP inspector session, call `authenticate` again
2. Observe the response

**Expected Result:**
```
Already authenticated with Trakt.tv!
```

**Verify:**
- [ ] Message confirms existing authentication
- [ ] No new device code generated
- [ ] Token file unchanged

### Test 1.3: Token Persistence

**Steps:**
1. Quit the MCP inspector (Ctrl+C)
2. Restart: `npx @modelcontextprotocol/inspector node dist/index.js`
3. Call `authenticate` tool

**Expected Result:**
```
Already authenticated with Trakt.tv!
```

**Verify:**
- [ ] Server loads token from file on startup
- [ ] No re-authentication required
- [ ] Authentication persists across restarts

## 2. Search Functionality

### Test 2.1: Basic Show Search

**Steps:**
1. Call `search_show` with: `{ "query": "Breaking Bad" }`
2. Examine results

**Expected Result:**
- [ ] Returns array of results
- [ ] First result is "Breaking Bad" (2008)
- [ ] Contains trakt ID, slug, imdb, tmdb IDs
- [ ] Response time < 3 seconds

### Test 2.2: Movie Search with Type Filter

**Steps:**
1. Call `search_show` with: `{ "query": "Inception", "type": "movie" }`

**Expected Result:**
- [ ] Returns array of movies only
- [ ] First result is "Inception" (2010)
- [ ] No TV shows in results

### Test 2.3: Ambiguous Search

**Steps:**
1. Call `search_show` with: `{ "query": "Dune" }`
2. Count how many shows vs movies

**Expected Result:**
- [ ] Returns both shows and movies
- [ ] Each result has `type` field ("show" or "movie")
- [ ] Includes recent Dune films and Dune: Prophecy show

### Test 2.4: No Results

**Steps:**
1. Call `search_show` with: `{ "query": "xyznotarealshow123" }`

**Expected Result:**
- [ ] Returns empty array: `[]`
- [ ] No error thrown
- [ ] Server continues running

### Test 2.5: Special Characters

**Steps:**
1. Call `search_show` with: `{ "query": "It's Always Sunny in Philadelphia" }`

**Expected Result:**
- [ ] Returns results
- [ ] First result matches the show
- [ ] Apostrophe handled correctly

## 3. Authenticated Tools (Requires OAuth Completion)

**Prerequisites:** Complete OAuth flow (Test 1.1)

### Test 3.1: Get Watch History

**Steps:**
1. Call `get_history` tool (no parameters)
2. Examine response

**Expected Result:**
- [ ] Returns your actual watch history from Trakt
- [ ] Array of watched items with shows/movies
- [ ] Each item has `watched_at` timestamp
- [ ] If you have no history, returns empty array

### Test 3.2: Search Specific Episode

**Steps:**
1. Call `search_episode` with:
   ```json
   {
     "showName": "Breaking Bad",
     "season": 1,
     "episode": 1
   }
   ```

**Expected Result:**
- [ ] Returns episode data
- [ ] Title: "Pilot" or similar
- [ ] Contains trakt ID, tvdb ID, etc.
- [ ] Season and episode numbers correct

### Test 3.3: Follow a Show

**Steps:**
1. Call `follow_show` with: `{ "showName": "The Office" }`
2. Check your Trakt.tv watchlist in browser

**Expected Result:**
- [ ] Show added to your watchlist
- [ ] Success response from tool
- [ ] Show appears in Trakt.tv web interface

### Test 3.4: Unfollow a Show

**Steps:**
1. Call `unfollow_show` with: `{ "showName": "The Office" }`
2. Check your Trakt.tv watchlist

**Expected Result:**
- [ ] Show removed from watchlist
- [ ] Success response from tool
- [ ] Show no longer in Trakt.tv web interface

### Test 3.5: Log Single Watch

**Steps:**
1. Call `log_watch` with:
   ```json
   {
     "type": "episode",
     "showName": "Breaking Bad",
     "season": 1,
     "episode": 1,
     "watchedAt": "yesterday"
   }
   ```
2. Check your Trakt.tv history

**Expected Result:**
- [ ] Episode added to history
- [ ] Timestamp shows yesterday
- [ ] Appears in Trakt.tv web interface
- [ ] Natural language date parsed correctly

### Test 3.6: Bulk Log Episodes

**Steps:**
1. Call `bulk_log` with:
   ```json
   {
     "type": "episodes",
     "showName": "Breaking Bad",
     "season": 1,
     "episodes": "1-3",
     "watchedAt": "last week"
   }
   ```

**Expected Result:**
- [ ] Episodes 1, 2, and 3 all logged
- [ ] All have same timestamp (last week)
- [ ] All appear in Trakt.tv history

### Test 3.7: Get Upcoming Episodes

**Steps:**
1. Call `get_upcoming` with: `{ "days": 7 }`
2. Examine response

**Expected Result:**
- [ ] Returns upcoming episodes for shows you follow
- [ ] Each item has air date
- [ ] Only shows episodes within next 7 days
- [ ] If no upcoming episodes, returns empty array

## 4. Error Handling

### Test 4.1: Missing Required Parameter

**Steps:**
1. Call `search_show` with: `{}` (empty arguments)

**Expected Result:**
- [ ] Returns error message
- [ ] Message: "Query parameter is required" or similar
- [ ] Tool call fails gracefully
- [ ] Server continues running

### Test 4.2: Invalid Episode Number

**Steps:**
1. Call `search_episode` with:
   ```json
   {
     "showName": "Breaking Bad",
     "season": 1,
     "episode": 999
   }
   ```

**Expected Result:**
- [ ] Returns error (episode doesn't exist)
- [ ] Error message is clear
- [ ] Server continues running

### Test 4.3: Invalid Show Name

**Steps:**
1. Call `search_episode` with:
   ```json
   {
     "showName": "xyznotarealshow",
     "season": 1,
     "episode": 1
   }
   ```

**Expected Result:**
- [ ] Returns error about show not found
- [ ] Suggests using search_show first
- [ ] Server continues running

## 5. Edge Cases

### Test 5.1: Re-authentication After Logout

**Steps:**
1. Delete token: `rm ~/.trakt-mcp-token.json`
2. Restart MCP server
3. Call `authenticate` again

**Expected Result:**
- [ ] New device code generated
- [ ] Can complete OAuth flow again
- [ ] New token saved

### Test 5.2: Token File Corruption

**Steps:**
1. Edit token file to contain invalid JSON:
   ```bash
   echo "invalid json{" > ~/.trakt-mcp-token.json
   ```
2. Restart MCP server
3. Call `authenticate`

**Expected Result:**
- [ ] Server starts without crashing
- [ ] Treats user as not authenticated
- [ ] Can complete new OAuth flow
- [ ] New valid token replaces corrupted one

### Test 5.3: Rate Limiting (Optional - Time Consuming)

**Note:** This test requires making many requests and may take 5+ minutes.

**Steps:**
1. Write a script to call `search_show` 50 times rapidly
2. Observe behavior

**Expected Result:**
- [ ] All requests complete successfully
- [ ] Rate limiter prevents exceeding Trakt limits
- [ ] No 429 errors from Trakt
- [ ] Requests are queued if needed

## 6. Integration with Claude Code (Optional)

### Test 6.1: Natural Language Query

**Prerequisites:** Configure Claude Code to use this MCP server

**Steps:**
1. Ask Claude Code: "I watched Breaking Bad S1E1 yesterday"
2. Observe Claude's actions

**Expected Result:**
- [ ] Claude searches for "Breaking Bad"
- [ ] Claude finds season 1, episode 1
- [ ] Claude logs it with yesterday's date
- [ ] Claude confirms successful logging

### Test 6.2: Ambiguous Query

**Steps:**
1. Ask Claude Code: "I watched Dune"

**Expected Result:**
- [ ] Claude searches for "Dune"
- [ ] Claude asks you to clarify (show vs movie? which year?)
- [ ] After clarification, Claude logs correctly

### Test 6.3: Watch History Query

**Steps:**
1. Ask Claude Code: "What did I watch last week?"

**Expected Result:**
- [ ] Claude calls `get_history` with date range
- [ ] Claude presents results in readable format
- [ ] Shows include title, date, episode info

## Testing Complete!

When all tests pass, the implementation is ready for production use.

## Notes for Tester

- Each test should be independent
- If a test fails, note the exact error message
- Check server logs (stderr) for any warnings
- Verify that Trakt.tv web interface matches tool responses
- Test on a fresh Trakt account if possible (to avoid conflicts with existing data)

## Reporting Issues

If any test fails, please report:
1. Test number and name
2. Steps taken
3. Expected result
4. Actual result
5. Error messages (if any)
6. Server logs (stderr output)

---

**Happy Testing!**
