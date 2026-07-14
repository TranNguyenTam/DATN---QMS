const API_URL = import.meta.env.VITE_API_URL || `${window.location.origin}/api/v1`;

const tryRefreshToken = async () => {
    const refreshToken = localStorage.getItem("refreshToken");
    if (!refreshToken) return null;

    const refreshRes = await fetch(`${API_URL}/auth/refresh-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
    });

    if (!refreshRes.ok) return null;

    const payload = await refreshRes.json().catch(() => null);
    const newToken = payload?.data?.token;
    const newRefreshToken = payload?.data?.refreshToken;
    if (!newToken || !newRefreshToken) return null;

    localStorage.setItem("token", newToken);
    localStorage.setItem("refreshToken", newRefreshToken);
    return newToken;
};

const requestTts = async (token, text, debugId) => {
    return fetch(`${API_URL}/common/tts`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "*/*",
            "X-TTS-Debug-Id": debugId,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text }),
    });
};

export async function postVoice(textOrToken, maybeText) {
    const text = maybeText ?? textOrToken;
    if (!text) return null;

    try {
        const token = localStorage.getItem("token");
        const debugId = `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        console.info("[TTS][FE] Request start", { debugId, text });

        let response = await requestTts(token, text, debugId);

        console.info("[TTS][FE] Response", {
            debugId,
            status: response.status,
            ok: response.ok,
            contentType: response.headers.get("content-type"),
        });

        if (response.status === 401) {
            const refreshedToken = await tryRefreshToken();
            if (refreshedToken) {
                console.info("[TTS][FE] Token refreshed, retrying TTS", { debugId });
                response = await requestTts(refreshedToken, text, `${debugId}-retry`);
                console.info("[TTS][FE] Retry response", {
                    debugId,
                    status: response.status,
                    ok: response.ok,
                    contentType: response.headers.get("content-type"),
                });
            }
        }

        if (!response.ok) {
            const errorBody = await response.text();
            console.error("[TTS][FE] API Error", { debugId, body: errorBody });
            return null;
        }

        const audio = await response.arrayBuffer();
        console.info("[TTS][FE] Audio bytes", { debugId, bytes: audio.byteLength });
        return audio;
    } catch (err) {
        console.error("[TTS][FE] postVoice error", err);
        return null;
    }
}
