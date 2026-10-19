# Web Push from the `home` PWA behind Tailscale

Research for [#121](https://github.com/myOmikron/code/issues/121) (map [#118](https://github.com/myOmikron/code/issues/118)).
Question: can the `home` PWA deliver Reminder notifications reliably when the service is reachable only via Tailscale?

Short answer: yes. Web Push never needs the phone to reach the Pi. The Pi needs outbound internet to the browser vendors' push services. A `*.ts.net` name with a Let's Encrypt cert from Tailscale is a normal HTTPS origin: the service worker installs and passkeys work. The parts that need Tailscale are opening the app and acknowledging a Reminder, not receiving the notification.

Sources were checked on 2026-10-19. Context7 MCP wasn't available in this session, so the library facts come from crates.io, docs.rs and the crates' source code.

## 1. HTTPS origin on the tailnet

- **Certificates.** `tailscale cert` gets a Let's Encrypt certificate for the machine's MagicDNS name (`<machine>.<tailnet>.ts.net`). Tailscale completes the DNS-01 challenge by creating a TXT record under `ts.net`. The private key is generated locally and Tailscale never sees it. Prerequisites: MagicDNS on, and HTTPS enabled in the admin console's DNS page. [Tailscale: Enabling HTTPS](https://tailscale.com/kb/1153/enabling-https)
- **Privacy cost.** Every issued cert goes into the public Certificate Transparency logs with the machine's full name. Tailscale says: "Do not enable the HTTPS feature if any of your machine names contain sensitive information." [same](https://tailscale.com/kb/1153/enabling-https)
- **Renewal depends on how the cert is consumed:**
  - Certs written to files with `tailscale cert --cert-file/--key-file`: "you are responsible for renewing any certificates that you create using `tailscale cert`" (90-day Let's Encrypt lifetime). `--min-validity` asks for a cert with at least that much validity left, so a cron or systemd timer that re-runs the command handles renewal. [Tailscale CLI](https://tailscale.com/kb/1080/cli)
  - `tailscale serve` (reverse proxy from `https://<machine>.<tailnet>.ts.net` to a local port, reachable only inside the tailnet) provisions the cert itself ([Tailscale Serve](https://tailscale.com/kb/1312/serve)). In the source, the serve TLS config fetches the cert per handshake through `GetCertPEM` ("either from the local cache or by issuing a new cert via ACME"), and a cert refresh loop runs while a serve config exists. So renewal is automatic, but the docs don't say so. [tailscale `ipn/ipnlocal/cert.go`](https://github.com/tailscale/tailscale/blob/4c4d1c35f83a21c6069ae09de69b246ed1993f3e/ipn/ipnlocal/cert.go)
  - Traefik has a built-in Tailscale certificate resolver (`certificatesResolvers.<name>.tailscale: {}`). It gets certs from the local Tailscale daemon and renews them 14 days before expiry, "matching the Tailscale daemon's renewal policy". [Traefik: Tailscale resolver](https://doc.traefik.io/traefik/reference/install-configuration/tls/certificate-resolvers/tailscale/)
  - Renewing too often can hit Let's Encrypt rate limits, which can mean waiting hours. [Tailscale: Enabling HTTPS](https://tailscale.com/kb/1153/enabling-https)
- **Service worker / secure context.** The cert is a publicly trusted Let's Encrypt cert, so the origin is an ordinary HTTPS secure context. Service workers, the Push API and WebAuthn all work there. Nothing in the sources treats `ts.net` specially.
- **Passkeys (`PUBLIC_ORIGIN` / `rp_id`).** `ts.net` is on the Public Suffix List, and `*.c.ts.net` is listed too ([PSL, "Tailscale Inc." section](https://publicsuffix.org/list/public_suffix_list.dat)). So `<tailnet>.ts.net` is the registrable domain. A passkey `rp_id` can be the full machine host or `<tailnet>.ts.net`, never `ts.net`. As CLAUDE.md notes, changing the host later (renaming the machine, renaming the tailnet, or moving to a custom domain) invalidates every registered passkey and every push subscription, since subscriptions are per origin.
- **Dependence on the internet.** Issuing and renewing a cert needs the Pi to reach Tailscale's control plane and Let's Encrypt. An expired cert breaks the PWA for everyone, even on the LAN.

## 2. Who needs to reach whom

- **The architecture (RFC 8030).** The browser (user agent) keeps its own connection to its vendor's push service. The application server, here the Pi, sends an HTTP `POST` to the subscription's push resource (endpoint URL) on that push service. The phone never connects to the application server to receive a push. [RFC 8030 §2, §5, §6](https://www.rfc-editor.org/rfc/rfc8030.html)
- **The browser picks the push service and the site can't change it.** "Your server doesn't actually send the push message directly to a client." [web.dev: Push notifications overview](https://web.dev/articles/push-notifications-overview)
  - iOS/iPadOS and Safari: Apple Push Notification service. If outbound traffic is filtered, "allow access for `https://*.push.apple.com`". [Apple: Sending web push notifications](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [WebKit blog](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
  - Chrome: endpoints on `fcm.googleapis.com` (Firebase Cloud Messaging). [web.dev](https://web.dev/articles/push-notifications-overview)
  - Firefox: Mozilla's autopush service. [autopush-rs architecture](https://mozilla-services.github.io/autopush-rs/architecture.html)
- **The Pi therefore needs outbound HTTPS to those hosts.** Tailscale plays no part in delivery. If the household internet is down, pushes can't go out. The service has to queue them and retry, or accept the loss.
- **A phone with Tailscale off, or with no connection, still gets the notification.** The push service holds the message for up to its `TTL`: "A push service MAY retain a push message for a shorter duration than requested." A message with `TTL: 0` is dropped if the device is unreachable. Stored messages are delivered once the user agent reconnects. [RFC 8030 §5.2, §7.2](https://www.rfc-editor.org/rfc/rfc8030.html) Apple stores messages for at most 30 days and limits how many it stores per offline device. [Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)
- **What needs Tailscale:** tapping the notification to open the PWA, and any `fetch` to the Pi, such as an "Acknowledge" action or loading Reminder details. Text that must be readable with Tailscale off has to be in the encrypted payload (max 4 KB at Apple: `PayloadTooLarge`).
  - iOS Tailscale's **VPN On Demand** can bring the tunnel up by itself. While Tailscale is enabled, a default policy keeps the VPN up after restarts and crashes. A rule can also connect "when a `*.ts.net` hostname is detected" (only if the interface rule is "Do Nothing"). Only one VPN app can use On Demand at a time. [Tailscale: VPN On Demand](https://tailscale.com/kb/1291/ios-vpn-on-demand)
  - An acknowledgement sent from a notification action while offline would need the service worker to queue it and send it later. That is a frontend design question, not a platform limit.

## 3. Platforms

### iOS / iPadOS

- **Minimum version: iOS/iPadOS 16.4**, and only for **Home Screen web apps**. The manifest needs `display: standalone` or `fullscreen`. The permission request must come from a direct user gesture, such as tapping a button. No Apple Developer Program membership is needed. [WebKit: Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers). MDN compat data agrees: `PushManager.subscribe` on Safari iOS since 16.4, with the note "Notifications are supported in web apps saved to the home screen." [@mdn/browser-compat-data 8.1.6](https://github.com/mdn/browser-compat-data)
- **No invisible pushes.** "Safari doesn't support invisible push notifications. Present push notifications to the user immediately after your service worker receives them. If you don't, Safari revokes the push notification permission for your site." [Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers) WebKit itself says this permission can be revoked "for any reason" (bugs, network or device conditions) that are "not always the fault of the script author". [WebKit: Meet Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/)
- **Declarative Web Push (iOS/iPadOS 18.4+).** The server sends JSON with `"web_push": 8030` and a `notification` object that has `title` and `navigate`. The OS shows it without running a service worker. If a service worker exists, it may replace the notification, and if it fails "there is no penalty". `window.pushManager` exists on Safari/Safari iOS 18.4 and not in Chrome or Firefox. Older browsers process the same message the usual way in their service worker, so one payload format can serve both. [WebKit](https://webkit.org/blog/16535/meet-declarative-web-push/), [MDN BCD `Window.pushManager`](https://github.com/mdn/browser-compat-data)
- **Storage eviction.** Safari's 7-day cap on script-writable storage covers "Service Worker registrations". Home Screen web apps "are not part of Safari": they have their own day counter, and WebKit would "consider it a serious bug" if their first-party data were deleted. [WebKit: Full Third-Party Cookie Blocking and More](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/) This is one more reason the Home Screen install is required.
- **Server-side rules from Apple:** VAPID public key must match the one used in `subscribe` (`VapidPkHashMismatch`). The JWT `sub` must be a URL or `mailto:`, `aud` must be the push service's origin, and `exp` can be at most 24 h ahead. Don't refresh the JWT more than once an hour. Payload limit is 4 KB. HTTP 410 means the subscription is gone and should be deleted. `Urgency: high` asks for immediate delivery. `Topic` (≤ 32 base64url chars) collapses superseded notifications. [Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)
- **EU (DMA).** In Feb 2024 Apple announced that iOS 17.4 would remove Home Screen web apps in the EU, then reversed the decision before release. They stay WebKit-based. Sources are secondary press reports ([Engadget](https://www.engadget.com/apple-backtracks-on-plans-to-get-rid-of-web-apps-on-iphones-in-the-eu-195232177.html)), because Apple's current DMA support page no longer mentions it. This is a policy risk for a household in Germany, not a current limitation.

### Android

- **Chrome Android: since 42.** Push and notifications work in a normal tab, and installing the PWA isn't required. `subscribe` must pass `applicationServerKey` (VAPID). Samsung Internet works the same way. Android WebView has no push. [MDN BCD](https://github.com/mdn/browser-compat-data)
- **Firefox Android: since 48 (`PushManager`).** Since 79, `subscribe` must be called from a user gesture. [MDN BCD](https://github.com/mdn/browser-compat-data) Firefox limits pushes that don't show a notification (a quota), while pushes that show one are exempt. Chrome has no such limit. [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- With the browser closed, the service worker "will be started as necessary to handle incoming push messages" [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API). What the OS does under Doze or vendor battery savers is not covered by the sources read here.

## 4. Protocol and a Rust crate

- **Standards:** RFC 8030 (transport, `TTL`/`Urgency`/`Topic`), [RFC 8291](https://www.rfc-editor.org/rfc/rfc8291.html) (payload encryption: ECDH P-256 plus the subscription's `auth` secret, `Content-Encoding: aes128gcm` per [RFC 8188](https://www.rfc-editor.org/rfc/rfc8188.html)), and [RFC 8292](https://www.rfc-editor.org/rfc/rfc8292.html) (VAPID: ES256 JWT in `Authorization: vapid t=…, k=…`). The server stores, per subscription, the `endpoint`, `p256dh` and `auth` from `PushSubscription`. The Pi keeps one VAPID key pair for the life of the origin.
- **[`web-push-native`](https://crates.io/crates/web-push-native) 0.5.0** (2026-07-26; MIT/Apache-2.0; MSRV 1.87; [repo](https://github.com/leotaku/web-push-native)):
  - `WebPushBuilder::new(endpoint, p256dh, auth).with_vapid(&es256_keypair, "mailto:…").build(body)` returns an `http::Request<Vec<u8>>` (http 1.x) with `TTL` and `Content-Encoding: aes128gcm` set. The crate doesn't send anything.
  - Pure RustCrypto (`p256`, `aes-gcm`, `hkdf`, `ece-native`; `jwt-simple` with `pure-rust`), so no OpenSSL. It fits the musl static build and the workspace's `reqwest` (rustls) for sending.
  - `Urgency`/`Topic` are not in the builder, so the caller adds them to the request.
  - [docs.rs](https://docs.rs/web-push-native/0.5.0/web_push_native/), [source](https://github.com/leotaku/web-push-native/blob/master/web_push/src/lib.rs)
- **[`web-push`](https://crates.io/crates/web-push) 0.11.0** (2025-02-22; Apache-2.0; [repo](https://github.com/pimeys/rust-web-push), last commit 2026-01):
  - More downloads, and it sends the request itself through `isahc` (default) or `hyper` 0.14 + `hyper-tls`.
  - It depends on `ece` with default features, which pulls `openssl` (`backend-openssl`), and on `http` 0.2.
  - Older HTTP stack, OpenSSL, and a duplicate `http` major version next to the workspace's.
  - [Cargo.toml](https://github.com/pimeys/rust-web-push/blob/master/Cargo.toml), [ece features](https://crates.io/crates/ece)

## 5. Frontend side (vite-plugin-pwa)

- The existing apps (`frontend/mtg`, `frontend/semmelei`) use vite-plugin-pwa's default `generateSW` strategy. A push handler (`push`, `notificationclick`) needs custom service worker code. One option is `strategies: 'injectManifest'` with `srcDir`/`filename` pointing at your own SW, into which the plugin injects the precache manifest ([vite-plugin-pwa: injectManifest](https://vite-pwa-org.netlify.app/guide/inject-manifest)). The other is Workbox `generateSW`'s `importScripts` option. The CLAUDE.md rule "`/api` NetworkOnly" still applies.
- With Declarative Web Push, iOS 18.4+ shows the notification even if the SW code fails. Older iOS and Android still depend on the SW calling `showNotification`.

## 6. Fallbacks if Web Push is unworkable

| Option | Reaches a phone with Tailscale off? | Third party in the path | Notes |
| --- | --- | --- | --- |
| **ntfy, self-hosted on the Pi** | Android: only if the ntfy app can reach the server, which is behind Tailscale. Hosts other than ntfy.sh "use instant delivery and FCM is not involved", and without FCM the app needs a foreground service. iOS: needs `upstream-base-url: https://ntfy.sh`. Then ntfy.sh relays a poll request through APNs with only the message ID and a SHA-256 of the topic URL, the phone shows "New message", and it must fetch the content from your server (Tailscale needed). Without the upstream, iOS delivery "can take hours". | ntfy.sh plus APNs (iOS), none on Android | A separate app. Content isn't shown on iOS without Tailscale. [ntfy config docs](https://docs.ntfy.sh/config/) |
| **Matrix (self-hosted homeserver)** | The homeserver POSTs to a push gateway (`/_matrix/push/v1/notify`), which forwards to APNs/FCM. With the stock Element apps that gateway is the vendor's. With `event_id_only` the payload has only IDs, so the client must reach the homeserver (Tailscale needed) to show content. | Push gateway operator plus APNs/FCM | A whole homeserver to run on the Pi for one notification channel. [Matrix Push Gateway API](https://spec.matrix.org/latest/push-gateway-api/) |
| **Telegram bot** | Yes. The Pi calls Telegram's cloud API outbound and the message arrives with the full text. | Telegram (cloud chats are server-client encrypted; only secret chats are end-to-end, and bots don't use them) | Message content is stored on Telegram's servers. Acknowledging works through bot buttons, with no Tailscale needed. [Telegram FAQ](https://telegram.org/faq) |

Web Push already has the property that ntfy and Matrix lose behind Tailscale: the text arrives without the tunnel. Its third parties are only APNs/FCM/Mozilla, and they see just the RFC 8291 ciphertext.

## Implications for the decision

- Tailscale-only reachability doesn't block Web Push. What blocks it is the Pi having no outbound internet. "Lights and heating work offline" holds, but notifications need internet to go out, so the service has to decide how to handle queued or failed sends.
- The `PUBLIC_ORIGIN` choice is sticky. Passkeys and push subscriptions are both tied to the `*.ts.net` host, so pick the machine and tailnet names before anyone registers. Every cert puts the machine name into public CT logs.
- How TLS is terminated decides whether renewal is automatic: `tailscale serve` and the Traefik Tailscale resolver renew by themselves, while file certs from `tailscale cert` need a timer.
- iOS users must install the PWA to the Home Screen (iOS 16.4+, 18.4+ for Declarative Web Push). Onboarding should handle this before asking for notification permission. The permission prompt must come from a tap.
- Acknowledging a Reminder needs the Pi, so Tailscale must be up. Options include iOS VPN On Demand, SW-queued acknowledgements, or accepting that acknowledgement waits until the user is on the tailnet. This interacts with the Reminder "re-notify until acknowledged" rule and with what goes into the 4 KB payload.
- `web-push-native` matches the workspace (http 1.x, rustls via reqwest, no OpenSSL), and `web-push` is the better-known but older-stack alternative.
- The frontend needs a custom service worker (`injectManifest` or `importScripts`), which differs from the existing apps' setup.
- If a fallback is wanted, only Telegram delivers readable text without Tailscale and without Web Push, at the cost of message content on Telegram's servers.
