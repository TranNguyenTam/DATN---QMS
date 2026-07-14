import { useCallback, useEffect, useRef, useState } from "react";
import { EVENTS_NEED_VOICE } from "../../const/const";
import { useSocket } from "../../hooks/useSocket";
import { postVoice } from "../../util/amthanhApi";

const VoiceQueuePlayer = ({ token, phongBanId, getPatientText }) => {
  const [queue, setQueue] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const queueRef = useRef([]);
  const { isConnected, subscribe, unsubscribe } = useSocket();

  // 1. Lắng nghe sự kiện GOI_BN / GOI_LAI từ STOMP WebSocket
  const handleMessage = useCallback(
    (data) => {
      if (!EVENTS_NEED_VOICE.has(data?.event)) return;
      if (phongBanId && data?.phongBanId !== phongBanId) return;

      const text = getPatientText ? getPatientText(data) : null;
      if (!text) return;

      const newQueue = [...queueRef.current, text];
      queueRef.current = newQueue;
      setQueue(newQueue);
    },
    [phongBanId, getPatientText],
  );

  useEffect(() => {
    if (!isConnected) return;
    const __sub = subscribe("/topic/messages", handleMessage);
    return () => __sub?.unsubscribe();
  }, [isConnected, subscribe, unsubscribe, handleMessage]);

  // 2. Xử lý hàng đợi âm thanh
  useEffect(() => {
    const processQueue = async () => {
      if (isProcessing || queue.length === 0) return;

      setIsProcessing(true);
      const textToSpeak = queue[0];

      try {
        const audioData = await postVoice(token, textToSpeak);
        if (audioData) {
          await playAudioBuffer(audioData);
        }
      } catch (error) {
        console.error("Lỗi khi xử lý voice:", error);
      } finally {
        const remainingQueue = queue.slice(1);
        queueRef.current = remainingQueue;
        setQueue(remainingQueue);
        setIsProcessing(false);
      }
    };

    processQueue();
  }, [queue, isProcessing, token]);

  // 3. Phát âm thanh từ ArrayBuffer
  const playAudioBuffer = (arrayBuffer) => {
    return new Promise((resolve, reject) => {
      try {
        const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = (e) => reject(e);
        audio.play();
      } catch (err) {
        reject(err);
      }
    });
  };

  return null;
};

export default VoiceQueuePlayer;
