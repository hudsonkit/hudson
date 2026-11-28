// The ready-made preload script (dist/preload.cjs), for windows that don't
// need their own. Bundled to one CommonJS file so it runs with sandbox on.
import { exposeHudsonBridge } from './preload-api';

exposeHudsonBridge();
