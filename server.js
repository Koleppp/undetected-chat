const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Penyimpanan Data Room Sementara (RAM)
const rooms = {}; 

// Database Nama Binatang
const animalNames = [
    "Kucing", "Anjing", "Harimau", "Gajah", "Semut", "Elang", 
    "Hiu", "Panda", "Kelinci", "Rubah", "Singa", "Zebra", 
    "Koala", "Jerapah", "Bebek", "Ayam", "Kuda", "Penyu", "Hamster",
    "Koi"
];

function getRandomName() {
    return animalNames[Math.floor(Math.random() * animalNames.length)] + "-" + Math.floor(Math.random() * 100);
}

io.on('connection', (socket) => {
    // Variabel state per user
    let currentRoomId = null;
    let currentUserAlias = null;

    // --- 1. JOIN ROOM ---
    socket.on('join_room', (roomId) => {
        // Jika pindah room tanpa logout, bersihkan dulu
        if (currentRoomId) {
            handleLeaveRoom(socket, currentRoomId);
        }

        let room = rooms[roomId];

        // Jika room belum ada, buat baru + set timer 10 menit
        if (!room) {
            const duration = 10 * 60 * 1000; // 10 Menit
            const expiresAt = Date.now() + duration;

            rooms[roomId] = {
                expiresAt: expiresAt,
                users: {}, 
                timer: setTimeout(() => {
                    io.to(roomId).emit('system_message', 'Waktu habis. Room ditutup.');
                    io.in(roomId).disconnectSockets();
                    delete rooms[roomId];
                    console.log(`Room ${roomId} dihapus otomatis.`);
                }, duration)
            };
            room = rooms[roomId];
        }

        // Setup User
        currentUserAlias = getRandomName();
        currentRoomId = roomId;

        socket.join(roomId);
        room.users[socket.id] = currentUserAlias;

        // Kirim data awal ke user
        socket.emit('init_room', {
            name: currentUserAlias,
            expiresAt: room.expiresAt
        });
        
        // Kabari user lain
        io.to(roomId).emit('system_message', `${currentUserAlias} bergabung.`);
        io.to(roomId).emit('update_users', Object.values(room.users));
    });

    // --- 2. KIRIM PESAN ---
    socket.on('send_message', (msg) => {
        if (currentRoomId && currentUserAlias) {
            io.to(currentRoomId).emit('receive_message', { 
                user: currentUserAlias, 
                text: msg
            });
        }
    });

    // --- 3. KELUAR ROOM (Tombol Exit) ---
    socket.on('leave_room', () => {
        if (currentRoomId) {
            handleLeaveRoom(socket, currentRoomId);
            currentRoomId = null;
            currentUserAlias = null;
        }
    });

    // --- 4. DISCONNECT (Tutup Tab) ---
    socket.on('disconnect', () => {
        if (currentRoomId) {
            handleLeaveRoom(socket, currentRoomId);
        }
    });
});

// Fungsi Bantuan untuk Logika Keluar
function handleLeaveRoom(socket, roomId) {
    socket.leave(roomId);

    if (rooms[roomId] && rooms[roomId].users[socket.id]) {
        const leftUser = rooms[roomId].users[socket.id];
        delete rooms[roomId].users[socket.id]; // Hapus user
        
        // Kabari sisa user
        io.to(roomId).emit('system_message', `${leftUser} meninggalkan room.`);
        io.to(roomId).emit('update_users', Object.values(rooms[roomId].users));
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server Chat Jalan di Port ${PORT}`);
});