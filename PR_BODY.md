## Summary

Adds Ollama as a new LLM provider option, enabling CashClaw to use local models. This is ideal for users who want to run LLMs locally without sending data to external APIs.

## Changes

### Backend (`src/`)
- `config.ts`: Add `ollama` to `LLMConfig.provider` type, default model `llama3.1`, make apiKey optional for local Ollama, update `isConfigured()` to not require apiKey for Ollama
- `llm/index.ts`: Create dedicated `createOllamaProvider()` function with Ollama-specific handling (localhost:11434, no auth required)

### Frontend (`src/ui/`)
- `pages/setup/LLMStep.tsx`: Add Ollama option to setup wizard
- `pages/Settings.tsx`: Add Ollama option to settings page

### Tests (`test/`)
- `llm.test.ts`: Add 15 comprehensive tests for Ollama provider

## Important: Tool Calling Support

Ollama's tool calling support **varies by model**:

| Model | Tool Calling |
|-------|--------------|
| llama3.1 | ✅ Supported |
| qwen2.5 | ✅ Supported |
| mistral | ✅ Supported |
| llama3 | ❌ Not supported |
| llama2 | ❌ Not supported |

**The provider includes helpful error messages** when tool calling isn't supported by the model.

## Requirements

- Ollama >= 0.1.20
- A model with tool calling support (llama3.1, qwen2.5, mistral)
- Ollama must be running (`ollama serve`)

## Usage

```bash
# 1. Install Ollama
curl -fsSL https://ollama.com/install.sh

# 2. Pull a model with tool support (recommended)
ollama pull llama3.1

# 3. Start Ollama server
ollama serve

# 4. In CashClaw setup, select "OLLAMA" provider
#    - API key is NOT required for local Ollama
#    - Default model: llama3.1
```

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

All tests pass (22 total):

```
✓ test/llm.test.ts (15 tests)
✓ test/loop.test.ts (7 tests)
```

### Ollama-specific tests:
- Local base URL (http://localhost:11434)
- No API key required for local instance
- Empty string API key handled correctly
- Custom model configuration (llama3.1, qwen:30b, mistral)
- Tool call parsing from Ollama responses
- Helpful error messages for unsupported tool calling
- Error handling for API failures
- Connection error handling (Ollama not running)

## Implementation Notes

1. **Dedicated Provider**: Unlike OpenAI/OpenRouter which share a provider, Ollama has its own provider function to handle:
   - No authentication required for local instances
   - Different error messages
   - Ollama-specific options in the request body

2. **Configuration**: The `isConfigured()` function now properly handles Ollama by not requiring an API key when the provider is "ollama".

3. **Tool Calling**: CashClaw relies on tool calling for the agent to interact with the marketplace (quote tasks, submit work, etc.). Without tool support, the agent can only do text-based reasoning but cannot execute actions.

---

Closes #12
