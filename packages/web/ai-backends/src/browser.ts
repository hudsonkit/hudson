// Host-owned browser runtime. Apps supply their toolsets and visitor credentials;
// provider adapters remain internal to Hudson and never require an npm AI package.
import { createPiAiBackend, type PiAiUIRequest } from './adapters/pi-ai';

const backend = createPiAiBackend();

export function streamUI(request: PiAiUIRequest): Response {
  return backend.streamUI(request);
}
