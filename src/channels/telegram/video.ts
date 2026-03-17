import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { synthesizeSpeech } from "./voice.js";

/** Upload a buffer to catbox.moe and return its public URL. */
async function uploadTempFile(buffer: Buffer, filename: string): Promise<string> {
  const ext = path.extname(filename).slice(1) || "bin";
  const mimeTypes: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    ogg: "audio/ogg",
    mp3: "audio/mpeg",
    wav: "audio/wav",
  };

  const formData = new FormData();
  formData.append("reqtype", "fileupload");
  formData.append(
    "fileToUpload",
    new Blob([buffer], { type: mimeTypes[ext] || "application/octet-stream" }),
    filename,
  );

  const res = await fetch("https://catbox.moe/user/api.php", {
    method: "POST",
    body: formData,
  });

  const url = await res.text();
  if (!url.startsWith("http")) throw new Error(`Upload failed: ${url.slice(0, 200)}`);
  return url.trim();
}

/** Generate a lip-sync talking-head video via fal.ai SadTalker. */
export async function generateLipSync(
  text: string,
  voiceConfig: Record<string, unknown>,
  falApiKey: string,
  avatarPath: string,
): Promise<Buffer | null> {
  if (!fs.existsSync(avatarPath)) return null;

  try {
    const audio = await synthesizeSpeech(text, voiceConfig, falApiKey);
    if (!audio) return null;

    const [audioUrl, imageUrl] = await Promise.all([
      uploadTempFile(audio, "speech.ogg"),
      uploadTempFile(fs.readFileSync(avatarPath), "avatar.png"),
    ]);

    const res = await fetch("https://fal.run/fal-ai/sadtalker", {
      method: "POST",
      headers: {
        Authorization: `Key ${falApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source_image_url: imageUrl,
        driven_audio_url: audioUrl,
        face_model_resolution: "512",
        face_enhancer: "gfpgan",
        expression_scale: 1.2,
        preprocess: "full",
      }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as Record<string, unknown>;
    const videoUrl = (data.video as Record<string, unknown>)?.url as string | undefined;
    if (!videoUrl) return null;

    const videoRes = await fetch(videoUrl);
    return Buffer.from(await videoRes.arrayBuffer());
  } catch {
    return null;
  }
}

/** Send a video note (circle) through a grammY context. Falls back to voice. */
export async function sendVideoNote(
  ctx: {
    replyWithVideoNote: (file: unknown) => Promise<unknown>;
    replyWithVideo: (file: unknown) => Promise<unknown>;
    replyWithVoice: (file: unknown) => Promise<unknown>;
  },
  text: string,
  voiceConfig: Record<string, unknown>,
  falApiKey: string,
  avatarPath: string,
): Promise<boolean> {
  const video = await generateLipSync(text, voiceConfig, falApiKey, avatarPath);

  if (!video) {
    // Fall back to voice
    const { sendVoiceResponse } = await import("./voice.js");
    return sendVoiceResponse(ctx, text, voiceConfig, falApiKey);
  }

  const tmpFile = path.join(os.tmpdir(), `betsy-video-${Date.now()}.mp4`);
  try {
    fs.writeFileSync(tmpFile, video);
    const { InputFile } = await import("grammy");
    const file = new InputFile(tmpFile);
    try {
      await ctx.replyWithVideoNote(file);
    } catch {
      await ctx.replyWithVideo(file);
    }
    return true;
  } catch {
    return false;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}
