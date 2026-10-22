# Transcription configuration format

Audience: an agent or developer that must produce, read, or reason about a
transcription engine configuration. This is the data reference. For the adapter
contract and architecture, read [transcription adapters](transcription-adapters.md).
For what has and has not been verified, read the
[acceptance audit](../reports/transcription-acceptance-audit.md).

Status: implemented in isolated worktrees, not released. Every example in
`../examples/transcription-configurations/` decodes against the current source.
See [Validating an example](#validating-an-example).

## What this format is, and what it is not

`HudTranscriptionConfiguration` is a Swift value. Its JSON encoding is what the
host writes to disk. There is **no import command, no configuration file the
product reads as user input, and no markup or DSL** for setting up a transcription
API. Nothing in this repository parses a hand-authored configuration document.

So read the JSON in this guide in exactly one of two ways:

| Reading | Valid | Why |
| --- | --- | --- |
| Illustrative serialization — the shape a configuration takes once the app has saved it | Yes | The encoding is real and stable; the examples decode against the compiled type |
| Supported editable input — a file you write by hand to configure the product | **No** | No supported path constructs a configuration from an authored file |

The distinction matters because Talkie's host does re-read its selection file
from disk on every lookup, so an edited file would in fact take effect. That is a
consequence of the storage layout, not a supported interface: a hand-edited file
skips the endpoint validation, required-field checks, credential storage,
explicit preparation, and consent capture that the save path performs. See
[Editing persisted state by hand](#editing-persisted-state-by-hand).

An agent asked to "set up a transcription API" should drive the host's save path
(Talkie's Transcription Models settings) or call the contract directly in code.
It should not write a configuration file and expect the product to adopt it.

## The configuration value

Source:
[`HudTranscriptionConfiguration.swift`](../../packages/native/apple/HudsonKit/Sources/HudsonTranscription/HudTranscriptionConfiguration.swift).

| Field | JSON type | Required on decode | Meaning |
| --- | --- | --- | --- |
| `providerID` | string | **Yes** | Registered adapter ID. Unknown IDs decode and round-trip; the registry reports them unavailable rather than substituting one |
| `modelID` | string | **Yes** | Upstream model identifier. Same round-trip rule |
| `options` | object of string→string | **Yes** | Present but **unread**. No shipped adapter reads any key. See [The options dictionary](#the-options-dictionary) |
| `endpoint` | string URL | No | Provider base URL. Omit to use the adapter's default where it has one |
| `region` | string | No | Provider region. No shipped adapter reads it |
| `credentialReference` | `{ "identifier": string }` | No | Opaque handle into the host's credential store. **Never a secret value** |
| `localModel` | `{ "location": string }` | No | Absolute path to a directory of already-installed model files |

`providerID` and `modelID` are `RawRepresentable` over `String`, so they encode as
bare strings, not as `{"rawValue": …}`. `credentialReference` and `localModel` are
structs and encode as objects. Getting this wrong is the most common error:

```json
{ "providerID": { "rawValue": "elevenlabs-reference" } }   // wrong: type mismatch on decode
{ "providerID": "elevenlabs-reference" }                    // correct
```

Decoding is strict about the three required keys and permissive about everything
else. Omitting `options` fails with `keyNotFound`. An `endpoint` string that is
not a usable URL still decodes — validation happens later, in the host's save
path and in each adapter's readiness check, not in the decoder.

### The configuration fingerprint

`secretFreeFingerprint` is `"sha256:"` plus the hex digest of the configuration
encoded with sorted keys. It is the identity used for upload consent, for local
model resource keys, and in every result's provenance. **Any** field change
produces a different fingerprint, including an unread `options` key or a changed
`region`. Changing a configuration therefore invalidates the consent recorded
against it. That is the intended behavior, not a side effect to work around.

### The options dictionary

`options` exists in the type and in the schema-driven settings UI (a descriptor
can declare a `text` field whose value lands here), but **no adapter in this
repository reads `configuration.options`**. Treat it as reserved. Writing keys
into it changes the fingerprint, and therefore invalidates consent, without
changing any provider request. Leave it `{}`.

## Credentials

A configuration never carries a secret. `credentialReference.identifier` is a
name; the host resolves it to bytes through
[`HudTranscriptionCredentialResolver`](../../packages/native/apple/HudsonKit/Sources/HudsonTranscription/HudTranscriptionCredentialResolver.swift),
which adapters receive at construction.

In Talkie the identifier is the `APIKeyStore` provider ID. Any string works —
the settings field is free text and is used verbatim as the store key — but
using the store's existing names (`gemini`, `openrouter`, `elevenlabs`, …) reuses
a key that is already stored and shared with TalkieAgent through the Keychain
access group. A name with no stored key resolves to
`HudTranscriptionError.notReady(status: needsCredential)`.

Never write a key value into a configuration, a document, a log, or an example.
When an agent needs one at runtime, read it through the host's store or, at a
shell, through the `secret` CLI — never inline and never as an argument.

## Provider recipes

Every JSON block below is a validated file in
[`../examples/transcription-configurations/`](../examples/transcription-configurations/).
The fingerprints are the real digests of those exact bytes; edit any field and
the fingerprint changes.

Hudson ships no local transcription adapter. Local Parakeet transcription runs
through HudsonVoice, where Vox owns the model; see [voice](../voice.md).

### MAI-Transcribe-2 via OpenRouter

Provider `openrouter-mai`, model `microsoft/mai-transcribe-2`. One adapter type
(`HudMAITranscriptionAdapter`) serves two routes; the OpenRouter route needs no
endpoint — it posts to `https://openrouter.ai/api/v1/audio/transcriptions` — and
requires only a credential reference.

```json
{
  "providerID": "openrouter-mai",
  "modelID": "microsoft/mai-transcribe-2",
  "credentialReference": { "identifier": "openrouter" },
  "options": {}
}
```

`sha256:cb00aa17b3726a86018e056d26e930e3ef1d238a187218867f881c5185bea670`

This is the MAI route with live acceptance evidence: a short-file OpenRouter
request passed. The Azure route below has not been exercised against an account.

### MAI-Transcribe-2 via Azure Speech

Provider `microsoft-mai`, model `MAI-Transcribe-2` (note the capitalization —
it differs from the OpenRouter model ID). Both `endpoint` and
`credentialReference` are **required**, and the endpoint must be HTTPS with no
user, password, query, or fragment.

```json
{
  "providerID": "microsoft-mai",
  "modelID": "MAI-Transcribe-2",
  "endpoint": "https://EXAMPLE-RESOURCE.cognitiveservices.azure.com",
  "region": "eastus",
  "credentialReference": { "identifier": "azure-speech" },
  "options": {}
}
```

`sha256:6320a38ddff9b53d3cd9a1fe636024c502c236ca26a3c4251775494e4cf7f0c9`

`region` is carried for the record; the current client derives everything from
`endpoint`. Constraints: WAV, MP3, or FLAC; under two hours; under 250 MB; at
most one language hint. Speaker labels are **rejected at 15 minutes and longer**
because MAI diarization is unreliable there — that is a hard compatibility
rejection, not a warning.

### Gemini — file and live are different providers

This is the split most likely to be got wrong. Gemini appears as **three**
registered providers, and a configuration is bound to exactly one.

| Provider ID | Model ID | Mode | Use for |
| --- | --- | --- | --- |
| `gemini-file` | `gemini-3.5-transcribe` | Batch only | Recordings, meeting tracks |
| `gemini-live-transcription` | `gemini-3.5-transcribe-live` | Live only | Dictation, dedicated live path |
| `gemini-live-input` | `gemini-3.8-live` | Live only | Explicit evaluation of conversational input transcription |

They share one API key and one endpoint default
(`https://generativelanguage.googleapis.com`; set `endpoint` only to override).
They do **not** share capabilities, limits, or evidence. Never treat the
conversational model as a substitute for the dedicated one.

**File** — word timing and diarization up to 8 speakers, up to 60 minutes plain
or **30 minutes when annotated**. Annotations (word timing or speaker labels)
cannot be combined with vocabulary hints, clean style, or smart formatting; that
combination is rejected, not silently dropped.

```json
{
  "providerID": "gemini-file",
  "modelID": "gemini-3.5-transcribe",
  "credentialReference": { "identifier": "gemini" },
  "options": {}
}
```

`sha256:b76b3d8fecebba19fc508eda03af2b576e885c270ab6ec7cdf2c47a08871f69c`

This adapter uploads a file and owns cleanup of that upload. The host takes an
upload-event callback and records outstanding cleanup durably, so a cancellation
cannot orphan a remote file silently.

**Dedicated live** — caller-fed mono 16 kHz PCM16LE, sessions capped at ten
minutes, no speaker labels and no word timing.

```json
{
  "providerID": "gemini-live-transcription",
  "modelID": "gemini-3.5-transcribe-live",
  "credentialReference": { "identifier": "gemini" },
  "options": {}
}
```

`sha256:3e1bee9d33a034389b0c745a71abedd0d4a880b679fd29d7f98c9fec27951721`

**Conversational input** — the same PCM format, and additionally rejects language
hints, vocabulary hints, clean style, and smart formatting, which belong to the
dedicated profile. The model generates audio output that this adapter discards;
discarding it does not prove generation is disabled or unbilled.

```json
{
  "providerID": "gemini-live-input",
  "modelID": "gemini-3.8-live",
  "credentialReference": { "identifier": "gemini" },
  "options": {}
}
```

`sha256:9a04ded16950404d0c3d309d6d1c00fc71b036282117de027c2e4b4ae53a64d3`

No Gemini route has account-backed acceptance evidence. Readiness reports
`ready` once a key is present; account access is only checked on submission or
connection.

### ElevenLabs Scribe (remote DIY reference)

Provider `elevenlabs-reference`, model `scribe_v2`. Built entirely on the public
contract and the shared transport, with no host branch — it is the worked example
of adding a vendor. Default endpoint `https://api.elevenlabs.io`; override only
to point elsewhere.

```json
{
  "providerID": "elevenlabs-reference",
  "modelID": "scribe_v2",
  "credentialReference": { "identifier": "elevenlabs" },
  "options": {}
}
```

`sha256:f90eb7502dc5c4593a3a4730f88439507795d0f2ef632c04080e0c2369189950`

Batch only, word timing, diarization. WAV, MP3, FLAC, or M4A; at least 100 ms;
under 250 MB; at most one language hint. Vocabulary hints and smart formatting
are rejected — this reference does not expose keyterms yet.

## Discovery and capability checks

Never hard-code the tables above into new code. Ask the registry.

```text
registry.registeredDescriptors()            -> which providers exist, and each
                                               provider's configurationSchema
adapter.models(configuration:)              -> that provider's model catalog
adapter.compatibility(request:configuration:) -> can THIS request run
adapter.readiness(configuration:)           -> is setup complete
registry.resolve(configuration)             -> saved selection's current standing
registry.evaluate(request:configurations:)  -> candidates; canRun needs both
                                               compatibility and readiness
```

`configurationSchema` is how a host knows which fields to collect. Each field has
a `key`, a `displayName`, a `kind` (`endpoint`, `region`, `model`,
`credentialReference`, `localModelLocation`, `text`), and a `required` flag.
Shipped schemas:

| Provider | Required | Optional |
| --- | --- | --- |
| `openrouter-mai` | `credentialReference` | — |
| `microsoft-mai` | `endpoint`, `credentialReference` | — |
| `gemini-file`, `gemini-live-transcription`, `gemini-live-input` | `credentialReference` | — |
| `elevenlabs-reference` | `credentialReference` | — |

Catalogs are **static adapter metadata**, not live upstream discovery
(`modelDiscovery: .adapterMetadata` on every shipped provider). They do not
refresh from the vendor. A saved model ID that disappears from a catalog stays
saved and reports unavailable; nothing substitutes another model.

Capability is not a boolean set. A model descriptor carries `supportsBatch`,
`supportsLive`, `timing`, `speakers`, `inputFormats`, `limits`, `constraints`,
and `evidence`. Three-state answers are load-bearing:

- `timing`/`speakers` of `unknown` means unestablished, not absent.
- A `limits` value of `unknown` means unverified, **not unlimited**.
- `compatibility.status` is `supported`, `unsupported`, or `unverified`.
  `unverified` (for example, a duration that was never measured) is not
  permission to run.

## Readiness

`HudTranscriptionReadinessStatus` values and what each actually means:

| Status | Meaning | Typical next step |
| --- | --- | --- |
| `unconfigured` | Required fields missing — or, for local adapters, files are present but not yet loaded | Complete fields, or call `prepare` |
| `needsCredential` | No credential reference, or the reference resolves to nothing | Store a key under that identifier |
| `needsDownload` | Local model files are absent | Install through the host's existing installer. No adapter downloads |
| `preparing` | Another model is loading and holds the resource lease | Wait |
| `ready` | Configuration is complete and, locally, the model is loaded | Submit |
| `unavailable` | Provider unregistered, or saved model not in the current catalog | Re-select |
| `failed` | The adapter could not report availability | Check configuration |

Readiness is not compatibility and not proof of provider access. Every remote
adapter returns `ready` with the reason "Configured locally. Account access is
checked on submission." A readiness check never sends audio — diagnostic audio
from a credential probe is explicitly out of bounds.

`prepare(configuration:)` defaults to readiness. A local adapter overrides it to
load model files into the shared
`HudTranscriptionLocalResources` owner, which holds one prepared model and an
exclusive lease. Preparing a second model while a lease is held reports
`preparing` rather than loading both.

## Consent and its invalidation

Consent is host state, not adapter state, and it is bound to a fingerprint:

1. The host records `remoteConsentFingerprint` = the configuration's
   `secretFreeFingerprint` at the moment the user agreed.
2. Before any remote submission or live connection, the workspace requires
   `descriptor.origin == .remote` → stored fingerprint **equals** the current
   configuration's fingerprint. Otherwise: `uploadConsentRequired`.

So editing the endpoint, the credential reference name, the model, the region,
or any `options` key silently produces a new fingerprint and **revokes consent**.
The app's settings binding makes this visible by clearing the consent toggle when
any field changes. Local adapters (`origin == .local`) never require consent.

Consent is also rechecked mid-flight: the workspace re-reads the selection before
persisting intent, and a live session revalidates on each relay, so a selection
changed in another window aborts with `selectionChanged` rather than continuing
under the old grant.

## Errors

From
[`HudTranscriptionError.swift`](../../packages/native/apple/HudsonKit/Sources/HudsonTranscription/HudTranscriptionError.swift):

| Error | Raised when |
| --- | --- |
| `unsupportedMode(.batch/.live)` | The adapter does not implement that mode |
| `unknownProvider` / `duplicateProviderID` | Registry lookup or registration |
| `invalidRequest(String)` | Compatibility rejected the request, or the configuration is incomplete |
| `notReady(HudTranscriptionReadiness)` | Submission attempted before setup completed |
| `cancelled` | Cancellation completed locally |
| `remoteOutcomeUnknown(providerRequestID:)` | A remote job may have run and may be billed. **Not** a failure |
| `incompleteAudio` | Audio was lost or finalization is uncertain |
| `lateWrite`, `sessionAlreadyTerminal` | A live session wrote after its terminal event |
| `nonMonotonicChunkSequence`, `nonMonotonicUtteranceRevision`, `chunkTooLarge` | Live input contract violations |

Host-level failures come from `TranscriptionWorkspace.WorkspaceError`:
`noSelection`, `selectionChanged`, `uploadConsentRequired`, `incompatible`,
`operationAlreadyExists`, `cachedRequestMismatch`, `readOnlySelection`,
`noTerminalResult`, `invalidResultIdentity`, `invalidResultCompletion`.

Two rules that constrain any retry logic you write:

- A selected adapter's failure **propagates**. It never falls back to another
  provider and never silently re-routes to the host's built-in engine.
- `remoteOutcomeUnknown` must stay visible. Do not auto-resubmit; a second
  request may be a second charge. Ledger entries left `submitting` at process
  exit are recovered as `remoteOutcomeUnknown` for remote origins and `failed`
  for local ones.

## Provenance

Every result carries `HudTranscriptionProvenance`: `providerID`, `modelID`,
`adapterVersion`, `configurationFingerprint`, `sourceDigest` (SHA-256 of the
submitted audio), `providerRequestID`, `runID`, `sessionID`, `timestamp`, and
`annotationOrigin` (`native` when the provider supplied it, `derived` when the
adapter computed it).

The host does not trust this; it verifies. Before a result is accepted, its
provenance `providerID`, `modelID`, `configurationFingerprint`, and `runID` must
match the recorded run, and `completion` must be `completed`. A mismatch raises
`invalidResultIdentity` or `invalidResultCompletion` and marks the run failed.
Missing confidence, timing, or speaker fields stay missing — never defaulted.

## Editing persisted state by hand

Talkie stores this state under
`<Application Support>/Talkie/Transcription/`:

| File | Writer | Reader |
| --- | --- | --- |
| `selections.json` | The app | The app and the agent (read-only) |
| `workspace.json` | The app | The app's run ledger |
| `workspace-agent.json` | The agent | The agent's run ledger |
| `gemini-uploads.json`, `gemini-uploads-agent.json` | Per-process upload cleanup ledger | Same process |

`selections.json` is a map of use case (`dictation`, `recording`, `meeting`) to
`{ "configuration": …, "remoteConsentFingerprint": string|null }`, and it is
re-read from disk on every lookup rather than cached. A validated example is
[`selections.json`](../examples/transcription-configurations/selections.json).

Editing it by hand is **not a supported interface**. It bypasses endpoint
validation, required-field checks, key storage, and `prepare`. If
`remoteConsentFingerprint` does not exactly equal the configuration's fingerprint,
every remote run fails with `uploadConsentRequired` — which is the safe failure,
and also the reason a hand-edited file usually appears to do nothing. Use the
settings save path.

## Validating an example

Build a throwaway package against this worktree's contract module and decode the
example directory. No product build, no network, no provider call:

```sh
HUDSON=/Users/arach/dev/hudson-worktrees/transcription-adapters
CHECK="$(mktemp -d)"
mkdir -p "$CHECK/Sources/ConfigCheck"
ln -s "$HUDSON/packages/native/apple/HudsonKit/Sources/HudsonTranscription" "$CHECK/Sources/HudsonTranscription"
cp "$HUDSON/docs/examples/transcription-configurations/validate.swift" "$CHECK/Sources/ConfigCheck/main.swift"
cat > "$CHECK/Package.swift" <<'EOF'
// swift-tools-version: 6.0
import PackageDescription
let package = Package(
  name: "ConfigCheck", platforms: [.macOS("26.0")],
  targets: [
    .target(name: "HudsonTranscription"),
    .executableTarget(name: "ConfigCheck", dependencies: ["HudsonTranscription"])
  ])
EOF
swift run --package-path "$CHECK" ConfigCheck "$HUDSON/docs/examples/transcription-configurations"
```

Each file reports its canonical sorted-key encoding and its fingerprint, and
`selections.json` additionally reports whether each recorded consent fingerprint
matches its configuration. Last run, October 22, 2026: all 7 files decoded,
round-trip stable, all three consent fingerprints matching.

`validate.swift` declares a local mirror of Talkie's `Selection` struct so the
check needs only the Hudson contract module. If that struct changes in
`TranscriptionWorkspace.swift`, update the mirror.

## Known gaps

- No import, export, or edit path for configurations. The examples are
  illustrative serialization only.
- `options` and `region` are carried, fingerprinted, and never read.
- Model catalogs are static adapter metadata; nothing refreshes them upstream.
- Local adapters never install models. `needsDownload` is terminal until the
  host's existing installer runs.
- Remote account acceptance is largely unverified — see the
  [acceptance audit](../reports/transcription-acceptance-audit.md). Only
  OpenRouter MAI and ElevenLabs Scribe have passing live requests.
