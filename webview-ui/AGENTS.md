# Webview UI Instructions

These instructions apply to `webview-ui/**` and supplement the repository root instructions.

Webview code renders data that may originate from workspaces, companion services, A2A registries or public Agent Cards.

## Rendering boundary

- Treat all incoming data as untrusted presentation data.
- Do not use `dangerouslySetInnerHTML` for external/project data.
- Never embed secrets, bearer tokens, raw JWK/signature material or sensitive private paths in the DOM.
- Keep outbound messages narrow and typed; the extension host remains responsible for authorization and side effects.
- Do not move network access, SecretStorage behavior or privileged VS Code operations into the webview.

## CSP and assets

The extension host owns CSP/nonces and allowed resource roots. Webview bundles must remain compatible with the nonce-only script policy and local bundled assets.

Do not add remote scripts, dynamic code execution or runtime CDN dependencies.

## Accessibility and UX

- Preserve keyboard navigation, readable labels, empty/error/loading states and VS Code theme compatibility.
- Security/trust state labels must not overstate guarantees; for example, a cryptographically verified Agent Card is not automatically a trusted organization.
- User-visible changes require focused component/webview tests and accessibility review.
