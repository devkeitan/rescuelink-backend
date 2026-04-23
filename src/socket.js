const initSocket = (io) => {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

     socket.on('join_room', ({ role, userId }) => {
      // Leave any previous rooms first (handles page refresh / reconnects)
      socket.rooms.forEach((room) => {
        if (room !== socket.id) socket.leave(room);
      });

      // Join role room — e.g. 'admin', 'dispatcher', 'responder', 'user'
      socket.join(role);

      // Join personal room — e.g. 'user_5'
      // Used for direct notifications like "you were assigned to crash #42"
      socket.join(`user_${userId}`);

      console.log(`[Socket] ${socket.id} joined rooms: [${role}, user_${userId}]`);
    });


    // ✅ Client calls this on logout
    socket.on('leave_room', () => {
      socket.rooms.forEach((room) => {
        if (room !== socket.id) socket.leave(room);
      });
      console.log(`[Socket] ${socket.id} left all rooms`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
    });
  });
};

module.exports = { initSocket };