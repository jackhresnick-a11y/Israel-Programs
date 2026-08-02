import { describe, it, expect } from "vitest";
import { buildShareMessage, buildWhatsAppHref } from "./pollShare";

describe("buildShareMessage", () => {
  it("direct variant names the program", () => {
    expect(buildShareMessage("Yeshivat Example", "direct")).toContain("Yeshivat Example");
  });

  it("generic variant names the program and does not promise a specific pre-filled link", () => {
    const msg = buildShareMessage("Yeshivat Example", "generic");
    expect(msg).toContain("Yeshivat Example");
  });

  it("handles a Hebrew program name and an em dash without throwing", () => {
    const msg = buildShareMessage("ישיבת הכותל — Example", "direct");
    expect(msg).toContain("ישיבת הכותל — Example");
  });
});

describe("buildWhatsAppHref", () => {
  it("starts with the wa.me deep-link prefix", () => {
    const href = buildWhatsAppHref("hello", "https://israelprogramswiki.com/rate/x?ref=y");
    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
  });

  it("round-trips message and URL through encodeURIComponent/decodeURIComponent", () => {
    const message = "Line one\nwith & special # chars";
    const url = "https://israelprogramswiki.com/rate/x?ref=y";
    const href = buildWhatsAppHref(message, url);
    const encoded = href.slice("https://wa.me/?text=".length);
    const decoded = decodeURIComponent(encoded);
    expect(decoded).toBe(`${message}\n${url}`);
  });

  it("encodes a Hebrew program name and an em dash cleanly", () => {
    const message = buildShareMessage("ישיבת הכותל — Example", "direct");
    const url = "https://israelprogramswiki.com/rate/x?ref=y";
    const href = buildWhatsAppHref(message, url);
    const decoded = decodeURIComponent(href.slice("https://wa.me/?text=".length));
    expect(decoded).toBe(`${message}\n${url}`);
  });
});
