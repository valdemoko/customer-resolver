/**
 * GoogleAdSense tag tests.
 *
 * Pins what is accepted and what is refused: the client ID is pasted by hand
 * into an env var, so a typo must render nothing instead of loading a
 * third-party script on every page of the site.
 */
import { describe, expect, it } from "vitest";
import { GoogleAdSense, isValidAdSenseClient } from "@/components/GoogleAdSense";

describe("isValidAdSenseClient", () => {
  it("accepts a well-formed publisher client", () => {
    expect(isValidAdSenseClient("ca-pub-1097809642955447")).toBe(true);
  });

  it("accepts a client with surrounding whitespace", () => {
    expect(isValidAdSenseClient("  ca-pub-1234567890123456  ")).toBe(true);
  });

  it("refuses the ads.txt form (pub-…) — the script needs ca-pub-…", () => {
    expect(isValidAdSenseClient("pub-1097809642955447")).toBe(false);
  });

  it("refuses non-numeric or empty ids", () => {
    expect(isValidAdSenseClient("ca-pub-abcdefghij")).toBe(false);
    expect(isValidAdSenseClient("")).toBe(false);
  });

  it("refuses a script URL pasted by mistake", () => {
    expect(
      isValidAdSenseClient("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"),
    ).toBe(false);
  });
});

describe("GoogleAdSense", () => {
  it("renders nothing when unset or invalid", () => {
    expect(GoogleAdSense({ client: undefined })).toBeNull();
    expect(GoogleAdSense({ client: null })).toBeNull();
    expect(GoogleAdSense({ client: "" })).toBeNull();
    expect(GoogleAdSense({ client: "pub-123" })).toBeNull();
  });

  it("renders the client library for a valid id", () => {
    const tag = GoogleAdSense({ client: "ca-pub-1234567890123456" }) as {
      type: string;
      props: { src: string; async: boolean };
    };
    expect(tag.type).toBe("script");
    expect(tag.props.async).toBe(true);
    expect(tag.props.src).toBe(
      "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1234567890123456",
    );
  });
});
