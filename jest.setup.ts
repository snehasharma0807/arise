import "@testing-library/jest-dom";

// ── HTMLAudioElement mock ────────────────────────────────────────────────────
// jsdom doesn't implement HTMLAudioElement. We provide a controllable mock
// so hook/component tests can fire onplay, onended, onerror etc. manually.

export interface MockAudio {
  play: jest.Mock;
  pause: jest.Mock;
  load: jest.Mock;
  src: string;
  ended: boolean;
  duration: number;
  currentTime: number;
  onplay: (() => void) | null;
  onpause: (() => void) | null;
  onended: (() => void) | null;
  onerror: (() => void) | null;
  onloadedmetadata: (() => void) | null;
  ontimeupdate: (() => void) | null;
}

let _lastAudioInstance: MockAudio | null = null;

/** Returns the most recently constructed Audio mock — useful in tests. */
export function getLastAudioInstance(): MockAudio {
  if (!_lastAudioInstance) throw new Error("No Audio instance created yet");
  return _lastAudioInstance;
}

const MockAudioConstructor = jest.fn().mockImplementation((src?: string) => {
  const instance: MockAudio = {
    // Capture src passed to new Audio(src), matching real browser behaviour
    src: src ?? "",
    ended: false,
    duration: 120,
    currentTime: 0,
    onplay: null,
    onpause: null,
    onended: null,
    onerror: null,
    onloadedmetadata: null,
    ontimeupdate: null,
    pause: jest.fn(),
    load: jest.fn(),
    // play() resolves then fires onplay — mirrors real HTMLAudioElement behaviour
    play: jest.fn().mockImplementation(() =>
      Promise.resolve().then(() => {
        instance.onplay?.();
      })
    ),
  };
  _lastAudioInstance = instance;
  return instance;
});

Object.defineProperty(global, "Audio", {
  writable: true,
  value: MockAudioConstructor,
});

// ── URL mocks ────────────────────────────────────────────────────────────────

global.URL.createObjectURL = jest.fn(() => "blob:mock-object-url");
global.URL.revokeObjectURL = jest.fn();

// ── fetch mock ───────────────────────────────────────────────────────────────
// Individual tests override this per-case. Default: success with audio/mpeg.

global.fetch = jest.fn();

/**
 * Creates a minimal fetch-Response-shaped object without relying on
 * the global `Response` constructor (not available in jest-environment-jsdom).
 */
function makeMockResponse(
  bodyInit: Blob | string,
  status: number,
  headersMap: Record<string, string>
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (key: string) =>
        headersMap[key] ?? headersMap[key.toLowerCase()] ?? null,
    },
    blob: jest.fn().mockResolvedValue(
      typeof bodyInit === "string"
        ? new Blob([bodyInit], { type: "application/octet-stream" })
        : bodyInit
    ),
    json: jest.fn().mockImplementation(() => {
      const text = typeof bodyInit === "string" ? bodyInit : "";
      return Promise.resolve(JSON.parse(text));
    }),
    text: jest.fn().mockResolvedValue(
      typeof bodyInit === "string" ? bodyInit : ""
    ),
  };
}

/** Helper: make global.fetch resolve with an audio/mpeg blob response. */
export function mockFetchAudioSuccess(meta?: object) {
  const headersMap: Record<string, string> = { "Content-Type": "audio/mpeg" };
  if (meta) headersMap["X-Arise-Meta"] = JSON.stringify(meta);

  (global.fetch as jest.Mock).mockResolvedValueOnce(
    makeMockResponse(new Blob(["fake-audio"], { type: "audio/mpeg" }), 200, headersMap)
  );
}

/** Helper: make global.fetch reject with an error JSON body. */
export function mockFetchError(message: string, status = 500) {
  (global.fetch as jest.Mock).mockResolvedValueOnce(
    makeMockResponse(JSON.stringify({ error: message }), status, {
      "Content-Type": "application/json",
    })
  );
}

// ── Environment variables ────────────────────────────────────────────────────

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test-project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-anon-key";

// ── Reset mocks between tests ────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  _lastAudioInstance = null;
  // Re-apply default resolved value for createObjectURL after clearAllMocks
  (global.URL.createObjectURL as jest.Mock).mockReturnValue("blob:mock-object-url");
});
