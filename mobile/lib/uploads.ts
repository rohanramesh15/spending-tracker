import type { UploadFilePart } from "@shared/api/client";

/**
 * Turn a picked/captured image into a multipart file part for the backend.
 *
 * React Native cannot produce a browser `File`: media lives on disk and FormData streams it
 * from a `{ uri, name, type }` descriptor. All three fields matter —
 *  - `uri` is the on-device path from expo-image-picker / expo-camera,
 *  - `name` becomes the multipart filename, and its EXTENSION is what FastAPI/Starlette and the
 *    backend's Pillow normalisation use to identify the format,
 *  - `type` is the part's Content-Type.
 * Omitting name or type yields a part the backend rejects, which surfaces as a confusing 422
 * rather than an upload error, so they're derived rather than left to the caller.
 */
export function imageUploadPart(uri: string, mimeType?: string | null): UploadFilePart {
  const type = mimeType ?? guessMimeType(uri);
  return { uri, name: fileNameFor(uri, type), type };
}

/**
 * HEIC matters here: iPhone cameras produce it by default, and the backend converts HEIC→JPEG
 * with pillow-heif (CLAUDE.md #12). Reporting it honestly lets that path run; mislabelling a
 * HEIC as JPEG makes the conversion silently skip and the extraction fail on an unreadable image.
 */
function guessMimeType(uri: string): string {
  const ext = uri.split("?")[0].split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    case "webp":
      return "image/webp";
    default:
      return "image/jpeg";
  }
}

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/webp": "webp",
};

/**
 * Use the URI's own filename when it has one, otherwise synthesise a name with an extension
 * matching the declared type. Picker URIs are often opaque cache paths with no usable name.
 */
function fileNameFor(uri: string, type: string): string {
  const last = uri.split("?")[0].split("/").pop() ?? "";
  if (last.includes(".")) return last;
  return `receipt.${EXTENSION_BY_TYPE[type] ?? "jpg"}`;
}
