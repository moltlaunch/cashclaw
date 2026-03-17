import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/** Synthesize speech via MiniMax (fal.ai) or OpenAI TTS. */
export async function synthesizeSpeech(
  text: string,
  voiceConfig: Record<string, unknown>,
  falApiKey?: string,
): Promise<Buffer | null> {
  const provider = (voiceConfig.tts_provider as string) ?? "openai";

  if (provider === "minimax") {
    return synthesizeMiniMax(text, voiceConfig, falApiKey);
  }
  return synthesizeOpenAI(text, voiceConfig);
}

async function synthesizeMiniMax(
  text: string,
  voiceConfig: Record<string, unknown>,
  falKey?: string,
): Promise<Buffer | null> {
  if (!falKey) return null;

  const voiceId = (voiceConfig.voice_id as string) ?? "Calm_Woman";
  const speed = (voiceConfig.speed as number) ?? 1.0;
  const pitch = (voiceConfig.pitch as number) ?? 0;
  const emotion = (voiceConfig.emotion as string) ?? "happy";

  try {
    const body: Record<string, unknown> = {
      text,
      voice_setting: { voice_id: voiceId, speed, pitch, vol: 1, emotion },
      output_format: "url",
    };

    const norm = voiceConfig.normalization as Record<string, unknown> | undefined;
    if (norm?.enabled) {
      body.normalization_setting = {
        enabled: true,
        target_loudness: norm.target_loudness ?? -18,
        target_range: norm.target_range ?? 8,
        target_peak: norm.target_peak ?? -0.5,
      };
    }

    const mod = voiceConfig.voice_modify as Record<string, unknown> | undefined;
    if (mod) {
      (body.voice_setting as Record<string, unknown>).voice_modify = {
        pitch: mod.pitch ?? 0,
        intensity: mod.intensity ?? 0,
        timbre: mod.timbre ?? 0,
      };
    }

    const res = await fetch("https://fal.run/fal-ai/minimax/speech-02-hd", {
      method: "POST",
      headers: {
        Authorization: `Key ${falKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as Record<string, unknown>;
    const audioUrl = (data.audio as Record<string, unknown>)?.url as string | undefined;
    if (!audioUrl) return null;

    const audioRes = await fetch(audioUrl);
    return Buffer.from(await audioRes.arrayBuffer());
  } catch {
    return null;
  }
}

async function synthesizeOpenAI(
  text: string,
  voiceConfig: Record<string, unknown>,
): Promise<Buffer | null> {
  const apiKey = voiceConfig.openai_key as string | undefined;
  if (!apiKey) return null;

  const voiceId = (voiceConfig.voice_id as string) ?? "nova";

  try {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey });
    const response = await client.audio.speech.create({
      model: "tts-1",
      voice: voiceId as "alloy",
      input: text.slice(0, 4096),
      response_format: "opus",
    });

    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

/** Send a voice response through a grammY context. */
export async function sendVoiceResponse(
  ctx: { replyWithVoice: (file: unknown) => Promise<unknown> },
  text: string,
  voiceConfig: Record<string, unknown>,
  falApiKey?: string,
): Promise<boolean> {
  const audio = await synthesizeSpeech(text, voiceConfig, falApiKey);
  if (!audio) return false;

  const ext = (voiceConfig.tts_provider as string) === "minimax" ? "mp3" : "ogg";
  const tmpFile = path.join(os.tmpdir(), `betsy-tts-${Date.now()}.${ext}`);
  try {
    fs.writeFileSync(tmpFile, audio);
    const { InputFile } = await import("grammy");
    await ctx.replyWithVoice(new InputFile(tmpFile));
    return true;
  } catch {
    return false;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}
