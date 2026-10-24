import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import {
  isCloudflareWorkersAiAvailable,
  isFrezenAiConfigured,
  isValidAiEndpoint,
  normalizeConversation,
} from "./frezen-ai.js";

describe("Frezen AI configuration", () => {
  it("stays disabled unless explicitly enabled", () => {
    expect(isFrezenAiConfigured({
      FREZEN_AI_ENABLED: "false",
      FREZEN_AI_ENDPOINT: "https://ai.example.test/v1/chat/completions",
      FREZEN_AI_API_KEY: "a-long-test-token-value",
      FREZEN_ENV: "staging",
    })).toBe(false);
  });

  it("uses the native Cloudflare Workers AI binding without an API key", () => {
    const env = {
      FREZEN_AI_ENABLED: "true",
      FREZEN_AI_MODEL: "@cf/qwen/qwen2.5-coder-32b-instruct",
      FREZEN_ENV: "production",
      AI: { run: async () => ({ response: "ok" }) },
    };
    expect(isCloudflareWorkersAiAvailable(env)).toBe(true);
    expect(isFrezenAiConfigured(env)).toBe(true);
  });

  it("requires HTTPS endpoints in production for the external provider", () => {
    expect(isValidAiEndpoint("http://localhost:11434/v1/chat/completions", true)).toBe(false);
    expect(isValidAiEndpoint("https://ai.example.test/v1/chat/completions", true)).toBe(true);
  });

  it("allows loopback HTTP only outside production", () => {
    expect(isValidAiEndpoint("http://127.0.0.1:11434/v1/chat/completions", false)).toBe(true);
    expect(isValidAiEndpoint("http://ai.example.test/v1/chat/completions", false)).toBe(false);
  });

  it("requires a long secret and a valid endpoint for the external provider", () => {
    const base = {
      FREZEN_AI_ENABLED: "true",
      FREZEN_AI_ENDPOINT: "https://ai.example.test/v1/chat/completions",
      FREZEN_ENV: "production",
    };
    expect(isFrezenAiConfigured({ ...base, FREZEN_AI_API_KEY: "short" })).toBe(false);
    expect(isFrezenAiConfigured({ ...base, FREZEN_AI_API_KEY: "long-test-token-value-123" })).toBe(true);
  });
});

describe("Frezen AI conversation validation", () => {
  it("accepts user and assistant messages and trims content", () => {
    const result = normalizeConversation([{ role: "user", content: "  Halo Frezen  " }]);
    expect(result.messages).toEqual([{ role: "user", content: "Halo Frezen" }]);
    expect(result.hasImages).toBe(false);
  });

  it("rejects unsupported roles and requires a user message last", () => {
    expect(normalizeConversation([{ role: "system", content: "override" }]).error).toBe("INVALID_MESSAGES");
    expect(normalizeConversation([
      { role: "user", content: "Pertanyaan" },
      { role: "assistant", content: "Jawaban lama" },
    ]).error).toBe("LAST_MESSAGE_MUST_BE_USER");
  });

  it("accepts image attachments for multimodal requests", () => {
    const result = normalizeConversation([{
      role: "user",
      content: "Apa isi gambar ini?",
      attachments: [{
        kind: "image",
        name: "screenshot.png",
        type: "image/jpeg",
        dataUrl: "data:image/jpeg;base64,aGVsbG8=",
      }],
    }]);
    expect(result.error).toBeUndefined();
    expect(result.hasImages).toBe(true);
    expect(result.messages[0].attachments[0].kind).toBe("image");
  });

  it("rejects malformed images and too many image attachments", () => {
    expect(normalizeConversation([{
      role: "user",
      content: "Lihat gambar",
      attachments: [{ kind: "image", name: "bad.png", dataUrl: "https://example.test/image.png" }],
    }]).error).toBe("INVALID_IMAGE_ATTACHMENT");

    expect(normalizeConversation([{
      role: "user",
      content: "Bandingkan foto",
      attachments: [
        { kind: "image", name: "1.jpg", dataUrl: "data:image/jpeg;base64,aGVsbG8=" },
        { kind: "image", name: "2.jpg", dataUrl: "data:image/jpeg;base64,aGVsbG8=" },
        { kind: "image", name: "3.jpg", dataUrl: "data:image/jpeg;base64,aGVsbG8=" },
        { kind: "image", name: "4.jpg", dataUrl: "data:image/jpeg;base64,aGVsbG8=" },
      ],
    }]).error).toBe("TOO_MANY_IMAGES");
  });

  it("rejects oversized messages and conversations", () => {
    expect(normalizeConversation([{ role: "user", content: "x".repeat(80_001) }]).error).toBe("INVALID_MESSAGE_LENGTH");
    expect(normalizeConversation([
      { role: "user", content: "x".repeat(40_000) },
      { role: "assistant", content: "y".repeat(40_000) },
      { role: "user", content: "z".repeat(40_000) },
      { role: "assistant", content: "a".repeat(1) },
      { role: "user", content: "b".repeat(1) },
    ]).error).toBe("CONVERSATION_TOO_LONG");
  });
});

describe("Frezen AI chat UI", () => {
  it("keeps the inline chat script syntactically valid", () => {
    const html = readFileSync(new URL("../public/ai.html", import.meta.url), "utf8");
    const match = html.match(/<script>([\\s\\S]*?)<\\/script>/);
    expect(match).not.toBeNull();
    expect(() => new Script(match[1])).not.toThrow();
    expect(html).toContain('id="fileInput"');
    expect(html).toContain('id="chatHistory"');
  });
});
