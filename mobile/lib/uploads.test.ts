import { imageUploadPart } from "@/lib/uploads";

/**
 * The backend identifies an upload by its multipart filename extension and Content-Type, so a
 * malformed part fails as a confusing 422 rather than an obvious upload error. These pin the
 * derivation rather than trusting call sites to get it right.
 */
describe("imageUploadPart", () => {
  it("builds a native file descriptor, not a Blob", () => {
    const part = imageUploadPart("file:///tmp/IMG_0001.jpg");
    expect(part).toEqual({
      uri: "file:///tmp/IMG_0001.jpg",
      name: "IMG_0001.jpg",
      type: "image/jpeg",
    });
  });

  it("preserves HEIC rather than mislabelling it as JPEG", () => {
    // iPhone cameras shoot HEIC by default and the backend converts it with pillow-heif
    // (CLAUDE.md #12). Claiming JPEG makes that conversion skip and extraction fail later.
    const part = imageUploadPart("file:///tmp/IMG_0002.HEIC");
    expect(part).toMatchObject({ type: "image/heic", name: "IMG_0002.HEIC" });
  });

  it("honours an explicitly supplied mime type over the extension guess", () => {
    const part = imageUploadPart("file:///tmp/photo", "image/png");
    expect(part).toMatchObject({ type: "image/png" });
  });

  it("synthesises a name with a matching extension when the uri has none", () => {
    // Picker URIs are frequently opaque cache paths; the part still needs a usable filename.
    const part = imageUploadPart("file:///var/mobile/cache/ABC-123", "image/png");
    expect(part).toMatchObject({ name: "receipt.png", type: "image/png" });
  });

  it("ignores a query string when deriving name and type", () => {
    const part = imageUploadPart("file:///tmp/IMG_3.png?width=100");
    expect(part).toMatchObject({ name: "IMG_3.png", type: "image/png" });
  });

  it("falls back to jpeg for an unrecognised extension", () => {
    const part = imageUploadPart("file:///tmp/scan.bin");
    expect(part).toMatchObject({ type: "image/jpeg" });
  });
});
