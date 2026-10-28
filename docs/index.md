# Hudson docs

Hudson is a shell + primitives library for building app-like interfaces across web, iOS, and macOS. These docs cover the architecture, shell contracts, and the primitive surface — web (`hudsonkit/*` subpaths) and Apple-native (`Hud*` Swift modules in HudsonKit).

## Start here

- **[Quickstart](./quickstart.md)** — mount `AppShell` with a minimal app in 5 minutes
- **[Overview](./overview.md)** — what Hudson is, the two shell modes, the `HudsonApp` contract
- **[Systems](./systems.md)** — Intents, Services, and Ports, including the runtime plumbing used by AI

## Web

- **[Building apps](./building-apps.md)** — the `HudsonApp` contract with walkthrough
- **[Building app AI](./building-app-ai.md)** — adding an AI surface to a Hudson app (toolset + hook pattern)
- **[API reference](./api.md)** — every `hudsonkit` export, organized by subpath
- **[Settings](./settings.md)** — declarative app-level settings schema with persisted values
- **[Multi-instance](./multi-instance.md)** — per-instance state scoping
- **[Systems](./systems.md)** — Intents (LLM/voice), Services (process deps), Ports (inter-app piping)
- **[Terminal](./terminal.md)** — terminal surfaces and the relay-backed runtime path
- **[Theming](./theming.md)** — runtime theme/template switching, token surface
- **[Theme Designer](./theme-designer.md)** — framework showcase for live HudsonKit tokens and templates
- **[Controls](./controls.md)** — parameter controls and code components for inspectors
- **[Cache](./cache.md)** — shared cache primitive (`hudsonkit/cache`) and the policy direction for API data, derived values, and asset metadata

## iOS apps

- **[iOS Shell](./ios-shell.md)** — `HudPhoneAppShell` + `HudPhoneComplications` (5-zone HUD, three render styles, long-press = alternative actions)
- **[Permissions](./permissions.md)** — `HudPermissionGate` for camera, microphone, photos, notifications
- **[QR Code](./qr.md)** — `HudQRCode` generation + `HudQRScanner`

## macOS apps

- **[macOS Shell](./macos-shell.md)** — `HudAppShell` anatomy: navigation rail/sidebar, inspector, canvas, command palette, drawers, takeover
- **[Native canvas workspace](./native-canvas-workspace.md)** — draft extraction spec for pan/zoom, selection, persistence, and workspace-hostable native apps
- **[tmux + Graphite workspaces](./tmux-graphite-workspaces.md)** — durable terminal identity, searchable path names, group actions, and offshoot canvases
- **[Native terminal canvas roadmap](./native-terminal-canvas-roadmap.md)** — phased implementation plan for sample hardening, canvas extraction, tmux orchestration, and offshoot workspaces
- **[Native terminal isolation](./native-terminal-isolation.md)** — Hudson-owned terminal core, XPC boundary and shared-frame migration gates
- **[Terminal](./terminal.md)** — `HudTerminalSurface` and local terminal runtime behavior

## Cross-platform primitives

- **[Vault](./vault.md)** — encrypted KV: Keychain on Apple, WebCrypto + IndexedDB on web
- **[AI](./ai.md)** — provider-neutral inference: Claude, OpenAI, OpenRouter
- **[Voice](./voice.md)** — voice input/output (web `hudsonkit/voice` + Apple `HudsonVoice`)
- **[Transcription adapters](./guides/transcription-adapters.md)** — shared Apple transcription contract, local and API engines, configuration, and extension points
- **[Transcription testing](./guides/transcription-adapter-testing.md)** — adapter checks, recorded acceptance, and remaining limitations
- **[Transcription configuration](./guides/transcription-configuration.md)** — serialized configuration reference and validated examples for agents and developers
- **[Observability](./observability.md)** — logs, metrics, traces (web `hudsonkit/observability` + Apple `HudsonObservability`)
- **[Table](./table.md)** — tabular data primitive on both surfaces
- **[Patterns](./patterns.md)** — optional app-interior rails, trees, grouped lists, cards, and context panels
- **[Admin resources](./admin-resources.md)** — schema-driven operator admin (Zod resources; not coupled to credits)
- **[Inference credits](./inference-credits.md)** — user-level credit ledger for TTS / ASR / LLM

## Design system

- **[Theme](./theme.md)** — runtime theming via `@Environment(\.hudTheme)`
- **[Theming (web)](./theming.md)** — see web theming above

## Tooling

- **[HudLint](./hudlint.md)** — compile-time drift guard for design tokens

## How it's made

- **[Architecture](./architecture.md)** — monorepo layout, data flow, key decisions
- **[Perf patterns](./perf-drag-resize-patterns.md)** — drag/resize/pan techniques used inside the shell
- **[CLI: terminal relay](./cli/relay.md)** — WebSocket-based terminal relay protocol

## For agents / LLMs

- **[Agent overview](./agent/overview.agent.md)** — terse, accurate reference for agents working in the Hudson codebase
