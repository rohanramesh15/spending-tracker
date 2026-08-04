import * as ImagePicker from "expo-image-picker";

import ScanScreen from "@/app/(tabs)/scan";
import { fireEvent, mutation, query, renderScreen, screen, waitFor } from "@/test-screen";

jest.mock("expo-router", () => ({ useRouter: () => ({ replace: jest.fn(), back: jest.fn() }) }));
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const mockHooks = { useExtractReceipt: jest.fn(), useIngest: jest.fn(), useCategories: jest.fn() };
jest.mock("@shared/api/hooks", () => ({
  useExtractReceipt: () => mockHooks.useExtractReceipt(),
  useIngest: () => mockHooks.useIngest(),
  useCategories: () => mockHooks.useCategories(),
}));

const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;

const draft = {
  vendor: "Kroger",
  purchased_on: "2026-03-02",
  tax_cents: 212,
  tip_cents: 0,
  line_items: [{ raw_name: "MILK", price_cents: 349, category_id: "c1" }],
  raw_extraction_json: { any: "thing" },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockHooks.useExtractReceipt.mockReturnValue(mutation({ mutateAsync: jest.fn().mockResolvedValue(draft) }));
  mockHooks.useIngest.mockReturnValue(mutation({ mutateAsync: jest.fn().mockResolvedValue({ status: "created" }) }));
  mockHooks.useCategories.mockReturnValue(query({ data: [{ id: "c1", name: "Food and Drinks" }] }));
  (picker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
  (picker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
});

describe("ScanScreen", () => {
  it("offers both camera and library", async () => {
    await renderScreen(<ScanScreen />);
    expect(screen.getByTestId("take-photo")).toBeTruthy();
    expect(screen.getByTestId("choose-photo")).toBeTruthy();
  });

  it("explains a denied camera permission instead of failing silently", async () => {
    (picker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
    await renderScreen(<ScanScreen />);
    await fireEvent.press(screen.getByTestId("take-photo"));

    await waitFor(() => expect(screen.getByTestId("error-state")).toBeTruthy());
    expect(screen.getByText(/Camera access is needed/)).toBeTruthy();
  });

  it("treats backing out of the camera as a non-event", async () => {
    (picker.launchCameraAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
    await renderScreen(<ScanScreen />);
    await fireEvent.press(screen.getByTestId("take-photo"));

    await waitFor(() => expect(picker.launchCameraAsync).toHaveBeenCalled());
    expect(screen.queryByTestId("error-state")).toBeNull();
    expect(screen.getByTestId("take-photo")).toBeTruthy();
  });

  it("always lands on an editable confirm screen — never saves straight from extraction", async () => {
    // Trust-but-verify (CLAUDE.md #7): extraction output must be reviewable before it's stored.
    const ingestMutate = jest.fn();
    mockHooks.useIngest.mockReturnValue(mutation({ mutateAsync: ingestMutate }));
    (picker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/r.jpg", mimeType: "image/jpeg" }],
    });

    await renderScreen(<ScanScreen />);
    await fireEvent.press(screen.getByTestId("take-photo"));

    await waitFor(() => expect(screen.getByText("Check the details")).toBeTruthy());
    expect(screen.getByTestId("scan-vendor").props.value).toBe("Kroger");
    expect(ingestMutate).not.toHaveBeenCalled();
  });

  it("carries the extraction record but not the photo when saving", async () => {
    // The photo is deleted server-side on confirm; raw_extraction_json is the permanent record.
    const ingestMutate = jest.fn().mockResolvedValue({ status: "created" });
    mockHooks.useIngest.mockReturnValue(mutation({ mutateAsync: ingestMutate }));
    (picker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/r.jpg", mimeType: "image/jpeg" }],
    });

    await renderScreen(<ScanScreen />);
    await fireEvent.press(screen.getByTestId("take-photo"));
    await waitFor(() => expect(screen.getByTestId("scan-save")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("scan-save"));

    await waitFor(() => expect(ingestMutate).toHaveBeenCalled());
    const payload = ingestMutate.mock.calls[0][0];
    expect(payload.source).toBe("receipt");
    expect(payload.raw_extraction_json).toEqual({ any: "thing" });
    expect(JSON.stringify(payload)).not.toContain("file:///tmp/r.jpg");
  });

  it("reports an extraction failure with a way to retry", async () => {
    mockHooks.useExtractReceipt.mockReturnValue(
      mutation({ mutateAsync: jest.fn().mockRejectedValue(new Error("Couldn't read that")) }),
    );
    (picker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/r.jpg", mimeType: "image/jpeg" }],
    });

    await renderScreen(<ScanScreen />);
    await fireEvent.press(screen.getByTestId("take-photo"));

    await waitFor(() => expect(screen.getByText("Couldn't read that")).toBeTruthy());
    expect(screen.getByText("Try again")).toBeTruthy();
  });
});
