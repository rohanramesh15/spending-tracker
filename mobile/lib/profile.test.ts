import type { Session } from "@supabase/supabase-js";
import { avatarUrlFrom, displayNameFrom, firstNameFrom } from "@/lib/profile";

function session(metadata: Record<string, unknown>, email = "rohan.ramesh@example.com") {
  return { user: { email, user_metadata: metadata } } as unknown as Session;
}

describe("displayNameFrom", () => {
  it("prefers full_name", () => {
    expect(displayNameFrom(session({ full_name: "Rohan Ramesh", name: "R" }))).toBe("Rohan Ramesh");
  });

  it("falls back to name, which some Google accounts use instead", () => {
    expect(displayNameFrom(session({ name: "Rohan Ramesh" }))).toBe("Rohan Ramesh");
  });

  it("falls back to the email's local part when there is no name at all", () => {
    expect(displayNameFrom(session({}))).toBe("rohan.ramesh");
  });

  it("returns undefined when signed out", () => {
    expect(displayNameFrom(null)).toBeUndefined();
  });

  it("ignores a non-string name rather than rendering '[object Object]'", () => {
    expect(displayNameFrom(session({ full_name: { given: "Rohan" } }))).toBe("rohan.ramesh");
  });
});

describe("firstNameFrom", () => {
  it("takes only the first word", () => {
    // "Good morning, Rohan Ramesh" reads like a form letter.
    expect(firstNameFrom(session({ full_name: "Rohan Ramesh" }))).toBe("Rohan");
  });

  it("handles a single-word name", () => {
    expect(firstNameFrom(session({ full_name: "Prince" }))).toBe("Prince");
  });

  it("is undefined when signed out, so callers can greet without a name", () => {
    expect(firstNameFrom(null)).toBeUndefined();
  });

  it("is undefined rather than empty for a whitespace-only name", () => {
    expect(firstNameFrom(session({ full_name: "   " }))).toBe("rohan.ramesh");
  });
});

describe("avatarUrlFrom", () => {
  it("reads avatar_url, then picture", () => {
    expect(avatarUrlFrom(session({ avatar_url: "a.png" }))).toBe("a.png");
    expect(avatarUrlFrom(session({ picture: "b.png" }))).toBe("b.png");
  });

  it("is undefined when the identity supplied no image", () => {
    expect(avatarUrlFrom(session({}))).toBeUndefined();
  });
});
