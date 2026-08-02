import { afterEach, describe, expect, it, vi } from "vitest";

import { onRequest, onRequestPost } from "./waitlist";

const ENV = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://trackit.pages.dev/api/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function mockSupabase(status: number) {
  const spy = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => "",
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/waitlist", () => {
  it("inserts a normalized email and returns 201", async () => {
    const supabase = mockSupabase(201);

    const response = await onRequestPost({
      request: post({ email: "  Rohan@Example.COM " }, { referer: "https://trackit.dev/" }),
      env: ENV,
    });

    expect(response.status).toBe(201);
    const [url, init] = supabase.mock.calls[0];
    expect(url).toBe("https://project.supabase.co/rest/v1/waitlist_signups");
    expect(init.headers.apikey).toBe("service-role-key");
    expect(JSON.parse(init.body)).toMatchObject({
      email: "rohan@example.com",
      referrer: "https://trackit.dev/",
    });
  });

  it("rejects a malformed email before calling Supabase", async () => {
    const supabase = mockSupabase(201);

    const response = await onRequestPost({ request: post({ email: "nope" }), env: ENV });

    expect(response.status).toBe(400);
    expect(supabase).not.toHaveBeenCalled();
  });

  it("rejects an over-long email", async () => {
    const supabase = mockSupabase(201);
    const email = `${"a".repeat(250)}@example.com`;

    const response = await onRequestPost({ request: post({ email }), env: ENV });

    expect(response.status).toBe(400);
    expect(supabase).not.toHaveBeenCalled();
  });

  it("swallows honeypot submissions without writing a row", async () => {
    const supabase = mockSupabase(201);

    const response = await onRequestPost({
      request: post({ email: "bot@example.com", company: "Acme" }),
      env: ENV,
    });

    expect(response.status).toBe(201);
    expect(supabase).not.toHaveBeenCalled();
  });

  it("passes a unique violation through as 409", async () => {
    mockSupabase(409);

    const response = await onRequestPost({
      request: post({ email: "rohan@example.com" }),
      env: ENV,
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: true, alreadyJoined: true });
  });

  it("returns 502 when Supabase errors", async () => {
    mockSupabase(500);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await onRequestPost({
      request: post({ email: "rohan@example.com" }),
      env: ENV,
    });

    expect(response.status).toBe(502);
  });

  it("returns 503 when the env vars are missing rather than leaking a stack", async () => {
    const supabase = mockSupabase(201);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await onRequestPost({
      request: post({ email: "rohan@example.com" }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      env: { SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" } as any,
    });

    expect(response.status).toBe(503);
    expect(supabase).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    mockSupabase(201);
    const request = new Request("https://trackit.pages.dev/api/waitlist", {
      method: "POST",
      body: "{not json",
    });

    expect((await onRequestPost({ request, env: ENV })).status).toBe(400);
  });

  it("answers non-POST methods with 405", async () => {
    const request = new Request("https://trackit.pages.dev/api/waitlist", { method: "GET" });

    const response = await onRequest({ request, env: ENV });

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });
});
