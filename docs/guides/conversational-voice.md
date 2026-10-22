# Conversational voice

Two-way spoken assistant sessions: user audio goes in, model audio comes out,
interruptions stop stale playback, and provider tool calls dispatch to
host-owned local tools.

Audience: a developer or agent wiring a conversational session into a web or
native host. For the design rationale and the provider research behind these
rules, read the
[architecture review](../reports/conversational-voice-review.md). For what has
and has not been verified, read the
[verification checklist](../reports/conversational-voice-verification.md).

Status: **implemented on `codex/conversational-voice`, native and web.** The
native stack (`HudsonConversation`, `HudsonConversationOpenAI`,
`HudsonConversationGemini`, `HudsonConversationHost`) compiles strictly and
warning-free for macOS and iOS with 57 passing fixtures; the web package
(`@hudsonkit/ai/conversation`) passes 106. Both counts are the coordinator's
independent runs. That is build and fixture evidence — no live provider session
has run, so nothing here is provider, account, device, or audio acceptance. Sections marked
*pending* name what is missing rather than describing an API that is not there.
These checks provide build and fixture acceptance evidence. Bounded GPT-Live WebSocket checks also passed, including a synthetic-audio local-tool round trip and native macOS setup/close. Physical microphone/speaker and browser WebRTC acceptance remain pending; see the verification report for limits.

## This is not transcription

Distinguish local transcription, diarized file transcription, live speech-to-text,
and conversational voice. Local execution does not imply speaker labels:

| Capability | Module | Purpose |
| --- | --- | --- |
| Local transcription | `HudsonVoice` (`HudDictation`, Parakeet through Vox) | On-device dictation text. Not a transcription-contract adapter. Does not label speakers |
| Diarized file transcription | `HudsonTranscriptionCloud` (MAI through Azure or OpenRouter, Gemini file), `HudsonTranscriptionElevenLabs` (reference) | Remote file transcription with requested speaker labels, subject to each adapter’s limits and feature constraints |
| Live speech-to-text | `HudsonTranscriptionCloud` (Gemini dedicated live transcription or conversational input transcription) | Text from caller-fed streaming audio. These shipped paths do not label speakers |
| **Conversational voice** | `HudsonConversation` | A spoken exchange: the model talks back |

There is a specific trap. The transcription contract registers
`gemini-live-input` (`gemini-3.8-live`), whose adapter requests
`responseModalities: ["AUDIO"]` and then **discards** the generated audio,
reading only the input transcript. That is a transcription adapter deliberately
throwing away a conversation. Do not route conversational output through it.
Conversational sessions use `HudsonConversation` and its own connection, even
though it reaches the same Google endpoint.

Parakeet's existing preparation and installation path is untouched by this
slice.

### Configure dictation, recordings, and meetings

The original three use cases remain in the transcription contract. Talkie saves
an independent engine selection for `dictation`, `recording`, and `meeting`.
Use the [transcription configuration reference](transcription-configuration.md)
for provider recipes, required settings, credentials, and compatibility checks.
The [saved-selection mapping](transcription-configuration.md#editing-persisted-state-by-hand)
documents those three keys; the [adapter guide](transcription-adapters.md)
describes the shared settings component and Talkie integration. The
[three-case acceptance plan](transcription-adapter-testing.md) separates these
product checks from conversational-voice fixtures.

For a meeting, choose a compatible diarized file adapter when speaker labels
are required. Local Parakeet remains the preferred local transcription choice,
but does not supply speaker labels. Live captions and final diarized results
are distinct operations. Selecting a local transcription engine and a separate
diarization engine does not create an implemented alignment pipeline.

Supported setup uses host settings or configurations constructed in code.
Neither transcription nor conversation provides a supported hand-authored file
import or configuration DSL. The JSON examples document serialized state;
editing Talkie’s persisted selections bypasses setup and consent checks.
Transcription `options` is currently reserved and unread by shipped adapters;
request features such as speaker labels belong on the request, not in that map.
Conversation options are separate: GPT-Live reads `delegation` and
`delegationModel`; Gemini reads no options keys. Provider credentials remain in
host-owned secure storage. See [conversation configuration](#configuration-is-saved-state-not-an-authored-input)
and the [transcription options reference](transcription-configuration.md#the-options-dictionary).

## Models

Verified against official provider documentation on 2026-09-16. These are the
documented facts, not live-session evidence.

| Model | Provider | Thinking | Tool behavior | Result scheduling |
| --- | --- | --- | --- | --- |
| `gpt-live-1` | OpenAI GPT-Live | n/a | `function_calling` supported | n/a |
| `gemini-3.8-live` | Google Gemini Live | **Omit entirely** | async default, `BLOCKING` allowed | Supported |
| `gemini-3.8-live-extended-thinking` | Google Gemini Live | `low` / `medium` / `high` | `NON_BLOCKING` **required** | **Unsupported — omit** |

GPT-Live is a **different product from the OpenAI Realtime API**, not a newer
name for it. Both are current; neither page marks the other deprecated.
GPT-Live is full duplex with reasoning delegated to a separate backend, at
`v1/live/sessions`. Realtime keeps speech, reasoning, and tools in one session.
This slice targets GPT-Live. The word "Realtime" appears in no identifier here,
deliberately.

Cost note worth surfacing in any settings UI: GPT-Live bills **$0.05 per
minute, per second of use**, and backend model and tool usage bill separately.
Rate limits are counted in concurrent sessions.

Model discovery is host/provider-driven. Saved model identifiers that are
currently absent from a catalog are preserved and reported unverified —
`HudConversationModelDescriptor.discovered` is `false` for those — and are never
silently substituted. Do not hand-maintain a UI allowlist.

## Configuration

`HudConversationConfiguration`
([source](../../packages/native/apple/HudsonKit/Sources/HudsonConversation/HudConversationConfiguration.swift))
is secret-free provider and model selection for one session.

| Field | Required on decode | Notes |
| --- | --- | --- |
| `providerID` | **Yes** | `openai-gpt-live` or `gemini-live-conversation` |
| `modelID` | **Yes** | String |
| `inputAudio` | **Yes** | `{ "sampleRate": Int }`. Capture rate only |
| `credentialKind` | **Yes** | `apiKey` or `ephemeralToken` |
| `options` | **Yes** | Provider-specific settings. GPT-Live reads `delegation` and `delegationModel` |
| `instructions` | No | System instructions |
| `voice` | No | Provider voice identifier |
| `thinkingLevel` | No | `low` / `medium` / `high`. Only on a thinking-capable model |
| `credentialReference` | No | `{ "identifier": String }`. **Never a secret value** |

### Which axis does an option live on?

This trips people, so it is stated before the examples rather than after.

- **Session configuration** — provider, model, instructions, voice, capture
  rate, thinking level, credential reference, and provider-specific `options`
  such as GPT-Live's `delegationModel`. Saved, fingerprinted, and stable across
  a session.
- **Per-call, not configuration** — tool declarations
  (`HudConversationToolDeclaration`), tool results, result scheduling, and
  interruption requests. These are passed at the call site, and there is no
  configuration field that turns them on.

If you are looking for a config key that enables tools, there isn't one, and
that is deliberate.

### `options` — provider-specific, and read

`options` is a string map for provider-specific settings that have no
first-class field. It **is** read: `HudGPTLiveSession` takes `delegation` (raw
delegation JSON) and `delegationModel` (the Responses backend model) from it.

Two consequences:

- **Declaring tools on GPT-Live requires `delegationModel`.** The session
  refuses to open otherwise: "Declared tools need a Responses backend model
  (delegationModel option)." It does not guess a backend model.
- Every key participates in `secretFreeFingerprint`, so adding one changes the
  configuration's identity. Unknown keys are still ignored by every adapter —
  set only keys a provider documents.

Gemini reads no options keys today.

### Two different JSON documents — do not confuse them

There are now two, and only one is an input:

| | Saved-state encoding | Settings document |
| --- | --- | --- |
| What it is | How a live `HudConversationConfiguration` serializes | A portable file a host can **import** |
| Authored by hand? | No — illustrative only | **Yes** |
| Shape | The configuration's own fields | `format` + `version` + nested `configuration` |
| Read by | Nothing; it is a debugging view | `HudConversationSettingsImport.importDocument` / `parseConversationSettingsDocument` |

The examples further down are the **saved-state** shape. For the authored
format, see [Importing settings](#importing-settings). There is still no DSL:
the settings document is strict versioned JSON with a fixed key set.

### Importing settings

For a typed browser UI binding, use `bindSettingsFileImport` in
[`web-host-example.ts`](../examples/conversational-voice/web-host-example.ts).
It binds an `HTMLInputElement` change event to
`importConversationSettingsFile`, displays a staged preview with `textContent`,
and calls the supplied persistence callback only after an explicit **Save**
click. A newer file selection supersedes an earlier pending read. Failed imports
cannot be saved; failed saves remain staged for retry. Dispose the binding when
the view closes.

The callback saves host preferences, not broker policy. It must not replace the
live-web smoke server's server-owned configuration, start a session, or send
imported credentials to the broker. The server independently authorizes any
later use of those preferences.


A settings document is `hudson-conversation-settings` version 1, identical on
native and web, and capped at 64 KB:

```json
{
  "format": "hudson-conversation-settings",
  "version": 1,
  "configuration": {
    "provider": "openai-gpt-live",
    "model": "gpt-live-1",
    "instructions": "You are a concise spoken assistant.",
    "voice": "alloy",
    "inputSampleRate": 24000,
    "options": { "delegationModel": "gpt-5.2" }
  },
  "credentialReference": "openai-conversation-key",
  "credentialKind": "apiKey"
}
```

Rules the importer enforces rather than documents:

- **No secret ever travels in the file.** There is no secret-bearing field, and
  a defense-in-depth check rejects any string that looks like one (`sk-`,
  `AIza`, `ya29.`, `Bearer `, `-----BEGIN`). `credentialReference` is a *name*
  into host storage.
- **`credentialReference` and `credentialKind` travel as a pair.** One without
  the other is rejected, so a document can never leave the credential kind to
  an implicit default.
- **Unknown keys are errors**, at the top level and inside `configuration`.
  In version 1 `options` admits only `delegationModel`; authored delegation
  JSON is not importable and must be configured in the app.
- **Bounded**: 64 KB document, 32 options entries, and every string bounded in
  **UTF-8 bytes** on both platforms.
- **A wrong version is `unsupported`, not malformed** — distinguishable in the
  UI from a corrupt file, with the same classification on both platforms.
- **Provider rules run at import**, using the adapters' own readiness checks
  with a resolver that yields no credential. No network call, no keychain read.

**Import stages; it never activates.** `importDocument` returns a `Staged`
value for the host's existing explicit save path, and nothing else can produce
one, so a settings surface cannot stage a document that skipped validation.
Import grants no consent and writes nothing: a failed import cannot have
touched prior settings, typed secrets, or stored credentials.

## Validated examples

Every file in
[`../examples/conversational-voice/`](../examples/conversational-voice/)
decodes against the compiled `HudConversationConfiguration`. Fingerprints are
the real digests of those exact bytes.

Every file is additionally passed to its **real adapter's**
`readiness(configuration:)` with a fake credential resolver, so the rules
enforced are the adapter's own rather than a second copy of them here. Files
named `invalid-*` must be rejected by that adapter; the rest must reach
`.ready`. Readiness performs no network I/O, and the checker installs a
transport that traps if one is ever attempted — so this costs nothing and
contacts no provider. It establishes configuration validity only, never
provider, account, session, or audio acceptance.

Provider IDs are now the real ones: `openai-gpt-live`
(`HudGPTLiveAdapter.providerID`) and `gemini-live-conversation`
(`HudGeminiConversationAdapter.providerID`).

### GPT-Live

```json
{
  "providerID": "openai-gpt-live",
  "modelID": "gpt-live-1",
  "instructions": "You are a concise voice assistant. Keep answers short.",
  "inputAudio": { "sampleRate": 24000 },
  "credentialReference": { "identifier": "openai" },
  "credentialKind": "apiKey",
  "options": {}
}
```

`sha256:d8a639465be385ecb7dcd42288e9651aec308ffe910ff80563b5940656356a6c`

The adapter accepts a capture rate of **24000 or 16000** and rejects anything
else. 24 kHz is the WebSocket guide's default, which is why the example uses
it; it is a choice, not a provider requirement. WebRTC hosts do not pin a PCM
rate this way.

### Gemini Live, base model

```json
{
  "providerID": "gemini-live-conversation",
  "modelID": "gemini-3.8-live",
  "instructions": "You are a concise voice assistant. Keep answers short.",
  "inputAudio": { "sampleRate": 16000 },
  "credentialReference": { "identifier": "gemini" },
  "credentialKind": "apiKey",
  "options": {}
}
```

`sha256:2763b80ad591ea2d150acbd6e288be64dc2b502e04ba03efaa9fc8187ea4b904`

No `thinkingLevel`. The base model's documentation is explicit: "Omit
`thinking_level` (or `thinking_config`) from your session setup."

### Gemini Live, extended thinking

```json
{
  "providerID": "gemini-live-conversation",
  "modelID": "gemini-3.8-live-extended-thinking",
  "instructions": "You are a concise voice assistant. Keep answers short.",
  "inputAudio": { "sampleRate": 16000 },
  "thinkingLevel": "medium",
  "credentialReference": { "identifier": "gemini" },
  "credentialKind": "apiKey",
  "options": {}
}
```

`sha256:cc6a7afb905204b2da6b8760c5682e7fe1bd9e8c722db3378c3a4eebe706b28c`

`MINIMAL` is not a supported level and is not in the enum. Every tool
declaration for this model must be `nonBlocking`, and tool results must carry
no `scheduling`.

### Browser session, ephemeral credential

```json
{
  "providerID": "gemini-live-conversation",
  "modelID": "gemini-3.8-live",
  "inputAudio": { "sampleRate": 16000 },
  "credentialReference": { "identifier": "session-grant" },
  "credentialKind": "ephemeralToken",
  "options": {}
}
```

`sha256:13e11f6ae340cd17177e21fda0b0a3de7cc56049303acf33e0797a40046570d4`

`credentialKind: "ephemeralToken"` is the only kind suitable for a
browser-adjacent host. See [credentials](#credentials) below.

### A configuration that must be rejected

[`invalid-thinking-on-base-model.json`](../examples/conversational-voice/invalid-thinking-on-base-model.json)
sets `thinkingLevel` on `gemini-3.8-live`. It **decodes** — the type cannot
express the constraint — and must be **rejected by the adapter** with an error
naming the field, never silently dropped. Incompatible authored configuration
failing loudly is a requirement, not a nicety. The same applies to a `MINIMAL`
level, a `blocking` tool on extended thinking, and any `scheduling` on an
extended-thinking result.

### Re-running the validation

```sh
CV=/Users/arach/dev/hudson-worktrees/conversational-voice
S="$CV/packages/native/apple/HudsonKit/Sources"
CHECK="$(mktemp -d)"
mkdir -p "$CHECK/Sources/ConvCheck"
for m in HudsonConversation HudsonConversationGemini HudsonConversationOpenAI; do
  ln -s "$S/$m" "$CHECK/Sources/$m"
done
cp "$CV/docs/examples/conversational-voice/validate.swift" "$CHECK/Sources/ConvCheck/main.swift"
cat > "$CHECK/Package.swift" <<'EOF'
// swift-tools-version: 6.0
import PackageDescription
let package = Package(
  name: "ConvCheck", platforms: [.macOS("26.0")],
  targets: [
    .target(name: "HudsonConversation"),
    .target(name: "HudsonConversationGemini", dependencies: ["HudsonConversation"]),
    .target(name: "HudsonConversationOpenAI", dependencies: ["HudsonConversation"]),
    .executableTarget(name: "ConvCheck", dependencies: [
      "HudsonConversation", "HudsonConversationGemini", "HudsonConversationOpenAI"])
  ])
EOF
swift run --package-path "$CHECK" ConvCheck "$CV/docs/examples/conversational-voice"
```

The throwaway package symlinks the three modules so the check runs without a
whole-package build. See the
[defects report](../reports/conversational-voice-defects.md) for review status.

Last run: **all 7 examples checked** — 4 reached `.ready`, and 3 `invalid-*`
files were rejected by their adapter with these reasons:

| Example | Adapter | Rejection |
| --- | --- | --- |
| `invalid-thinking-on-base-model.json` | `gemini-live-conversation` | "This model does not take a thinking level. Choose the extended-thinking model instead." |
| `invalid-sample-rate-gpt-live.json` | `openai-gpt-live` | "GPT-Live PCM sessions use 24000 or 16000 samples per second." |
| `invalid-browser-apikey-gpt-live.json` | `openai-gpt-live` | "GPT-Live sockets use a server-held API key. Browsers connect through a host backend instead." |

## Credentials

A configuration never carries a secret. `credentialReference.identifier` is a
name resolved through `HudConversationCredentialResolver` into host-owned secure
storage — `HudVault` on native.

`HudConversationCredentialKind` is the security boundary:

- `apiKey` — a long-lived provider key. **Server and native processes only.**
- `ephemeralToken` — short-lived, minted by a host backend. The only kind
  suitable for a browser-adjacent host.

No long-lived provider secret may appear in browser config, a bundle,
persistence, logs, or a URL.

### Brokering a browser session — two shapes, not one

The two providers differ structurally, and a `getToken()` abstraction fits one
and breaks the other:

| Provider | What the backend does | What the browser holds |
| --- | --- | --- |
| Gemini Live | `POST https://generativelanguage.googleapis.com/v1beta/auth_tokens`, returning a token with `uses` (default 1), `expireTime` (default 30 min), `newSessionExpireTime` (default 1 min), optional `liveConnectConstraints` | The token, sent as an `access_token` query parameter or `Authorization: Token <value>` |
| GPT-Live (WebRTC) | Creates the session and exchanges the browser's SDP **offer** for an **answer** | An SDP answer. **No token at all** |

So the contract is "broker a session", not "fetch a token". Gemini sessions also
need resumption roughly every 10 minutes within the token's `expireTime`.

The OpenAI delegation documentation contains no credential discussion
whatsoever. Nothing about a token flow there should be inferred.

Resolvable credentials mean *auth readiness*, not verified account access.
`HudConversationReadiness.ready` says setup is complete locally; the account is
only proven when a session actually connects.

## Audio

Mono PCM16 little-endian throughout. **Rates are asymmetric and must not be
assumed symmetric.** Gemini takes 16 kHz input and produces 24 kHz output.

The contract handles this by separating the two: `inputAudio` on the
configuration is the **capture** rate, while every
`HudConversationAudioChunk` carries its own `format` for **playback**. Read the
chunk's format; never play assistant audio at the capture rate.

## Events

`HudConversationEvent`
([source](../../packages/native/apple/HudsonKit/Sources/HudsonConversation/HudConversationEvents.swift)):

| Event | Meaning |
| --- | --- |
| `ready(sessionID:)` | Setup acknowledged. **Do not send audio before this.** |
| `userTranscriptDelta` / `assistantTranscriptDelta` | Incremental text |
| `assistantAudio(HudConversationAudioChunk)` | Speech, carrying `format`, `generation`, `sequence` |
| `interrupted(generation:)` | Provider stopped its own speech. The value is the **new** generation |
| `turnComplete` | End of the current utterance. **Not** end of work |
| `interactionStatus(.idle / .inProgress)` | Whether background reasoning or tools are still running |
| `toolCall(HudConversationToolCall)` | A tool was requested |
| `toolCallsCancelled([String])` | The provider withdrew these calls; suppress their results |
| `delegationStarted(HudConversationDelegation)` | GPT-Live delegated work began |
| `closed(HudConversationUsage?)` | Terminal, emitted exactly once on graceful close |

### `turnComplete` is not "done"

The single most likely bug in this slice. On
`gemini-3.8-live-extended-thinking`, clients must keep reading after
`turnComplete: true` and use `interactionStatus` to learn whether the server is
still `inProgress` or has reached `idle`.

**A completed utterance must not clear background-work state.** Treat the two as
independent: `turnComplete` ends an utterance, `interactionStatus(.idle)` ends
the work. A session model that conflates them makes extended thinking look like
it hangs, or silently drops tool results that arrive afterwards. It is invisible
on the base model, so it needs its own fixture.

`HudConversationUsage.detail` is **cumulative** as of close. Do not sum it with
earlier per-update values.

## Interruption — three effects, not one

Barge-in is three separable things. They differ in who performs them, and none
of the three is a single `interrupt()` call:

| # | Effect | Who performs it | Gemini Live | GPT-Live |
| --- | --- | --- | --- | --- |
| 1 | Stop local playback | The host, locally | `interruptPlayback()` | `interruptPlayback()` |
| 2 | Stop the provider's speech | The provider | Implicit on VAD interrupt, reported as `.interrupted` | Provider-driven; full duplex means it keeps listening while speaking |
| 3 | Stop delegated backend work | The host, in its own code | No delegation concept | Host cancels its own work |

**There is no client-initiated cancel event in either provider's documented
contract.** GPT-Live documents no cancel, interrupt, or truncate message a
client may send; its only related statement is that "Interrupting speech does
not automatically cancel backend work." Gemini's interrupt is VAD-driven and
reported after the fact. So effect 2 is observed, not requested, and the
contract correctly offers no method to request it.

Effect 3 for GPT-Live client delegation is host work by construction: the
delegation payload is an opaque `delegation.id` and `delegation.target`, the
host decides what to run, so the host is also the only party that can stop it.
Nothing in this API cancels it for you.

On cost, stated precisely: the GPT-Live **session** bills $0.05 per minute per
second of its own duration, whether or not anything was interrupted — stopping
playback does not stop session billing, and neither does closing a delegation.
Backend model and tool usage bill **separately**, through whatever service the
host called. So abandoning delegated work without stopping it leaves that
separate cost running. Close the session to stop session billing; cancel your
own backend work to stop backend billing. They are two independent meters.

Speech interruption must **not** cancel independent tool effects. A tool that
has already acted has already acted; only its result delivery is suppressed.

### The session API, as built

`HudConversationSession`
([source](../../packages/native/apple/HudsonKit/Sources/HudsonConversation/HudConversationSession.swift)):

| Member | Effect |
| --- | --- |
| `interruptPlayback() async -> UInt64` | Effect 1 only. Bumps the playback generation and returns it. Sends nothing to the provider; cancels no tool and no delegated work |
| `appendInstruction(_:) async throws` | Steers mid-session where supported. May cause the provider to stop speaking; it is steering, not cancellation |
| `send(audio:)`, `finishAudio()` | User audio in, and end-of-input where the provider distinguishes it |
| `send(toolResult:)` | Returns a host result, echoing the provider call ID |
| `close()` | Graceful close, bounded; the event stream finishes after confirmation or timeout |
| `.interrupted(generation:)` event | The provider stopped its own speech. Flush playback to the new generation |
| `.toolCallsCancelled([String])` event | The provider withdrew calls. Cancel their dispatch and suppress their results |

Playback staleness is handled by generation, not by cancellation: every
`HudConversationAudioChunk` carries one, and chunks older than the current
generation are dropped.

## Native host wiring

`HudConversationHostSession`
([source](../../packages/native/apple/HudsonKit/Sources/HudsonConversationHost/HudConversationHostSession.swift))
is a complete working caller — microphone in, speech out, tools dispatched with
host authorization — not an interface awaiting an implementation.

Audio is its own code, not borrowed from the dictation or TTS stacks:
`HudConversationMicrophone` implements `HudConversationAudioInput`, and
`HudConversationSpeaker` implements `HudConversationAudioOutput`. Both are
injectable, which is what makes the lifecycle fixture-testable; pass your own
to drive it from a file. (An earlier draft of this guide said native hosts
reuse `HudSpeechPlayback` from `HudsonVoice`. They do not — nothing in the
conversation modules references it.)

The complete wiring is a **compile-checked file**, not a snippet:
[`NativeHostExample.swift`](../examples/conversational-voice/NativeHostExample.swift).
It builds against `HudsonConversation`, `HudsonConversationHost` and both
adapters, so it cannot drift from the API the way prose can. It opens no
socket, touches no audio device, and calls no provider — `makeHostSession`
returns a configured session and leaves `run()` to the caller.

It takes a `HudConversationCredentialResolver` and a
`HudConversationConfiguration` from the caller, registers one pure local tool
(`count_words`) with real argument validation, and gates it behind the host
authorizer. The shape:

```swift
let log = TranscriptLog()                       // @MainActor, ObservableObject
let host = try await NativeHostExample.makeHostSession(
    configuration: savedConfiguration,
    credentials: myVault,                       // any HudConversationCredentialResolver
    log: log)
try await host.run()                            // the only call that reaches a provider
```

Two things the earlier draft of this guide got wrong, both fixed in that file:

**Transcript callbacks are `@Sendable` and arrive off the main actor.** Mutating
view state directly inside them is a data race — and the obvious fix, a
`Task { @MainActor in ... }` per delta, is also wrong: unstructured tasks carry
no ordering guarantee, so append-only transcript text arrives scrambled.

Funnel both callbacks into one stream and drain it from a single main-actor
consumer, so deltas apply in the order they were enqueued:

```swift
private let continuation: AsyncStream<Delta>.Continuation
consumer = Task { @MainActor [weak self] in
    for await delta in stream { /* append in order */ }
}
// callbacks only enqueue — no task per delta, no ordering hazard
onUserDelta: { delta in continuation.yield(.user(delta)) }
```

`TranscriptLog` in the example does exactly this.

**GPT-Live needs a host-supplied backend model.** Declaring tools on
`openai-gpt-live` without `options["delegationModel"]` fails when the session
opens — the adapter will not guess one. `NativeHostExample.validateDelegation`
checks it up front so the failure names the missing key instead of surfacing at
connect time. Gemini has no equivalent requirement.

Three behaviors worth knowing before you wire it:

- **Single use.** One instance runs one conversation. A second `run()` throws.
  This keeps the dispatcher's call-ID history aligned with one provider
  session, so a new conversation needs a new host session *and* a new
  dispatcher.
- **`userInterrupted()` is effect 1 only.** It calls `interruptPlayback()` and
  flushes the speaker to the returned generation. The comment says it plainly:
  "tool or delegated work is deliberately left alone."
- **`stop()` ends input and closes.** Safe during opening — `run()` aborts at
  its next checkpoint. Cleanup is awaited on every path, and `teardown()`
  cancels dispatch *before* cancelling tasks, so a call still awaiting
  authorization cannot start its effect afterwards.

Failures surface rather than degrade: a dead microphone path closes the session
and rethrows from `run()` instead of leaving a live socket with no input, and
playback failure is surfaced because "a silent assistant with a live billing
session is not an acceptable steady state."

### Tool call handling in the host

The host, not the dispatcher, owns the one-task-per-call rule:

- `.toolCall` inserts into `handledCalls` and starts a task only if the ID is
  new, so a duplicate announcement neither replaces the original task nor races
  a duplicate result.
- The result is sent only while the session is still running.
- `.toolCallsCancelled` cancels the matching tasks and calls
  `dispatcher.cancel(ids:)`.
- A delivery failure that is not a cancellation ends the run rather than
  silently losing a result.

`HudConversationSettingsSample` is a working SwiftUI settings surface over the
registered adapters, with credential and configuration saving delegated to a
host-supplied `Store`.

## Tools

Host tools are declared with `HudConversationToolDeclaration` (name,
description, `parametersJSONSchema`, `behavior`) and executed by
`HudConversationToolDispatcher`, an actor the host owns.
[`NativeHostExample.swift`](../examples/conversational-voice/NativeHostExample.swift)
carries a worked one: a pure local tool that validates its own arguments
(missing field, wrong type, oversize input) and returns JSON. The dispatcher
rejects non-object arguments before a handler runs, but a handler must still
validate its own fields — the model picks them, and it gets them wrong.

The dispatcher's guarantees, which map onto the acceptance checklist:

| Guarantee | How |
| --- | --- |
| Never executes provider code | Provider messages are **data**. Handlers are host-registered and looked up by name |
| Unknown tools fail safely | `failure("Unknown tool.")` |
| Malformed arguments fail safely | `argumentsJSON` must parse as a JSON **object** |
| Host authorization over effects | An `Authorizer` runs **before** the handler; returning `false` fails the call unrun |
| Effects run at most once per call ID | A duplicate ID returns an error without re-running |
| Late results cannot leak | A result arriving after cancellation is reported as `.failure` and discarded |
| Cancellation is honest | "A handler that has already produced an effect keeps its effect; only its result delivery is suppressed" |
| Host internals stay host-side | Error text is sanitized before it crosses into provider context |

Results echo `callID` verbatim so parallel calls keep their identity.

### Scheduling

`HudConversationToolResult.scheduling` (`interrupt` / `whenIdle` / `silent`)
says how an out-of-band result re-enters the conversation. It applies to
`gemini-3.8-live` only. **Omit it entirely on
`gemini-3.8-live-extended-thinking`**, where function scheduling configurations
are not supported, and adapters must reject it rather than drop it.

The wire spelling was ambiguous across two official pages (`INTERRUPT` on the
tools page, `INTERRUPTED` on the model page). It is now settled from the
implementation: `HudGeminiConversationSession` sends **`INTERRUPT`**,
`WHEN_IDLE`, `SILENT`.

Both sessions enforce the model rules rather than adjusting silently.
`send(toolResult:)` throws `invalidConfiguration` for scheduling on extended
thinking, and GPT-Live rejects scheduling outright — it has no such concept.
Gemini also throws `unknownToolCall` for a result whose call it never
announced, and reserves the pending call before its first `await` so a
concurrent duplicate cannot send twice.

### GPT-Live delegation

Delegation mode is fixed at session creation; changing it requires a new
session.

**Client delegation** (`HudConversationDelegation.Target.client`) hands the host
an opaque identifier and nothing else: "The delegation object contains metadata,
not task text... It does **not** contain the user's utterance or task text." The
payload is `delegation.id` and `delegation.target`. The host reconstructs intent
from the transcript and its own application state — never from provider-supplied
arguments, because there are none.

**Responses delegation** (`.responses`) still runs through host authorization.
An earlier draft of the architecture review claimed otherwise and was wrong.
Custom function calls arrive nested — dispatch on the `response.event`
envelope's `event.type`, read completed calls from `response.output_item.done`
(carrying `call_id`, `name`, `arguments`), authorize and execute, append the
result via `response.item.create`, then send `response.create` to resume. The
documentation is explicit: "Your application still executes its custom functions
and enforces dependencies and approvals."

`HudConversationToolCall.delegationID` is set when a call arrived inside a
delegated-work envelope, and the matching result echoes it.

`HudConversationToolCall.delegationID` is set when a call arrived inside a
delegated-work envelope, and the matching result echoes it. `HudGPTLiveSession`
handles nested delegated events and resumes Responses work once a delegation's
calls are all answered.

## Web

`@hudsonkit/ai/conversation` is the web counterpart, with the same concepts and
transport-appropriate implementations. Worked, type-checked wiring is in
[`web-host-example.ts`](../examples/conversational-voice/web-host-example.ts),
checked against the package's published `dist` types.

Two transports, and they differ in ways that change host code:

| | Gemini Live (WebSocket) | GPT-Live (WebRTC) |
| --- | --- | --- |
| Connect | `connectGeminiLive` | `connectGPTLiveWebRTC` |
| Browser credential | Ephemeral token from your backend | **None** — the backend exchanges the browser's SDP offer for an answer |
| Assistant audio | `assistantAudio` chunks the host schedules | A remote media track you attach via `onRemoteAudioTrack` |
| Host | `startBrowserConversation` (PCM capture and playback) | `startWebRTCEventHost` (events and tools only) |
| Barge-in | Generation advance drops queued chunks — audible immediately | Generation alone **silences nothing**; `muteRemoteAudio` is required |

That last row is the one to internalize. Over WebRTC there is no local queue to
drop, so `startWebRTCEventHost` requires a concrete `muteRemoteAudio` hook
wired to pausing or muting the element playing the remote track. Muting is a
local, honest effect — the provider keeps its own turn handling — and nothing
unmutes automatically: the caller decides when, via `resumeRemoteAudio()`,
which needs the optional `unmuteRemoteAudio` hook to have anything to undo.

Two boundaries the package enforces rather than documents:

- A long-lived API key passed from a browser is refused with a
  `credential-boundary` error. Browser WebSockets cannot carry handshake
  headers, so `defaultSocketFactory` throws rather than silently dropping auth.
- `fetchGeminiLiveModels` asserts it is not running in a browser: discovery
  needs an API key, and ephemeral tokens only open sessions. Call it from a
  backend route.

Server-only helpers (`createGeminiTokenRoute`, `createGPTLiveSessionRoute`,
`mintGeminiEphemeralToken`, `createGPTLiveWebRTCSession`) hold the provider key
and must never be imported into browser code.

**Use the route factories rather than hand-writing the fetch on each side.**
The SDP exchange is a JSON payload crossing a network boundary, so the client's
`exchange` callback and the server route are two independently typed halves
that a compiler cannot reconcile: `createGPTLiveSessionRoute` reads `body.sdp`
and returns `{ sdp, sessionId }`, which is not the shape a reasonable person
guesses. Hand-copied field names on both ends is how that goes wrong silently
— see D10 in the [defects report](../reports/conversational-voice-defects.md).
If you must write the call yourself, validate `response.json()` and map the
validated field; never `as`-assert a network response into the shape you want.

Tool declarations must be passed to the connect call, not only registered on
the dispatcher — a provider calls only the tools it was told about at setup.

## Errors

`HudConversationError`: `invalidConfiguration(String)`,
`notReady(HudConversationReadiness)`, `connectionFailed`,
`setupRejected(String)`, `providerError(String)`, `sessionClosed`,
`invalidAudioChunk`, `discoveryFailed(String)`.

`HudConversationToolDispatchError`: `unknownTool`, `malformedArguments`,
`duplicateCall`, `cancelled`, `notAuthorized`.

Readiness (`unconfigured`, `needsCredential`, `ready`, `unavailable`, `failed`)
describes local setup. It never asserts that the provider accepted a session.

Failures surface honestly. A provider error is a provider error — never a
silent downgrade, a substituted model, or a fabricated result.

## What is pending

Named so the gaps are visible rather than implied:

- Live-session acceptance against a real account, on either platform.
- Device behavior and audio quality.

Everything else in this guide is implemented. Evidence is 57 native fixtures
plus a warning-free strict compile for all four native targets on root and iOS,
and 106 web tests — all coordinator-run.

This guide is updated against the exported surface as each lands. Nothing here
has been exercised against a live provider session.
