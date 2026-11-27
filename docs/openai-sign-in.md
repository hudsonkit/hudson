# OpenAI as a Hudson AI provider

Status as of 2026-11-27. This note covers three paths: a pasted OpenAI API key, a ChatGPT plan through the Codex CLI (both work today), and Hudson's own "Sign in with ChatGPT", which is researched here but not built.

## 1. OpenAI API key (works today)

1. Open **Hudson AI → Settings → Environment Credentials**.
2. Click the `OPENAI_API_KEY` chip, paste the key, and click **Save**. The key goes into the encrypted local vault (`.data/hudson-local-vault.json`), not into `.env.local`.
3. Under **Hudson Default** (or **Workspace Override**), set **AI Provider** to **OpenAI**. The model changes to `gpt-4o-mini`, and the model list shows only OpenAI models.
4. Chat from the console AI tab.

Server path: `apps/web/app/api/ai/chat` → Pi backend → provider `openai` with credential `OPENAI_API_KEY`.

The following fixes were needed to make this work end to end:

- **Provider/model pairing.** Changing the provider kept the old model, so OpenAI received `gemini-3-flash-preview`. Now a provider change resets the model to that provider's default (`withProviderDefaultModel`), and the model picker shows only the selected provider's models (`modelOptionsForProvider`). Both helpers are in `apps/web/app/lib/ai-models.ts`.
- **Same-tab settings sync.** The Hudson AI window and the shell each hold a `useAppSettings('hudson-ai')` copy. The shell's copy stayed stale, so the console kept sending the old provider. `usePersistentState` now adopts writes that another instance in the same tab makes to the same key (through `hudson:saved`).
- **Restore under StrictMode.** After a reload, the stored setting was overwritten with defaults. The cause: the restore guard was a ref, and the React 19 StrictMode double render kept the ref but dropped the restored value. The guard is now state. This bug affected every `usePersistentState` value in dev, not only AI settings.

## 2. ChatGPT plan through Codex (works today, local Hudson only)

Hudson does not run its own ChatGPT sign-in. It uses the Codex CLI on the same machine, which is already signed in to the user's ChatGPT plan. OpenAI documents Codex app-server as a supported way for an app to use a ChatGPT plan ([Codex app-server route](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)).

1. Install the Codex CLI and run `codex login` (choose ChatGPT).
2. Open **Hudson AI → Settings**. Under **Hudson Default**, set **AI Provider** to **Codex (ChatGPT plan)**. The model list shows the models Codex reports for that account.
3. Chat from the console AI tab.

How it works:

- `/api/ai/models` asks Codex for its model list. If Codex is not installed or returns no models, the provider is not listed. The hosted site has no Codex, so it never shows the provider.
- `/api/ai/chat` sends `provider: "codex"` to `apps/web/app/api/ai/codex.ts`. That module runs one Codex turn through the Scout backend (`@hudsonkit/ai/scout`) and returns the reply as a UI message stream. Earlier messages are added to the prompt as a transcript.
- **Sandbox.** agent-sessions starts Codex with full machine access and no approval prompts by default. Hudson starts Codex itself instead, with `sandbox: "read-only"` and `approvalPolicy: "never"`, in the empty folder `~/.hudson/codex-chat`. A turn can read files but cannot write them. A request to write a file fails with "the filesystem is read-only".

Limits:

- Hudson's app tools do not run in a Codex turn. Codex gets Hudson's system prompt only.
- The reply arrives whole, not token by token. A cold turn takes about 4–5 seconds.
- The read-only sandbox still lets Codex read files on the machine.

## 3. Hudson's own "Sign in with ChatGPT": what OpenAI supports

OpenAI ships an official program for this: **Sign in with ChatGPT (SIWC)** with **ChatGPT plan usage** ([docs](https://developers.openai.com/siwc), [quickstart](https://developers.openai.com/siwc/quickstart), [help center](https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites), [user page](https://learn.chatgpt.com/docs/sign-in-with-chatgpt)). It was expanded at DevDay 2026 ([The New Stack](https://thenewstack.io/sign-in-with-chatgpt/)).

**Who may use it**

- Plan usage is documented for **open-source apps and personal projects that run locally**, and for selected private clients ([overview](https://developers.openai.com/siwc/token-sharing-open-source), [cookbook](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt)). Hudson is public under Apache-2.0, so local Hudson fits.
- **Paid or remotely hosted apps** must fill in the [interest form](https://openai.com/form/sign-in-with-chatgpt-interest/) and wait for approval. The hosted site, **app.hudsonkit.com**, is not covered today.
- A single-user self-hosted VM is supported: you sign in locally and copy the credential file to the VM ([self-hosted VMs](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms)). Multi-tenant hosting is not covered.
- Users: eligible Plus and Pro subscribers per the developer docs. The help center also lists Go and Business. Plus users share one 5-hour limit across all apps. Users can cap usage per app in ChatGPT Settings → Usage.

**How it works**

| Step | Details |
|---|---|
| Registration | Dynamic, with no client secret and no API key. The first authorize request uses `client_id=dynamic_agent_client` plus `agent_name_hint`. The callback returns an issued `client_id` (`oaiapp_…`), which the app stores and reuses. Each install has a stable `ext_agent_host_id`. |
| Authorize | `https://auth.openai.com/api/accounts/authorize`, PKCE S256, scopes `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`, `resource=https://api.openai.com/v1` |
| Redirect URI | Loopback on `http://127.0.0.1:<port>/auth/callback`. The docs say not to use `localhost`. The listener must start before the browser opens. |
| Tokens | Access tokens last 1 hour. Refresh tokens last 30 days and rotate on each refresh, so refreshes must be serialized. Revoke on sign-out. |
| Inference | `POST https://api.openai.com/v1/responses` with `Authorization: Bearer <access token>`. Every request needs `store=false` and `stream=true`. A request counts as successful only after `response.completed`. Get models from `GET /v1/models` and keep entries with `visibility == "list"`. |
| Limits | Function and custom tools are supported. Image generation, file search, code interpreter, computer use, and hosted MCP are not. Omit `temperature`, `max_output_tokens`, and `previous_response_id`. Send `instructions`, not system messages ([preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)). |
| Storage | Tokens must live in protected local or self-hosted runtime storage. Never put them in browser storage, logs, or URLs. |

**What is not allowed, or not documented**

- No OpenAI page grants permission to reuse **Codex CLI's** login (`client_id app_EMoamEEZ73f0CkXaXp7hrann`) or to call `chatgpt.com/backend-api`. The inference docs say not to point requests at backend-api endpoints. The supported route is the app's own SIWC registration.
- Hudson's current `openai-codex` provider does exactly that. `@earendil-works/pi-ai` 0.85.1 (`dist/auth/oauth/openai-codex.js`) logs in with Codex CLI's client ID on `localhost:1455` and calls `chatgpt.com/backend-api`. Pi is listed as an SIWC open-source partner, so a newer pi-ai release may already use SIWC. Check that before you build anything.

## Recommendation

1. **Ship the API-key path now.** It is done and verified.
2. **Use Codex for ChatGPT plans on local Hudson.** It is done and verified (section 2).
3. **Build Hudson's own "Continue with ChatGPT" only if Codex is not enough**, for example to run Hudson tools or to stream tokens. Use the official SIWC flow:
   - Server route `POST /api/ai/chatgpt/sign-in` starts a one-shot listener on `127.0.0.1:<port>`, opens the authorize URL (dynamic registration with PKCE), exchanges the code, and stores `{client_id, access_token, refresh_token, id_token, ext_agent_host_id}` in the existing local vault, never in the browser.
   - Add a `chatgpt-plan` provider in `providers.ts` / the Pi backend. It refreshes tokens under a lock and calls `api.openai.com/v1/responses` with `store:false, stream:true`. It omits the parameters listed in Limits, and it fetches models from `/v1/models` with the user's token.
   - Add a **Continue with ChatGPT** button next to Environment Credentials, following the [UI/UX guidelines](https://developers.openai.com/siwc/ui-ux-guidelines), plus a sign-out action that revokes the tokens.
   - First check pi-ai. Version 1.5.2 and later include `auth/oauth/openai-chatgpt.js`, which uses the SIWC flow (`dynamic_agent_client`, `chatgpt.tokens.use.direct`, `127.0.0.1` callback). Use pi-ai's flow rather than writing our own.
4. **Do not offer ChatGPT sign-in on app.hudsonkit.com** until OpenAI approves an interest-form application. Production keeps Workers AI.
5. **Retire or relabel the `openai-codex` path**, which relies on Codex CLI's client ID. Also note: the Pi backend maps provider `copilot` to `openai-codex` (`packages/web/ai-backends/src/adapters/pi-ai.ts:normalizeProvider`). With no Codex login, Hudson's default provider fails with `No API key for provider "openai-codex"`.
