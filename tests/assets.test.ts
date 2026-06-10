import { describe, expect, test } from "bun:test";
import { matchesMagicBytes } from "../src/assets";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GIF = Uint8Array.from([...new TextEncoder().encode("GIF89a"), 0x00]);
const WEBP = Uint8Array.from([
  ...new TextEncoder().encode("RIFF"),
  0x24, 0x00, 0x00, 0x00,
  ...new TextEncoder().encode("WEBP"),
]);
const PDF = new TextEncoder().encode("%PDF-1.7\n");
const TEXT = new TextEncoder().encode("hello world");

describe("matchesMagicBytes", () => {
  test("accepts each format's real signature", () => {
    expect(matchesMagicBytes(PNG, "image/png")).toBe(true);
    expect(matchesMagicBytes(JPEG, "image/jpeg")).toBe(true);
    expect(matchesMagicBytes(GIF, "image/gif")).toBe(true);
    expect(matchesMagicBytes(WEBP, "image/webp")).toBe(true);
    expect(matchesMagicBytes(PDF, "application/pdf")).toBe(true);
  });

  test("rejects content that does not match the declared mime", () => {
    expect(matchesMagicBytes(TEXT, "image/png")).toBe(false);
    expect(matchesMagicBytes(PNG, "image/jpeg")).toBe(false);
    expect(matchesMagicBytes(JPEG, "application/pdf")).toBe(false);
    // RIFF container that is not WebP (e.g. WAV).
    const wav = Uint8Array.from([
      ...new TextEncoder().encode("RIFF"),
      0x24, 0x00, 0x00, 0x00,
      ...new TextEncoder().encode("WAVE"),
    ]);
    expect(matchesMagicBytes(wav, "image/webp")).toBe(false);
  });

  test("rejects unknown mimes and truncated files", () => {
    expect(matchesMagicBytes(PNG, "image/tiff")).toBe(false);
    expect(matchesMagicBytes(PNG.slice(0, 2), "image/png")).toBe(false);
    expect(matchesMagicBytes(new Uint8Array(0), "application/pdf")).toBe(false);
  });
});
