import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WaitlistForm } from "./WaitlistForm";

function mockFetch({ status, ...rest }: { status: number; json?: () => Promise<unknown> }) {
  const spy = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
    ...rest,
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("WaitlistForm", () => {
  it("rejects a malformed email without hitting the network", async () => {
    const fetchSpy = mockFetch({ status: 201 });
    const user = userEvent.setup();
    render(<WaitlistForm />);

    await user.type(screen.getByLabelText(/email address/i), "not-an-email");
    await user.click(screen.getByRole("button", { name: /join the waitlist/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/doesn't look like an email/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts the email and shows the confirmation on success", async () => {
    const fetchSpy = mockFetch({ status: 201 });
    const user = userEvent.setup();
    render(<WaitlistForm />);

    await user.type(screen.getByLabelText(/email address/i), "rohan@example.com");
    await user.click(screen.getByRole("button", { name: /join the waitlist/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/waitlist");
    expect(JSON.parse(init.body)).toEqual({ email: "rohan@example.com", company: "" });

    expect(await screen.findByRole("status")).toHaveTextContent(/you're on the list/i);
  });

  it("treats a duplicate signup as success, not an error", async () => {
    mockFetch({ status: 409 });
    const user = userEvent.setup();
    render(<WaitlistForm />);

    await user.type(screen.getByLabelText(/email address/i), "rohan@example.com");
    await user.click(screen.getByRole("button", { name: /join the waitlist/i }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/you're on the list/i);
    expect(status).toHaveTextContent(/already on the list/i);
  });

  it("surfaces a server failure and keeps the form usable", async () => {
    mockFetch({ status: 502, json: async () => ({ error: "Couldn't save that." }) });
    const user = userEvent.setup();
    render(<WaitlistForm />);

    await user.type(screen.getByLabelText(/email address/i), "rohan@example.com");
    await user.click(screen.getByRole("button", { name: /join the waitlist/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't save that/i);
    expect(screen.getByRole("button", { name: /join the waitlist/i })).toBeEnabled();
  });

  it("clears the error once the user starts correcting the address", async () => {
    mockFetch({ status: 201 });
    const user = userEvent.setup();
    render(<WaitlistForm />);

    const input = screen.getByLabelText(/email address/i);
    await user.type(input, "bad");
    await user.click(screen.getByRole("button", { name: /join the waitlist/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await user.type(input, "x");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
