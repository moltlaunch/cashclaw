import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const KIE_CREATE = "https://api.kie.ai/api/v1/jobs/createTask";
const KIE_STATUS = "https://api.kie.ai/api/v1/jobs/recordInfo";

async function nanoBananaGenerate(
  prompt: string,
  referenceUrl: string,
  apiKey: string,
): Promise<string> {
  const createRes = await fetch(KIE_CREATE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "nano-banana-2",
      input: {
        prompt,
        image_input: [referenceUrl],
        aspect_ratio: "1:1",
        resolution: "1K",
        output_format: "jpg",
      },
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`kie.ai create error ${createRes.status}: ${err.slice(0, 300)}`);
  }

  const { data } = (await createRes.json()) as { data?: { taskId?: string } };
  if (!data?.taskId) throw new Error("No taskId in kie.ai response");

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    const pollRes = await fetch(`${KIE_STATUS}?taskId=${data.taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!pollRes.ok) continue;

    const status = (await pollRes.json()) as {
      data?: { state?: string; failMsg?: string; resultJson?: string };
    };

    if (status.data?.state === "success") {
      const result = JSON.parse(status.data.resultJson!);
      if (result.resultUrls?.[0]) return result.resultUrls[0];
      throw new Error("No resultUrls in kie.ai response");
    }
    if (status.data?.state === "fail") {
      throw new Error(`kie.ai failed: ${status.data.failMsg}`);
    }
  }

  throw new Error("kie.ai timeout after 150s");
}

/** Generate a selfie image from a prompt. */
export async function generateSelfie(
  prompt: string,
  kieApiKey: string,
  referencePhotoUrl: string,
): Promise<Buffer | null> {
  try {
    const imageUrl = await nanoBananaGenerate(
      `Generate a new photo of this exact person from the reference image. ${prompt}. Keep the exact same face, eyes, nose, lips, hair style and color. Photorealistic, high quality, natural lighting.`,
      referencePhotoUrl,
      kieApiKey,
    );

    const imgRes = await fetch(imageUrl);
    return Buffer.from(await imgRes.arrayBuffer());
  } catch {
    return null;
  }
}

/** Send a selfie photo through a grammY context. */
export async function sendSelfie(
  ctx: { replyWithPhoto: (file: unknown) => Promise<unknown> },
  prompt: string,
  kieApiKey: string,
  referencePhotoUrl: string,
): Promise<boolean> {
  const image = await generateSelfie(prompt, kieApiKey, referencePhotoUrl);
  if (!image) return false;

  const tmpFile = path.join(os.tmpdir(), `betsy-selfie-${Date.now()}.jpg`);
  try {
    fs.writeFileSync(tmpFile, image);
    const { InputFile } = await import("grammy");
    await ctx.replyWithPhoto(new InputFile(tmpFile));
    return true;
  } catch {
    return false;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}
