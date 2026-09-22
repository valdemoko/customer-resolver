/**
 * Google Privacy & Messaging CMP tag tests.
 *
 * The tag is configured by hand in an environment variable, so the guard is the
 * only thing standing between a typo and a third-party script loaded on every
 * page. These tests pin what is accepted and what is refused, and — more
 * importantly — that an unconfigured environment renders no tag at all instead
 * of a placeholder.
 */
import { describe, expect, it } from "vitest";

import { GoogleConsentCmp, isValidCmpSrc } from "@/components/GoogleConsentCmp";

describe("GoogleConsentCmp", () => {
  it("accepts the URL shape Google generates", () => {
    expect(
      isValidCmpSrc("https://fundingchoicesmessages.google.com/i/123456789012345?ers=1"),
    ).toBe(true);
    expect(isValidCmpSrc("https://www.google.com/something")).toBe(true);
  });

  it("refuses anything that is not https on Google", () => {
    expect(isValidCmpSrc("http://fundingchoicesmessages.google.com/i/1")).toBe(false);
    expect(isValidCmpSrc("https://fundingchoicesmessages.google.com.evil.test/i/1")).toBe(
      false,
    );
    expect(isValidCmpSrc("https://example.com/cmp.js")).toBe(false);
    expect(isValidCmpSrc("javascript:alert(1)")).toBe(false);
    expect(isValidCmpSrc("/i/placeholder")).toBe(false);
    expect(isValidCmpSrc("")).toBe(false);
  });

  it("renders nothing while the CMP is not configured", () => {
    expect(GoogleConsentCmp({ src: undefined })).toBeNull();
    expect(GoogleConsentCmp({ src: null })).toBeNull();
    expect(GoogleConsentCmp({ src: "   " })).toBeNull();
    // A malformed value is ignored rather than shipped to every visitor.
    expect(GoogleConsentCmp({ src: "https://example.com/cmp.js" })).toBeNull();
    expect(GoogleConsentCmp({ src: "https://fundingchoicesmessages.google.com/i/x" })).not.toBeNull();
  });
});
