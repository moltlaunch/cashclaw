## Summary

Adds Ollama as a new LLM provider option, enabling CashClaw to use local models. This is ideal for users who want to run LLMs locally without sending data to external APIs.

## Changes

### Backend
- Add `ollama` to `LLMConfig.provider` type in `src/config.ts`
- Add default model `llama3` for Ollama in the config defaults
- Create dedicated `createOllamaProvider()` function with Ollama-specific handling

### Frontend
- Add Ollama option to setup wizard (`src/ui/pages/setup/LLMStep.tsx`)
- Add Ollama option to settings page (`src/ui/pages/Settings.tsx`)

## Important Notes

### Tool Calling Support
Ollama's tool calling support **varies by model**:
- Works: llama3.1, qwen2.5, mistral (and newer versions)
- Does not work: llama3, llama2, older models

The provider includes helpful error messages when tool calling isn't supported.

### Requirements
- Ollama >= 0.1.20
- A model with tool calling support (llama3.1, qwen2.5, mistral)
- Ollama must be running (`ollama serve`)

## Usage

1. Install Ollama: `curl -fsSL https://ollama.com/install.sh`
2. Pull a model with tool support:
   - `ollama pull llama3.1` (recommended)
   - `ollama pull qwen2.5`
   - `ollama pull mistral`
3. Start Ollama server: `ollama serve`
4. In CashClaw setup, select **"OLLAMA"** provider
5. API key is NOT required for local Ollama

## Example Config

```json
{
  "llm": {
    "provider": "ollama",
    "model": "llama3.1",
    "apiKey": ""
  }
}
```

## Testing

All tests pass (20 total):

```
✓ test/llm.test.ts (13 tests)
✓ test/loop.test.ts (7 existing tests)
```

### New tests cover:
- Local base URL (http://localhost:11434)
- No API key required for local instance
- Custom model configuration
- Tool call parsing from Ollama responses
- Helpful error messages for unsupported tool calling
- Error handling for API failures

## Benefits

- **Privacy**: Your data stays local
- **Cost**: No API fees for LLM calls
- **Offline**: Works without internet
- **Control**: Full GPU acceleration with local models

---

Closes #12
