import { useCallback, useRef } from "react";
import { postVoice } from "../util/amthanhApi";

/**
 * Loa gọi BN — 2 tầng:
 *   1. Viettel TTS qua BE /common/tts (chất lượng cao, cần token)
 *   2. Fallback Web Speech API browser (miễn phí, không cần config)
 *
 * Nếu BE trả null (token rỗng / Viettel down / network) → tự động
 * dùng speechSynthesis của browser. Không hiện toast lỗi để khỏi
 * gián đoạn quầy gọi BN.
 */
export const useVoiceAnnouncement = () => {
  const queueRef = useRef([]);
  const isSpeakingRef = useRef(false);

  const playAudioBuffer = useCallback((arrayBuffer) => {
    return new Promise((resolve, reject) => {
      try {
        const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = (e) => {
          URL.revokeObjectURL(url);
          reject(e);
        };

        audio.play().catch(reject);
      } catch (err) {
        reject(err);
      }
    });
  }, []);

  // Fallback Web Speech API — chọn voice tiếng Việt nếu có.
  const speakWithBrowser = useCallback((text) => {
    return new Promise((resolve) => {
      if (typeof window === "undefined" || !window.speechSynthesis) {
        console.warn("[TTS][FE] Web Speech API không hỗ trợ");
        resolve();
        return;
      }

      const u = new SpeechSynthesisUtterance(text);
      u.lang = "vi-VN";
      u.rate = 0.9;
      u.pitch = 1.0;
      u.volume = 1.0;

      // Pick best voice
      const voices = window.speechSynthesis.getVoices();
      const viVoice =
        voices.find((v) => v.lang === "vi-VN") ||
        voices.find((v) => v.lang?.startsWith("vi"));
      if (viVoice) u.voice = viVoice;

      u.onend = () => resolve();
      u.onerror = (e) => {
        console.warn("[TTS][FE] Browser speak error", e);
        resolve();
      };

      window.speechSynthesis.cancel(); // drop any leftover
      window.speechSynthesis.speak(u);
    });
  }, []);

  const processQueue = useCallback(async () => {
    if (isSpeakingRef.current) return;
    const nextText = queueRef.current.shift();
    if (!nextText) return;

    isSpeakingRef.current = true;
    try {
      console.info("[TTS][FE] Processing queue item", { text: nextText });

      // Tầng 1: Viettel qua BE
      let played = false;
      try {
        const audioData = await postVoice(nextText);
        if (audioData && audioData.byteLength > 0) {
          console.info("[TTS][FE] Playing Viettel audio", { bytes: audioData.byteLength });
          await playAudioBuffer(audioData);
          played = true;
        }
      } catch (e) {
        console.info("[TTS][FE] Viettel TTS không khả dụng, dùng browser", e?.message);
      }

      // Tầng 2: Browser Web Speech API
      if (!played) {
        console.info("[TTS][FE] Fallback browser speechSynthesis");
        await speakWithBrowser(nextText);
      }
    } catch (error) {
      console.error("Lỗi phát âm thanh:", error);
    } finally {
      isSpeakingRef.current = false;
      processQueue();
    }
  }, [playAudioBuffer, speakWithBrowser]);

  const announce = useCallback(
    (text) => {
      if (!text) return;
      queueRef.current.push(text);
      console.info("[TTS][FE] Enqueue", { text, queueSize: queueRef.current.length });
      processQueue();
    },
    [processQueue],
  );

  return { announce, isSupported: true };
};
