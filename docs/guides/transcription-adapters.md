# Transcription adapters

Status: Implemented in isolated worktrees; not released. Source and evidence
reconciled September 16, 2026. Remote provider acceptance and native product
interaction checks remain open. The
[acceptance audit](../reports/transcription-acceptance-audit.md) records those
limits separately from builds and fixture tests. The WhisperKit reference adapter
was removed on September 24, 2026, and the FluidAudio adapter on October 22, 2026;
reports written before then still describe them. Hudson ships no local adapter.

Audience: developers adding an engine or integrating the contract into a host.

## Implementation map

- [HudsonTranscription](../../packages/native/apple/HudsonKit/Sources/HudsonTranscription/)
  owns the public contract, capability descriptors, registry, normalized results,
  configuration fingerprints, and file/live lifecycle types.
- [HudsonTranscriptionUI](../../packages/native/apple/HudsonKit/Sources/HudsonTranscriptionUI/)
  supplies controlled SwiftUI configuration fields driven by an adapter's schema.
  It depends only on the contract and SwiftUI; no engine SDK or Talkie type is
  required. Talkie's settings use this component.
- [HudsonTranscriptionCloud](../../packages/native/apple/HudsonKit/Sources/HudsonTranscriptionCloud/)
  supplies MAI and separate Gemini file, dedicated live, and conversational-input
  adapters. Credential resolution belongs to the host.
- [HudsonTranscriptionElevenLabs](../../packages/native/apple/HudsonKit/Sources/HudsonTranscriptionElevenLabs/)
  demonstrates a remote reference adapter through the same contract.

Talkie's separate TalkieTranscription package composes these implementations.
Its TranscriptionHost creates app and agent registries, a shared selection file,
and distinct per-process run/upload ledgers. The agent reads selections; the app
writes them. No selection preserves the established engine path. A selected
adapter failure must propagate instead of choosing another provider.

## Shared setup fields

Link `HudsonTranscriptionUI` and render `HudTranscriptionConfigurationFields` with
the selected provider's `configurationSchema`. Supply bindings for raw endpoint
and region text, the opaque credential reference name, the model folder, and
the options dictionary. Each field uses the descriptor's display name, including
custom text options. The component leaves model selection to the host's filtered
picker and does not accept a secret value.

`HudTranscriptionModelPicker` takes the catalog, a selected model ID binding,
and a dictionary of host-provided exclusion reasons keyed by model ID. Excluded
models stay visible but disabled; a disclosure lists their reasons. An unavailable
saved ID remains visible, so a catalog change does not silently choose a new model.
The host must independently enforce eligibility when saving or using a selection.
Talkie applies the same use-case eligibility function to the picker and save path.

The host validates the draft, stores any secret through its credential store,
records upload consent against the full configuration fingerprint, calls explicit
preparation, and saves the selection. Keeping raw strings in the editing state
allows the host to explain invalid input rather than silently replacing it with
nil. The shared fields do not read files, call providers, download models, grant
consent, or persist state. `HudTranscriptionProviderPicker` also provides controlled provider selection,
including an explicit host-supplied existing-engine option and a disabled entry
for an unavailable saved provider. Talkie keeps configuration resets and consent
invalidation in its selection binding. Its macOS setup includes a native folder
chooser for existing local models; selecting a folder does not load or download
models. Model installation remains an outstanding design requirement.

## Local model retention

`HudTranscriptionLocalResources` owns one prepared local model and an exclusive
operation or session lease. A local adapter accepts this owner through its initializer.
Preparation of a different model reports `preparing` while native work holds a
lease. Once idle, preparing another model evicts the previous in-memory value;
`unloadIfIdle()` releases memory without deleting model files.

Batch inference stays inside `withResource`. Live sessions retain a lease in their
inference closure. Cancellation releases idle session ownership immediately, but
an inference task that ignores cancellation retains the lease until native work
actually returns. A terminal event alone is not proof that model resources are
idle. Callers must serialize native calls within an individual session lease.

A host creates one owner per transcription workspace and injects it into each
local adapter. Separate app and agent processes have independent owners; legacy Vox
paths do not acquire these leases. This is not a cross-process memory budget.

## Existing model installation

Talkie retains its existing Parakeet installation flow in
`TalkieEngineCore/EngineService.downloadModel`. A local adapter's preparation
loads existing files; missing assets return `needsDownload` and do not start a
download implicitly.

Hudson does not add a second model installer, repository manifest resolver, or
installation-plan requirement to the adapter contract. Hosts retain their existing
SDK-backed installation and cache ownership.

Audience: a developer adding or wrapping a transcription engine for Hudson and Talkie.

Outcome: an app can select an engine for dictation, a recording, or a meeting track without inheriting that engine's transport, model lifecycle, or response format.

## Current behavior that stays

These surfaces already exist. The new contract sits beside them. It does not replace them in the contract change.

| Surface | Path | Keep |
| --- | --- | --- |
| Embedded dictation | [`HudDictation.swift`](../../packages/native/apple/HudsonKit/Sources/HudsonVoice/HudDictation.swift) | Callers, Parakeet plus Apple partials/fallback, `parakeetOnly`, and the held-utterance queue |
| Queued dictation store | [`HudPendingUtterances.swift`](../../packages/native/apple/HudsonKit/Sources/HudsonVoice/HudPendingUtterances.swift) | Capture-order replay across launches |
| Apple Speech file facade | [`HudAudioTranscriber.swift`](../../packages/native/apple/HudsonKit/Sources/HudsonUIAudio/HudAudioTranscriber.swift) | Existing update/result types behind a compatibility facade |
| Vox WebSocket session | [`HudVoxLiveSession.swift`](../../packages/native/apple/HudsonKit/Sources/HudsonVoice/HudVoxLiveSession.swift) | One implementation. It is not the provider-neutral contract |
| Event vocabulary | [`HudVoiceTypes.swift`](../../packages/native/apple/HudsonKit/Sources/HudsonVoice/HudVoiceTypes.swift) | Concepts for partials, finals, session state, and word timing. Audit names before reuse |
| Secret storage | [`HudVault.swift`](../../packages/native/apple/HudsonKit/Sources/HudsonUI/Vault/HudVault.swift) | Host-owned credentials. Core transcription must not depend on settings UI |
| Package embedding | root [`Package.swift`](../../Package.swift) | `HudsonVoice` already links `VoxCore`, `VoxEngine`, and `VoxAppleSpeech`. Do not remove those dependencies or switch existing consumers |

Vox daemon capture: `HudVoxLiveSession.start()` sends `transcribe.startSession`. Vox then starts its own microphone recorder. That path is capture-owning. It is not a caller-fed PCM adapter. A future Vox adapter must accept a file or PCM from the caller before it can process Talkie-owned meeting tracks. Starting a second microphone is not a valid bridge.

Vox is optional. A local adapter can embed a library or supervise a process. A remote adapter calls its vendor directly. Neither requires a Vox hop.

Talkie already hosts FluidAudio Parakeet and WhisperKit, and uses ElevenLabs and Deepgram for meeting annotation. Those product paths stay. Existing Talkie types bridge into Hudson. Hudson transcription must not depend on TalkieKit.

## Ownership

```text
Talkie: capture, recordings, meeting tracks, durable runs, consent, use-case defaults
                               |
Hudson: descriptors, request validation, jobs/sessions, results, configuration schema
                |                   |                  |
          MAI / Gemini       Custom vendor API    Custom local
          remote adapters    adapter              library/process
                                                     |
                                               Vox is one option
```

Talkie owns the job: which audio, which default, whether upload is allowed, and where the result is stored.

Hudson owns the reusable contract: descriptors, validation, preparation, job and session lifecycle, normalized results, and configuration schema. Talkie currently owns the native
settings view; shared SwiftUI setup components are not delivered by the core target.

An adapter owns one engine: talk to that vendor or local runtime, report what it can do, and map its output onto Hudson result types.

An adapter must not:

- own meeting persistence
- select another provider
- decide to upload audio
- add repeated permission prompts
- fall back silently from local to remote
- send diagnostic audio during an ordinary readiness check
- start a second microphone capture

The root `Package.swift` declares the five transcription products listed above.
`HudsonTranscription` uses Foundation and CryptoKit without a native engine SDK.
Optional adapter targets depend inward on the contract. Native SDK dependencies
belong to their adapter targets. Shared SwiftUI setup components remain a design
follow-up; the current settings implementation is in Talkie.

Local/remote and maintained/custom are independent. A custom remote adapter is still a direct vendor client. A custom local adapter can embed a library. "Custom" in v1 means a compiled package registered by the app, not a runtime-installed executable plugin.

## Smallest adapter

Ship the smallest package that can answer these questions for one engine.

1. Who are you? Stable provider ID, display name, adapter version, maintainer/origin, locality, platforms.
2. How are you configured? Non-secret provider/model/endpoint/region fields plus an opaque credential reference or a local model location. No secret values in configuration.
3. Which models exist? Upstream catalog when the vendor has one; otherwise versioned adapter metadata. Do not invent dynamic discovery. A saved identifier that is temporarily absent stays saved and reports unavailable. Do not silently substitute a model.
4. Can this request run? Evaluate the whole request, including duration and feature combinations. Return supported, unsupported, or unverified, with machine-readable reasons and user-facing explanations.
5. Are you ready? Unconfigured, needs credential, needs download, preparing, ready, unavailable, or failed. Readiness is not compatibility, and it is not live-test evidence.
6. Can you run the job or session you advertised? Batch file, live PCM, or both. Publish only what you have implemented and verified.
7. What came back? Normalized transcript plus provenance. Missing confidence, timing, or speaker fields stay missing.

The compiled protocol is
[`HudTranscriptionAdapter`](../../packages/native/apple/HudsonKit/Sources/HudsonTranscription/HudTranscriptionAdapter.swift).
Its members are `descriptor`, `models(configuration:)`,
`compatibility(request:configuration:)`, `readiness(configuration:)`,
`prepare(configuration:)`, `submit(_:configuration:)`, and
`openLive(_:configuration:)`. Batch and live methods have defaults that throw
`HudTranscriptionError.unsupportedMode`. Advertise a mode only when the adapter
implements it. The default preparation method performs readiness only.

See the [source-linked reference walkthrough](../examples/transcription-reference-walkthrough.md)
for the executable ElevenLabs public-API example. Use that compiled example
instead of a separate pseudocode API.

Capabilities are not a Boolean set. A file model that can label speakers can still reject a long meeting. Unknown limits must not be treated as unlimited.

## Registration and capability filtering

v1 registration is application composition of compiled adapter packages. Settings lists registered adapters and their setup. It must not show a nonfunctional Install plugin button.

Create a `HudTranscriptionRegistry`, then register each compiled adapter with
`try await registry.register(adapter)`. Duplicate provider IDs throw.
`retainSaved(_:)` keeps configurations for unavailable providers or models.
`resolve(_:)` reports the saved selection's current availability without replacing
it. `evaluate(request:configurations:)` returns compatibility and readiness for
each configuration. A candidate's `canRun` requires both to permit execution.

Current model catalogs are static adapter metadata. They do not automatically
refresh from upstream. Add model metadata and its compatibility rules inside the
adapter, then verify its wire format and lifecycle. Do not add a UI allowlist.

The picker, result viewer, and coordinator use the public contract only. Do not add provider-specific branches when you add an engine.

A picker groups compatible models by locality. An incompatible option can be inspected with its specific reason. It cannot be selected for an unsupported job. Unverified capabilities are not shown as ready. A setup-required compatible option leads to setup before it becomes the default. One provider account setup is shared even when file and live models differ.

Required maintained model targets, kept explicit:

| Target | Use | Do not |
| --- | --- | --- |
| `MAI-Transcribe-2` | File transcription first | Fall back to MAI-Transcribe-1 or 1.5. Do not inherit file capabilities onto MAI Voice Live |
| `gemini-3.5-transcribe` | Dedicated file transcription | Silently replace with a conversational model |
| `gemini-3.5-transcribe-live` | Dedicated live input transcription | Apply its session limits to Gemini 3.8 Live |
| `gemini-3.8-live` | Explicit live input-transcription evaluation | Treat it as a tested replacement for dedicated Transcribe Live, or assume speaker labels and word timings |

Recheck the [Google model catalog](https://ai.google.dev/gemini-api/docs/models) before implementation. Record the model actually used. If the configured model is unavailable, report unavailable. Do not silently downgrade.

Provider constraints that the evaluator must represent (documentation-derived, not live-verified here):

| Engine | Constraint | Source |
| --- | --- | --- |
| MAI-Transcribe-2 | File transcription, word timing, diarization. Diarization can fail around 15 minutes or longer. Voice Live is a separate path. Live support stays unverified until checked | [Microsoft documentation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/mai-transcribe) |
| Gemini files | Speaker labels and word timings. Annotated audio limited to 30 minutes. Three or more speakers experimental. Vocabulary hints conflict with those annotations. Smart formatting also conflicts | [Google file transcription](https://ai.google.dev/gemini-api/docs/transcribe) |
| Gemini 3.5 live | Separate live model and API. Documented sessions last up to ten minutes. Interim and final utterances. No live speaker diarization or word-level timing. Rotation needs caller-owned timeline continuity | [Google live transcription](https://ai.google.dev/gemini-api/docs/live-api/live-transcribe) |
| Gemini 3.8 Live | Conversational Live model with input-audio transcription, separate from generated-speech transcripts. Requires audio response modality and permanently enables proactive audio. Discarding generated audio does not prove generation or its cost is disabled. Speaker labels and word timings unverified. Do not apply dedicated Transcribe Live session limits | [Model details](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live), [input and output transcription](https://ai.google.dev/gemini-api/docs/live-api/capabilities#audio-transcriptions) |

Keep provider, model, and API-version identifiers in run provenance. Do not freeze the provider catalog as a UI allowlist.

## Credentials versus local preparation

Remote adapters receive credentials from an injected resolver. The host can back that resolver with `HudVault` or its existing Keychain store. Migration must not copy secrets into JSON.

A local adapter prepares existing model assets. Submission does not install
a model. A complete shared installer, unload control, and cross-adapter memory
arbiter are not implemented by this contract.
If an installer is added, cancellation must not mark partial assets installed,
and it must not remove assets in use.

| Check | Proves | Does not prove |
| --- | --- | --- |
| Readiness / credential probe | Configuration is present, or a local artifact is on disk and loadable | The engine transcribed this audio well |
| Compatibility | This request is allowed, rejected, or unverified before prepare or upload | The vendor accepted a live job |
| Explicit sample transcription | One approved sample request worked | Ordinary readiness. Do not send diagnostic audio from a credential check |

Endpoint or region changes invalidate credential checks and compatibility evidence. Sanitize network errors and raw provider payloads before logs or UI.

Remote use follows the app's configured choice and existing upload consent. Do not prompt repeatedly, and do not send audio because a readiness check ran.

## Lifecycle

### Batch jobs

1. Validate the request and resolve configuration. Do not send audio yet.
2. Prepare local resources or validate credentials. Report progress with no fabricated percentage.
3. Submit and return an operation handle. A local or synchronous implementation may complete immediately. An asynchronous vendor preserves the accepted job identity.
4. Observe progress and completion. Resume polling only where the provider supports it.
5. Cancel local work, or request remote cancellation where supported. Distinguish cancellation requested, cancelled, and remote outcome unknown.

Hand an accepted remote job and its request ID to Talkie's persistence boundary promptly. A timeout after submission may already be billed. Do not automatically resubmit without provider idempotency or a recoverable job ID. Retry policy belongs to the app coordinator. The adapter may advise retryability and delay.

The [reference walkthrough](../examples/transcription-reference-walkthrough.md)
links to a compiled sequence that constructs a configuration and request,
evaluates it through the registry, submits it, and consumes its event stream.
That fixture calls the adapter directly. Product code must use the host's consent
and persistence boundary before submission.

### Live sessions

Open one session with an explicit PCM format. Send ordered, bounded chunks with backpressure. Emit provisional utterance revisions separately from finalized utterances. A finalized utterance does not mean the session has finished. Finish input, drain within a deadline, then emit exactly one terminal result or error. Cancellation must release resources and reject late writes.

Events carry a sequence number, session identity, utterance identity, and audio-relative offsets when available. Do not invent word timestamps from wall-clock arrival. Session rotation preserves caller-owned source offsets. Speaker IDs are scoped to a session or run unless a separate matching step establishes continuity. Audio loss or uncertain finalization is a visible incomplete result, not silent success.

Meeting live captions are provisional. A final transcript can use a different configured provider and must keep its own provenance. Speaker labels may be integrated or a separately selected local diarization step. A combined pipeline is ready only after alignment is implemented and verified. Selecting two engines does not compose them.

Before processing a recording, validate duration and requested annotations. For an unsupported long meeting, explain the constraint and offer an explicitly chosen compatible engine or a verified alternate pipeline. Do not automatically chop audio and treat independent speaker IDs as the same person.

## Normalized results

| Field | Rule |
| --- | --- |
| Transcript | Required text of the result |
| Timed segments and words | Optional. Omit when the engine did not supply them |
| Speaker references | Optional. Session-scoped unless a verified matching step exists |
| Language | Optional detected or requested language |
| Completion status | Completed, cancelled, incomplete audio, failed, or remote outcome unknown |
| Provenance | Required. See below |
| Provider usage or billing | Optional, only when the vendor supplied it |

Provenance must include provider, model, and adapter version; a configuration fingerprint with no secrets; a source digest; the provider request ID when supplied; run and session identity; a timestamp; and whether annotations are native or derived.

Reuse concepts from `HudVoiceTypes` after an audit. Do not assume those concrete types are the new result contract.

## Add a remote engine: ElevenLabs file reference

This is the first reference remote adapter. It is a real vendor integration in a separate example package. It reuses knowledge from Talkie's existing ElevenLabs meeting adapter. It depends only on Hudson's public contract, not TalkieKit. After verification it can be promoted to maintained status without changing its interface.

Talkie already has ElevenLabs and Deepgram meeting providers. Do not remove them. This reference proves file transcription behind the shared contract. It is not a rewrite of Talkie's meeting coordinator.

1. Create a separate example package. Do not add files to Hudson core or TalkieKit.
2. Depend on the public contract and any required reusable transport module; do not depend on TalkieKit.
3. Publish file/batch capability. Do not publish live until that path is implemented and verified.
4. Describe the provider as remote. Configuration holds endpoint or region options and an opaque credential reference.
5. Resolve credentials through the injected resolver. Do not read process environment as a hidden second store.
6. Enumerate models from the vendor catalog if it exists, otherwise from versioned adapter metadata. Round-trip saved IDs.
7. Evaluate the whole file request before upload, including duration and requested annotations.
8. Submit, return an operation handle, and give the host the provider request ID immediately.
9. Map the vendor payload onto the normalized result. Leave missing timing, speaker, and confidence fields missing.
10. Register the package in the app's adapter list. Do not add an ElevenLabs branch to the picker or result viewer.

Cancellation after submit must report cancellation requested, cancelled, or remote outcome unknown. A timeout after accept must not resubmit on its own.

## Add a local engine

Hudson ships no local adapter. A local runtime goes behind the same public contract; the ElevenLabs reference above shows the package shape. Start with batch only. Publish streaming only after implementing and verifying its actual semantics. Vox is one process/service example. It is not a prerequisite.

1. Create a separate package. Do not add the engine's SDK to the contract target.
2. Describe the provider as local. Configuration holds a model location or installation reference, not a secret.
3. Implement readiness and explicit preparation for existing local assets. Keep installation outside submission. If adding download support, verify incomplete-asset and cancellation behavior separately.
4. Serialize access to the runtime. Avoid loading a second runtime for the same job. A shared cross-adapter resource owner remains a follow-up.
5. Accept a caller-owned audio file. Do not open the microphone.
6. Validate the request, prepare, submit, and return a handle. Local completion may be immediate.
7. Map output onto the normalized result and provenance, including adapter version and source digest.
8. Register the package in the app's adapter list. Custom origin is secondary metadata. It must not create a second workflow.
9. Leave streaming unpublished until chunk, partial, and final semantics are verified.

Do not route a local engine through Vox to "make it look like the daemon." A direct adapter means no mandatory daemon hop.

## Adding an engine without changing core or Talkie

| Change | Allowed in the example package | Not allowed |
| --- | --- | --- |
| New vendor or local runtime client | Yes | Inside Hudson core or TalkieKit |
| Provider and model descriptors | Yes | Hard-coded rows in the picker |
| Compatibility constraints | Yes, as data the evaluator reads | `if provider ==` in the coordinator |
| Credential or model-location schema | Yes, non-secret | Secrets in JSON or logs |
| Result mapping | Yes, onto the shared result type | Provider-specific result viewers |
| Live PCM or extra features | Only after that path is verified | Publishing an unverified capability as ready |

Settings can list the new adapter because it is registered. It must not grow an Install plugin control.

Existing Vox-backed dictation stays on `HudDictation`. Existing Vox daemon sessions stay on `HudVoxLiveSession`. New meeting-track work uses caller-fed file or PCM adapters.

## Related tests

See [Transcription adapter testing](transcription-adapter-testing.md) for current
executable coverage, separate native sample results, and remaining acceptance
requirements. The historical HudsonVoice baseline is distinct from the new
adapter tests.

### Persist upload ownership before transcription

`HudGeminiTranscriptionAdapter` requires an asynchronous, throwing upload-event handler. Persist `.created` atomically before returning from the handler. A failure prevents the transcription request and triggers remote file deletion. Persist `.deleted` or `.cleanupRequired` before returning as well. If cleanup cannot be recorded, the operation reports an unknown remote outcome. Keep these records separate from transcript success; cleanup may remain necessary after a successful transcript.

Talkie's host snapshots the selected configuration and consent before preparing a submission, then rechecks after readiness. Multi-track operations pass the same expected selection for each track. A change stops further submission rather than mixing providers or continuing under revoked consent.

The main app obtains a `TranscriptionCapture` before dictation recording starts.
It binds both an adapter selection and the absence of an adapter: selecting a
remote engine during an existing-engine recording cannot change that recording's
route. Clearing or changing a bound adapter rejects submission. The same source
ID identifies capture and submission. Adapter recordings use the shared Audio
directory and are retained after cancellation, failure, and delivery. A pending
dictation row is inserted before microphone capture starts. Completion or failure
updates the latest row without overwriting title or notes, an already completed
transcription, or restoring a deleted recording. Startup failure is recorded even
if no usable audio was captured. The library uses its existing audio playback and
transcription actions; the existing-engine path retains its prior temporary-file
lifecycle. There is no automatic retry. Native interaction acceptance for this
library connection remains outstanding.

While the main app owns an active adapter recording, the transcript section shows
an in-progress explanation instead of retranscription controls. The retranscription
service checks the same ownership state before reading audio, including requests
from other surfaces. Ownership remains held during cancellation until capture
stops and its library status is saved. This is process-local capture ownership;
durable remote outcome records still require separate inspection after restart.

Talkie's settings restore consent for the exact saved configuration fingerprint.
Editing that configuration clears the displayed consent until confirmed. Saving
preserves region and provider option fields and validates required schema fields.
The activity disclosure shows unfinished app and recording-agent requests,
including unknown remote outcomes and provider request IDs when available. It is
read-only: checking activity does not recover another process's running request,
poll a vendor, or retry audio. Provider-side resolution and an explicit recovery
action remain separate from this inspection surface.

### Host live-session durability

Talkie's `TranscriptionWorkspace.openLive` returns a `WorkspaceLiveSession`. Feed PCM with awaited `send` calls and call `finish` once capture ends. Consume its event stream continuously. A completed event means the host saved the result; persistence failure emits a failure instead. Cancellation after remote audio is sent records an unknown remote outcome. The wrapper rechecks the selected configuration and consent before every write, and bounds its event queue and lifetime. The recording owner must keep the captured audio independently; this wrapper does not own or delete recordings.

### Validate completion before delivery

Talkie's workspace requires the result payload's `completion` to be `.completed`
before it persists or delivers success. An outer `.completed(result)` event does
not override a cancelled, incomplete, failed, or unknown payload. Both file and
live paths then validate provider, model, configuration, and run identity.
Contradictory payloads produce a local failure or an unknown remote outcome.
Eight regression cases cover the four contradictory statuses in both modes.

Meeting operations retain separate identities for mic and system tracks. A
completed track is reused from its saved result. An uncertain track is not
silently uploaded again. The workspace fixture verifies this after reloading the
ledger; full meeting merger and repository acceptance remains separate.


The host ledger records `requestedFeatures` for batch and live runs. Meeting
reuse calls `completedResult` to verify source, track, use case, configuration,
requested features, completion and result identity. A changed microphone
speaker-label setting cannot reuse a result from an incompatible request.
Older ledgers decode without this optional metadata, but cannot establish cache
compatibility. A mismatch preserves the result and reports an error; it does not
create a new upload or reinterpret an uncertain earlier request as absent.


Meeting publication reads the latest database row inside the write transaction,
then applies the transcript, turns, model and revision. It preserves title, notes
and unrelated assets edited while transcription ran. The row and meeting sync
outbox commit together. Deleted or already-enriched rows are not recreated or
overwritten. Failed outbox publication rolls back the enrichment. The external
Markdown mirror runs only after a successful transaction.

## MAI via OpenRouter

Register `HudMAITranscriptionAdapter(route: .openRouter, credentials: credentials)`
to use MAI 2 with an OpenRouter account. The provider ID is `openrouter-mai`,
the model ID is `microsoft/mai-transcribe-2`, and the configuration requires a
credential reference resolved by the host. It does not require an Azure endpoint.
The default initializer preserves the direct Azure route. Both routes share
capability validation and operation lifecycle; routing identity remains distinct
in consent and provenance. OpenRouter generation IDs and reported billing usage
are preserved. The service applies a 60-second request timeout, so long-file
acceptance must be evaluated separately; there is no automatic retry or chunking.
