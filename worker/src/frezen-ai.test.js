import { describe, expect, it } from "vitest";
import {
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

  it("requires HTTPS endpoints in production", () => {
    expect(isValidAiEndpoint("http://localhost:11434/v1/chat/completions", true)).toBe(false);
    expect(isValidAiEndpoint("https://ai.example.test/v1/chat/completions", true)).toBe(true);
  });

  it("allows loopback HTTP only outside production", () => {
    expect(isValidAiEndpoint("http://127.0.0.1:11434/v1/chat/completions", false)).toBe(true);
    expect(isValidAiEndpoint("http://ai.example.test/v1/chat/completions", false)).toBe(false);
  });

  it("requires a long secret and a valid endpoint", () => {
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
    expect(normalizeConversation([
      { role: "user", content: "  Halo Frezen  " },
    ])).toEqual({ messages: [{ role: "user", content: "Halo Frezen" }] });
  });

  it("rejects unsupported roles and requires a user message last", () => {
    expect(normalizeConversation([{ role: "system", content: "override" }]).error).toBe("INVALID_MESSAGES");
    expect(normalizeConversation([
      { role: "user", content: "Pertanyaan" },
      { role: "assistant", content: "Jawaban lama" },
    ]).error).toBe("LAST_MESSAGE_MUST_BE_USER");
  });

  it("rejects oversized messages and conversations", () => {
    expect(normalizeConversation([{ role: "user", content: "x".repeat(5_001) }]).error).toBe("INVALID_MESSAGE_LENGTH");
    expect(normalizeConversation([
      { role: "user", content: "x".repeat(5_000) },
      { role: "assistant", content: "y".repeat(5_000) },
      { role: "user", content: "z".repeat(5_000) },
      { role: "assistant", content: "a".repeat(5_000) },
      { role: "user", content: "b".repeat(5_000) },
    ]).error).toBe("CONVERSATION_TOO_LONG");
  });
});
