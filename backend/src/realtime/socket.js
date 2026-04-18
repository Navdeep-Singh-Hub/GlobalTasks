import { Server } from "socket.io";

export function setupSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: ["http://localhost:3000", "http://127.0.0.1:3000", process.env.CLIENT_ORIGIN || "http://localhost:3000"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    socket.on("auth:join", ({ userId }) => {
      if (userId) socket.join(`user:${userId}`);
    });
  });

  return io;
}

