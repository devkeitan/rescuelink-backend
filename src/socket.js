const initSocket = (io) => {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

     socket.on('join_room', ({ role, userId }) => {
      
      socket.rooms.forEach((room) => {
        if (room !== socket.id) socket.leave(room);
      });

      
      socket.join(role);

     
      socket.join(`user_${userId}`);

      console.log(`[Socket] ${socket.id} joined rooms: [${role}, user_${userId}]`);
    });


    
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