// useSocket.js
import { useContext } from "react";
import { SocketContext } from "../contexts/SocketContext";

export const useSocket = () => {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used inside SocketProvider");
  return ctx;
};
