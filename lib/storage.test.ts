import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Vercel Blob client so no real upload happens. put() echoes back a
// realistic public URL derived from the pathname it was handed (with the random
// suffix the real client would add), which is enough to assert saveLogo's
// return shape and that validation runs before any upload.
const mockPut = vi.fn();
vi.mock("@vercel/blob", () => ({
  put: (pathname: string, body: unknown, options: unknown) => mockPut(pathname, body, options),
}));

const { saveLogo, UploadError } = await import("./storage");

function fakeFile(name: string, type: string, sizeBytes: number): File {
  // A File whose reported .size is sizeBytes without allocating that many bytes.
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

beforeEach(() => {
  mockPut.mockReset();
  mockPut.mockImplementation(async (pathname: string) => {
    const suffixed = pathname.replace(/(\.[^.]+)$/, "-Abc123XyZ$1");
    return {
      url: `https://sz5bagoqkjthunqm.public.blob.vercel-storage.com/${suffixed}`,
      pathname: suffixed,
      contentType: "image/png",
      contentDisposition: "inline",
    };
  });
});

describe("saveLogo", () => {
  it("uploads a valid PNG to Blob with public access + random suffix, returning the public URL", async () => {
    const result = await saveLogo(fakeFile("mylogo.png", "image/png", 1024));

    expect(mockPut).toHaveBeenCalledTimes(1);
    const [pathname, , options] = mockPut.mock.calls[0];
    expect(pathname).toBe("logos/mylogo.png");
    expect(options).toMatchObject({ access: "public", addRandomSuffix: true, contentType: "image/png" });

    expect(result.url).toMatch(/^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/logos\/mylogo-Abc123XyZ\.png$/);
    expect(result.filename).toBe("mylogo-Abc123XyZ.png");
    expect(result.mimeType).toBe("image/png");
  });

  it("accepts JPEG and WebP", async () => {
    await expect(saveLogo(fakeFile("a.jpg", "image/jpeg", 100))).resolves.toBeDefined();
    await expect(saveLogo(fakeFile("b.webp", "image/webp", 100))).resolves.toBeDefined();
    expect(mockPut).toHaveBeenCalledTimes(2);
  });

  it("rejects an unsupported type (e.g. SVG) with UploadError and never uploads", async () => {
    await expect(saveLogo(fakeFile("evil.svg", "image/svg+xml", 100))).rejects.toBeInstanceOf(UploadError);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("rejects a file over 5MB with UploadError and never uploads", async () => {
    await expect(saveLogo(fakeFile("huge.png", "image/png", 5 * 1024 * 1024 + 1))).rejects.toBeInstanceOf(UploadError);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("allows a file exactly at the 5MB boundary", async () => {
    await expect(saveLogo(fakeFile("edge.png", "image/png", 5 * 1024 * 1024))).resolves.toBeDefined();
    expect(mockPut).toHaveBeenCalledTimes(1);
  });
});
