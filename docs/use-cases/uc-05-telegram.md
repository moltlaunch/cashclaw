# UC-05: Telegram Bot Interaction

---

## UC-05.1: Bot Configuration

**Actor:** Operator
**Goal:** Deploy a configured Betsy Telegram bot with the desired persona, LLM routing, and enabled plugins.
**Preconditions:** A Telegram bot token exists; API keys for LLM providers are available.

### Main Success Scenario

1. Operator creates `betsy.config.yaml` in the working directory.
2. Config declares `telegram.token`, the agent name and personality tone, fast and (optionally) strong LLM providers, and a list of plugins to activate.
3. Operator runs `betsy` (or the entry-point command).
4. `loadConfig()` reads and validates the file against the Zod schema; throws if required fields are missing.
5. `LLMRouter` is instantiated with the validated config, wiring `fast` and `strong` model endpoints.
6. `PluginRegistry` loads each plugin listed under `plugins:`, calling `plugin.activate(ctx)` for each; duplicate registrations are rejected.
7. `startBot()` initialises the grammY `Bot` instance with `autoRetry` middleware and registers all command and message handlers.
8. Bot connects to the Telegram Bot API and begins polling; startup is logged.

### Alternative Flows

- **A1 — Config file missing:** `loadConfig()` throws `"Config not found: betsy.config.yaml"`. Bot does not start.
- **A2 — Schema validation failure:** Zod throws a detailed error listing invalid fields. Bot does not start.
- **A3 — Plugin activation error:** `PluginRegistry.register()` propagates the error; the operator must fix the plugin or remove it from the config.
- **A4 — Duplicate plugin name:** `PluginRegistry.register()` throws `"Plugin already registered"`.

### Postconditions

- Bot is live and polling Telegram.
- All listed plugins are active.
- Startup event is persisted to the `events` table in SQLite.

---

## UC-05.2: First Message — `/start`

**Actor:** User
**Goal:** Begin interacting with the bot and discover available commands.
**Preconditions:** Bot is running; user opens the chat or sends `/start`.

### Main Success Scenario

1. User sends `/start`.
2. Bot replies with a welcome message including the agent name and a full command reference (`/settings`, `/status`, `/clear`, `/study`, `/instruct`, `/help`).
3. The `telegram` event is logged with the user's Telegram ID.

### Alternative Flows

- None. The `/start` handler always replies successfully.

### Postconditions

- User sees the welcome message; no conversation history is written.

---

## UC-05.3: Standard Text Conversation

**Actor:** User
**Goal:** Have a multi-turn text conversation with the bot.
**Preconditions:** Bot is running; user sends a plain-text message.

### Main Success Scenario

1. User sends a text message (not a slash command).
2. Bot appends the message to a 1 500 ms debounce buffer for that chat ID. Rapid sequential messages are batched into one request.
3. After the debounce timer fires, `processBatch()` runs:
   a. Combined text is saved to the `conversations` table.
   b. `extractAndSaveFacts()` is called asynchronously: if the message matches personal-info patterns (name, location, birthday, relationships), the fast LLM extracts facts as a JSON array and each fact is stored in the `facts` table.
   c. The last 20 messages of conversation history are fetched and prepended with a system prompt built from the config personality, custom instructions, and known facts.
4. If `telegram.streaming` is `true` (default), `streamResponse()` sends a placeholder `"..."` message, then edits it in 300 ms intervals as tokens arrive from the fast LLM's streaming endpoint.
5. If streaming is disabled, `simpleResponse()` shows a typing indicator and replies once the full response is ready.
6. `cleanResponse()` strips internal LLM meta-commentary ("use skill…", "based on instructions…").
7. `parseResponseMode()` checks the response text for mode markers (`[MODE:VOICE]`, `[MODE:VIDEO]`, `[MODE:SELFIE:…]`) or re-runs `detectUserIntent()` on the original user message.
8. For plain text mode, the final response is sent to the user and saved to `conversations`.
9. The `conversations` table is trimmed to the last 100 messages per chat.

### Alternative Flows

- **A1 — LLM error:** Bot replies with a generic error message ("Something went wrong, try again"). The error is logged.
- **A2 — Streaming fails mid-response:** Falls back to a single non-streaming `llm.fast().chat()` call and edits the placeholder with the result.
- **A3 — Message is a slash command:** Handler exits early; no LLM call is made.

### Postconditions

- User message and bot reply are persisted to `conversations`.
- Any extracted personal facts are persisted to `facts`.
- Conversation history grows (capped at 100 entries per chat).

---

## UC-05.4: Voice Message Response

**Actor:** User
**Goal:** Receive a spoken audio reply from the bot.
**Preconditions:** Bot is running; `voice.tts_provider` and a voice ID are configured.

### Main Success Scenario

1. User sends a text message containing a voice request keyword (e.g., "скажи голосом", "voice", "озвучь"), or sends the `/voice <text>` command.
2. `detectUserIntent()` returns `"voice"` (or the LLM appends `[MODE:VOICE]` in its response).
3. `sendVoiceResponse()` calls `synthesizeSpeech()`:
   - If `tts_provider` is `"minimax"`: POSTs to `fal.run/fal-ai/minimax/speech-02-hd` with voice ID, speed, pitch, and emotion settings; downloads the returned MP3.
   - If `tts_provider` is `"openai"` (default): calls OpenAI TTS with the configured voice ID (alloy, nova, shimmer, etc.); downloads the Opus audio.
4. Audio is written to a temp file and sent to Telegram as a voice note (`replyWithVoice`).
5. Temp file is deleted after sending.

### Alternative Flows

- **A1 — Voice not configured:** `synthesizeSpeech()` returns `null`; bot falls back to a text reply and warns the user to configure voice in `/settings`.
- **A2 — TTS API error:** Logged; `null` returned; text reply is sent instead.
- **A3 — `/voice` command with no text:** Bot replies with usage instructions.

### Postconditions

- User receives a Telegram voice note.
- Bot reply text is saved to `conversations` (only when triggered via natural conversation; the `/voice` command does not persist the exchange).

---

## UC-05.5: Video Note (Talking-Head / Lip-Sync)

**Actor:** User
**Goal:** Receive a circular video note of the bot's avatar speaking the reply.
**Preconditions:** Avatar photo is configured; fal.ai API key is set; TTS is configured.

### Main Success Scenario

1. User requests a video response (e.g., "кружочек", "запиши видео", "record video"), or sends `/video <text>`.
2. `detectUserIntent()` returns `"video"`.
3. `sendVideoNote()` calls `generateLipSync()`:
   a. `synthesizeSpeech()` produces an audio buffer.
   b. Audio and avatar image are uploaded to catbox.moe to obtain public URLs.
   c. fal.ai `fal-ai/sadtalker` is called with the image URL, audio URL, and quality settings (resolution 512, GFPGAN face enhancer, expression scale 1.2).
   d. The returned video URL is downloaded as a buffer.
4. Video is written to a temp MP4 and sent as a video note (`replyWithVideoNote`) — Telegram renders this as a circular "bubble" video.
5. Temp file is deleted.

### Alternative Flows

- **A1 — Avatar not set:** `generateLipSync()` returns `null`; `sendVideoNote()` falls back to `sendVoiceResponse()`.
- **A2 — fal.ai error:** Logged; falls back to voice response.
- **A3 — Video note send fails (size/format):** Falls back to `replyWithVideo` (standard rectangular video).
- **A4 — `/video` with no text:** Bot replies with usage instructions and a reminder to set an avatar.

### Postconditions

- User receives a circular video note (or voice fallback).
- Bot reply is saved to `conversations`.

---

## UC-05.6: Selfie Generation

**Actor:** User
**Goal:** Receive an AI-generated photo of the bot's persona in a described scene.
**Preconditions:** `selfies.kie_api_key` and `selfies.reference_photo_url` are configured.

### Main Success Scenario

1. User sends a selfie request (e.g., "пришли селфи", "selfie", "покажись") with an optional scene description, or uses `/selfie <description>`.
2. `detectUserIntent()` returns `"selfie"`, or the LLM embeds `[MODE:SELFIE:<prompt>]` in its response.
3. `sendSelfie()` calls `generateSelfie()`:
   a. POSTs to `kie.ai` (`nano-banana-2` model) with a consistency prompt preserving face/hair/eyes and the user-supplied scene description.
   b. Polls the job status endpoint every 5 seconds for up to 150 seconds.
   c. Downloads the result JPEG from the returned URL.
4. Image is written to a temp file and sent via `replyWithPhoto`.
5. Temp file is deleted.

### Alternative Flows

- **A1 — kie.ai key or reference photo missing:** `generateSelfie()` returns `null`; bot warns about misconfigured kie.ai key.
- **A2 — Job fails or times out:** Exception caught; logged; bot reports failure.
- **A3 — `/selfie` with no description:** Bot replies with usage examples ("в кофейне", "кодит ночью", etc.).
- **A4 — LLM-embedded selfie:** When the LLM autonomously appends `[MODE:SELFIE:<prompt>]`, the marker is stripped from the visible text before sending and the selfie is generated in parallel.

### Postconditions

- User receives a generated photo.
- Bot reply text (without the mode marker) is saved to `conversations`.

---

## UC-05.7: Sending and Receiving Photos

**Actor:** User
**Goal:** Share a photo with the bot for analysis, or set a new avatar photo.
**Preconditions:** Bot is running.

### Main Success Scenario — Photo Analysis

1. User sends a photo to the chat, optionally with a caption.
2. Bot fetches the highest-resolution version of the photo via the Bot API.
3. Constructs a direct download URL and calls `llm.strong().chat()` (the stronger model) with the image URL and caption in context.
4. Bot replies with the analysis and saves both sides to `conversations`.

### Main Success Scenario — Avatar Upload

1. Operator has triggered avatar-upload mode via `/settings → Avatar`.
2. User sends a photo.
3. `isAwaitingAvatar()` returns `true` for that chat; bot downloads the photo, saves it to `data/avatar.png`, and writes the path into `betsy.config.yaml` under `video.reference_photo` and `selfies.reference_photo`.
4. Bot confirms the avatar was saved.

### Alternative Flows

- **A1 — Photo fetch or analysis fails:** Bot replies with an error message; event is logged.

### Postconditions

- **Analysis:** Conversation history updated with photo message and analysis.
- **Avatar:** `betsy.config.yaml` updated; avatar available for lip-sync and selfie generation.

---

## UC-05.8: Fact Extraction and Persistent Memory

**Actor:** User (implicit — triggered by natural conversation)
**Goal:** Bot retains personal information shared across sessions.
**Preconditions:** Bot is running; user shares personal information in a message.

### Main Success Scenario

1. User sends a message containing personal information ("my name is", "я живу в", "день рождения", etc.).
2. `extractAndSaveFacts()` detects the trigger pattern and fires asynchronously.
3. The fast LLM is asked to return a JSON array of short fact strings (e.g., `["Name: Konstantin", "Birthday: May 4"]`).
4. Each valid fact (3–200 characters) is saved via `saveUserFact()` to the `facts` table keyed by chat ID.
5. Facts are included in future system prompts via `buildSystemPrompt()`, enabling personalised replies.

### Alternative Flows

- **A1 — No trigger pattern matched:** `extractAndSaveFacts()` returns immediately without an LLM call.
- **A2 — LLM returns malformed JSON:** Regex match fails silently; no facts are saved.
- **A3 — LLM API error:** Caught silently; conversation continues without fact extraction.

### Postconditions

- Extracted facts persist in the `facts` table and are reflected in subsequent conversations.

---

## UC-05.9: Bot Settings Configuration

**Actor:** User
**Goal:** Adjust persona tone, TTS voice, avatar, learning mode, or custom instructions without editing files directly.
**Preconditions:** Bot is running; user sends `/settings`.

### Main Success Scenario

1. User sends `/settings`.
2. Bot displays the current configuration summary (tone, voice ID, avatar status, learning on/off, LLM model) with an inline keyboard.
3. **Personality tone:** User taps "Личность", selects from four tones (professional / casual / friendly / sassy); config is rewritten and confirmed.
4. **Voice:** User taps "Голос", selects from six OpenAI voices (alloy, echo, fable, onyx, nova, shimmer); `voice.voice_id` and `voice.tts_provider` are written to config.
5. **Avatar:** User taps "Аватар", receives upload instructions, sends a photo; bot saves it and updates config paths.
6. **Self-learning toggle:** User taps "Самообучение", then "Включить/Выключить"; `memory.learning_enabled` is toggled in config.
7. **Custom instructions:** User sends `/instruct <text>`; `agent.personality.custom_instructions` is written to config and confirmed.
8. **LLM info:** Displays current model names; directs user to edit `betsy.config.yaml` for changes.

### Alternative Flows

- **A1 — `/instruct` with no text:** Bot replies with usage example.
- **A2 — Config write error:** Unhandled; would surface as an unhandled exception.

### Postconditions

- `betsy.config.yaml` is updated with the new setting.
- Subsequent responses reflect the updated configuration immediately (config is re-read per request).

---

## UC-05.10: Self-Study Session

**Actor:** System (scheduled) or User (manual)
**Goal:** Bot improves its knowledge base autonomously between conversations.
**Preconditions:** `memory.learning_enabled` is `true`; bot is running.

### Main Success Scenario — Scheduled

1. A 60-second interval fires; `shouldStudy()` checks if `study_interval_min` has elapsed since the last session.
2. If due, `runStudySession()` selects the next topic from a round-robin cycle: `feedback_analysis`, `specialty_research`, or `task_simulation`.
3. A topic-specific prompt is constructed (referencing existing knowledge and the agent's custom instructions).
4. The fast LLM generates 2–3 paragraphs of insights.
5. If the response exceeds 50 characters, it is stored in the `knowledge` table via `addKnowledge()` (capped at `max_knowledge` entries).
6. The study event is logged.

### Main Success Scenario — Manual

1. User sends `/study`.
2. Bot replies "Starting study session…".
3. `runStudySession()` runs immediately (same flow as above).
4. Bot confirms completion or reports an error.

### Alternative Flows

- **A1 — LLM error during study:** Error is logged; session is marked complete; no knowledge is added.
- **A2 — Response too short (<50 chars):** Response discarded; no knowledge entry created.

### Postconditions

- New knowledge entry is added to the `knowledge` table.
- `lastStudy` timestamp is updated; next session is deferred by `study_interval_min`.

---

## UC-05.11: Website Monitoring

**Actor:** Operator (setup) / System (periodic checks) / User (`/monitor` command)
**Goal:** Receive Telegram notifications when monitored websites change.
**Preconditions:** Bot is running; `telegram.owner_id` is configured.

### Main Success Scenario

1. User sends `/monitor add <url> <name>` to register a site (default interval: 60 minutes).
2. A 5-minute system interval fires `checkAllSites()`, which iterates all registered sites whose check interval has elapsed.
3. For each due site, `checkSite()` fetches the page, strips HTML tags, and computes a simple hash.
4. If the hash differs from the stored hash, the fast LLM summarises what changed (max 5 bullet points).
5. If the summary does not contain "No significant updates", the summary is sent to the owner chat and stored in the `knowledge` table.
6. `last_check`, `last_content_hash`, and `last_summary` are updated in SQLite.

### Alternative Flows

- **A1 — Site unreachable or non-200:** Logged; site skipped until next interval.
- **A2 — Hash unchanged:** No LLM call; `last_check` updated silently.
- **A3 — `/monitor` with no arguments or `list`:** Bot lists registered sites with last-check times.
- **A4 — `/monitor remove <url>`:** Site is removed from the `monitored_sites` table.

### Postconditions

- Owner receives a Telegram message with change summaries.
- Site monitoring state is updated in SQLite.

---

## UC-05.12: Plugin Lifecycle

**Actor:** Operator
**Goal:** Extend bot capabilities by installing and managing plugins.
**Preconditions:** Plugin package exists as an npm package or local directory implementing `BetsyPlugin`.

### Main Success Scenario

1. Operator adds the plugin name/path to the `plugins:` list in `betsy.config.yaml`.
2. On startup, `PluginRegistry.register(plugin, ctx)` is called with a `PluginContext` providing `config`, `llm`, `db`, and a logger.
3. `plugin.activate(ctx)` runs; the plugin registers any Telegram handlers or background tasks it needs.
4. Plugin is stored in the registry under its name.
5. On shutdown, `PluginRegistry.shutdownAll()` calls `plugin.deactivate()` for each registered plugin; errors are logged but do not block other plugins from shutting down.

### Alternative Flows

- **A1 — Plugin throws in `activate()`:** Error propagates; operator must fix the plugin or remove it from config.
- **A2 — Plugin name collision:** Registry throws `"Plugin already registered"`; second registration is rejected.
- **A3 — Plugin throws in `deactivate()`:** Error is logged; remaining plugins continue their shutdown sequence.

### Postconditions

- Active plugins are listed via `PluginRegistry.list()`.
- Plugin lifecycle events are logged to the `events` table.
