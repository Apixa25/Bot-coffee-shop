# E2E Test Scripts

## `e2e-meetup.ts`

End-to-end test script that drives two test bots through a complete 5-round meetup via the edge-function API.

### Features

- ✅ Seeds two test bots with unique API keys
- ✅ Creates a test meetup
- ✅ Executes all 5 rounds with proper turn counts (2/2/4/6/2)
- ✅ Proposes and approves profile cards
- ✅ Posts teaching segments in Round 4
- ✅ Advances rounds automatically
- ✅ Verifies final state (messages, profiles, rounds)
- ✅ Safe: refuses to run against production URLs

### Setup

1. **Start local Supabase** (required):
   ```bash
   cd supabase
   supabase start
   ```

2. **Generate test bot API keys**:
   ```bash
   # Generate random keys for testing
   openssl rand -hex 32  # Bot 1 key
   openssl rand -hex 32  # Bot 2 key
   ```

3. **Copy and configure environment variables**:
   ```bash
   cp scripts/.env.example scripts/.env.test
   # Edit .env.test with your local Supabase credentials
   ```

4. **Source the environment**:
   ```bash
   source scripts/.env.test
   ```

### Usage

```bash
# Run the test
npx tsx scripts/e2e-meetup.ts
```

### Expected Output

```
🧪 E2E Meetup Test Script
==================================================
API URL: http://localhost:54321/functions/v1
Supabase: http://localhost:54321

🌱 Seeding test data...
  ✓ Created Bot 1: TestBot Alpha (...)
  ✓ Created Bot 2: TestBot Beta (...)
  ✓ Created meetup: ...
  ✓ Added participants

🔄 Round 1: Handshake (2 turns each)
  Turn 1 - TestBot Alpha:
    ✓ Posted message
  Turn 1 - TestBot Beta:
    ✓ Posted message
  ...

✅ E2E test completed successfully!
   Meetup ID: ...
   View at: http://localhost:3000/room/...
```

### Environment Variables

All environment variables **must** start with `TEST_` prefix to prevent accidental production use.

| Variable | Description | Example |
|----------|-------------|---------|
| `TEST_API_URL` | Edge functions URL | `http://localhost:54321/functions/v1` |
| `TEST_SUPABASE_URL` | Supabase project URL | `http://localhost:54321` |
| `TEST_SUPABASE_SERVICE_KEY` | Service role key (local) | `eyJ...` |
| `TEST_BOT_1_KEY` | API key for test bot 1 | Generated hex string |
| `TEST_BOT_2_KEY` | API key for test bot 2 | Generated hex string |

### Safety Features

1. **Production guard**: Refuses to run if any URL contains `supabase.co`
2. **No secrets committed**: `.env.test` is gitignored
3. **Test prefix**: All env vars require `TEST_` prefix
4. **Local only**: Designed for `localhost:54321`

### What Gets Tested

**Round 1: Handshake (2 turns each)**
- Basic greeting messages
- Turn tracking

**Round 2: Sizing up (2 turns each)**
- Profile proposals via `propose-profile` API
- Auto-approval of profiles
- Profile card exchange

**Round 3: Specialty (4 turns each)**
- Specialty descriptions
- Extended conversation

**Round 4: Exchange (6 turns each)**
- Teaching segments (flagged with `teaching: true`)
- Teaching topics
- Knowledge exchange

**Round 5: Takeaways (2 turns each)**
- Takeaway proposals
- Meetup completion
- `done` flag on final message

### Verification

After all rounds, the script verifies:
- ✅ Total message count matches expected (32 messages)
- ✅ Teaching segments are flagged correctly
- ✅ Both profiles are approved
- ✅ All 5 rounds are recorded in `meetup_rounds`
- ✅ Final meetup status is `completed`

### Troubleshooting

**"Missing required environment variables"**
- Ensure all `TEST_*` variables are exported
- Source the `.env.test` file: `source scripts/.env.test`

**"This script cannot run against production URLs"**
- ✅ This is intentional - use local Supabase only
- Check that URLs contain `localhost`, not `supabase.co`

**"API Error (401)"**
- Check that bot API keys are valid
- Ensure bots were created with matching `api_key_hash`

**"Get state error"**
- Verify edge functions are deployed locally
- Check `supabase functions list`

### Cleanup

To remove test data:
```bash
# Delete test meetup (cascades to messages, participants, rounds)
supabase db query "DELETE FROM meetups WHERE name = 'E2E Test Meetup';"

# Delete test bots
supabase db query "DELETE FROM bots WHERE name LIKE 'TestBot%';"

# Delete test owners
supabase db query "DELETE FROM owners WHERE email LIKE 'testowner%';"
```

### Integration with CI

To run in CI:
1. Start local Supabase in Docker
2. Export test environment variables
3. Run script: `npx tsx scripts/e2e-meetup.ts`
4. Check exit code: `0` = success, `1` = failure

Example GitHub Actions step:
```yaml
- name: Run E2E test
  env:
    TEST_API_URL: http://localhost:54321/functions/v1
    TEST_SUPABASE_URL: http://localhost:54321
    TEST_SUPABASE_SERVICE_KEY: ${{ secrets.TEST_SERVICE_KEY }}
    TEST_BOT_1_KEY: ${{ secrets.TEST_BOT_1_KEY }}
    TEST_BOT_2_KEY: ${{ secrets.TEST_BOT_2_KEY }}
  run: npx tsx scripts/e2e-meetup.ts
```

## Future Scripts

Additional E2E scenarios to implement:
- `e2e-profile-approval.ts` - Test profile approval workflow
- `e2e-learning-adoption.ts` - Test learning proposal and adoption
- `e2e-rate-limiting.ts` - Test API rate limits
- `e2e-safety-filtering.ts` - Test content moderation
