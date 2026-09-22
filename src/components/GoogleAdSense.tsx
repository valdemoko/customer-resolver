/**
 * GoogleAdSense — loader for the AdSense tag, rendered only when configured.
 *
 * What this is
 * ------------
 * The client library Google asks you to include on every page once the
 * publisher account is active:
 *
 *   <script async
 *     src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-…">
 *   </script>
 *
 * plus the `google-adsense-account` verification meta tag, which associates the
 * domain with the AdSense account.
 *
 * What this deliberately does NOT do
 * ----------------------------------
 *  - No client ID is invented here. The whole value comes from
 *    `NEXT_PUBLIC_ADSENSE_CLIENT`, copied from the AdSense console. Until that
 *    variable is set, this renders nothing — the honest state of a site that
 *    shows no ads (ads.txt identifies the domain; it does not load anything).
 *  - It does not insert ad units, and it does not handle consent. Consent in
 *    the EEA/UK/Switzerland is owned by the certified CMP
 *    (`GoogleConsentCmp`): enable AdSense only when that CMP is configured and
 *    the advertising activation is intentional.
 */
import { createElement } from "react";

/**
 * Publisher IDs look like `ca-pub-1097809642955447`. The value is pasted by
 * hand, so the check is a guard against a typo silently loading a third-party
 * script on every page — not a substitute for copying it exactly.
 */
const CLIENT_PATTERN = /^ca-pub-\d{10,20}$/;

export function isValidAdSenseClient(client: string): boolean {
  return CLIENT_PATTERN.test(client.trim());
}

interface GoogleAdSenseProps {
  /**
   * Full AdSense client ID (`ca-pub-…`). When absent or malformed the
   * component renders nothing, so an unconfigured environment never ships a
   * broken or partial tag.
   */
  readonly client?: string | null;
}

/** `createElement` instead of JSX so the guard stays unit-testable without a DOM. */
export function GoogleAdSense({ client }: GoogleAdSenseProps) {
  const id = client?.trim();
  if (!id || !isValidAdSenseClient(id)) return null;

  return createElement("script", {
    async: true,
    src: `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${id}`,
  });
}
