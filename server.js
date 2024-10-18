const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Simple vector operations
class Vec3 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    add(v) {
        this.x += v.x;
        this.y += v.y;
        this.z += v.z;
        return this;
    }

    scale(s) {
        this.x *= s;
        this.y *= s;
        this.z *= s;
        return this;
    }

    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }

    normalize() {
        const len = this.length();
        if (len > 0) {
            this.scale(1 / len);
        }
        return this;
    }
}

// Game constants
const GAME_WIDTH = 100;
const GAME_LENGTH = 250;
const CONSTANT_BALL_SPEED = 80;

class PingPongServer {
    constructor() {
        this.gameState = {
            oneName: 'sabyun',
            twoName: 'ai',
            playerOne: { x: 0, y: 6, z: 100 },
            playerTwo: { x: 0, y: 6, z: -100 },
            ball: { x: 0, y: 6, z: 0 },
            ballVelocity: new Vec3(0, CONSTANT_BALL_SPEED, 0),
            ballSummunDriction: true,
            score: { playerOne: 0, playerTwo: 0 },
            // table: {
            //     width: GAME_WIDTH,
            //     length: GAME_LENGTH,
            //     height: 5,
            //     color: 0x1a5c1a // Green color for the table
            // },
            // guidelines: {
            //     width: 1,
            //     height: 10,
            //     length: GAME_LENGTH,
            //     color: 0x0000ff, // Blue color for guidelines
            //     positions: [
            //         { x: -GAME_WIDTH/2, y: 5, z: 0 },
            //         { x: GAME_WIDTH/2, y: 5, z: 0 }
            //     ]
            // },
            // net: {
            //     width: GAME_WIDTH,
            //     height: 6,
            //     depth: 1,
            //     color: 0xffffff, // Blue color for the net
            //     position: { x: 0, y: 5, z: 0 }
            // }
        };

        this.clients = new Map();
        setInterval(() => this.updatePhysics(), 1000 / 60);
    }

    setBallVelocity() {
        // 60도를 라디안으로 변환 (π/3)
        const maxAngle = Math.PI / 3;

        // -60도에서 60도 사이의 랜덤한 각도 생성
        const angle = (Math.random() * 2 - 1) * maxAngle;

        // 50% 확률로 왼쪽 또는 오른쪽으로 발사
        const direction = this.gameState.ballSummunDriction;
        // x와 z 방향의 속도 계산
        const vx = Math.sin(angle) * CONSTANT_BALL_SPEED;
        const vz = Math.cos(angle) * CONSTANT_BALL_SPEED * direction;
        const vy = 0;  // 수직 속도 제거

        // 속도 설정
        this.gameState.ballVelocity.x = vx;
        this.gameState.ballVelocity.y = vy;
        this.gameState.ballVelocity.z = vz;
    }

    updatePhysics() {
        const { ball, ballVelocity } = this.gameState;

        // Update ball position
        ball.x += ballVelocity.x * (1/60);
        ball.y += ballVelocity.y * (1/60);
        ball.z += ballVelocity.z * (1/60);

        // Check collisions with paddles
        this.checkPaddleCollision(this.gameState.playerOne);
        this.checkPaddleCollision(this.gameState.playerTwo);

        // Check wall collisions
        if (Math.abs(ball.x) > GAME_WIDTH/2 - 2) {
            ballVelocity.x *= -1;
        }

        // Check scoring
        if (Math.abs(ball.z) > GAME_LENGTH/2 || ball.y < 0 || ball.y > 20) {
            if (ball.z > 0) {
                this.gameState.score.playerTwo++;
                this.gameState.ballSummunDriction = 1;
            } else {
                this.gameState.score.playerOne++;
                this.gameState.ballSummunDriction = 1;
            }
            io.emit('score', this.gameState);
            this.resetBall();
        }

        // Broadcast updated game state
        this.broadcastGameState();
    }

    checkPaddleCollision(paddle) {
        const { ball, ballVelocity } = this.gameState;
        const dx = ball.x - paddle.x;
        const dy = ball.y - paddle.y;
        const dz = ball.z - paddle.z;
        const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);

        if (distance < 9) { // Paddle width (20) / 2 + ball radius (2)
            const hitPointDiff = ball.x - paddle.x;
            const maxBounceAngle = Math.PI / 3; // 60 degrees
            const bounceAngle = (hitPointDiff / 10) * maxBounceAngle;

            const speed = new Vec3(ballVelocity.x, ballVelocity.y, ballVelocity.z).length();
            const direction = (ball.z < paddle.z) ? -1 : 1;

            ballVelocity.x = Math.sin(bounceAngle) * speed;
            ballVelocity.z = Math.cos(bounceAngle) * speed * direction;
            ballVelocity.y = Math.min(ballVelocity.y, 0);

            // Normalize and scale to constant speed
            new Vec3(ballVelocity.x, ballVelocity.y, ballVelocity.z)
                .normalize()
                .scale(CONSTANT_BALL_SPEED);
        }
    }

    resetBall() {
        const { ball, ballVelocity } = this.gameState;
        ball.x = 0;
        ball.y = 5;
        ball.z = 0;
        ballVelocity.x = (Math.random() - 0.5) * CONSTANT_BALL_SPEED;
        ballVelocity.y = 0;
        ballVelocity.z = (Math.random() < 0.5 ? 1 : -1) * CONSTANT_BALL_SPEED;
        this.setBallVelocity();
    }
    broadcastGameState() {
        io.emit('gameState', this.gameState);
    }

    handlePlayerInput(playerId, key, pressed) {
        const player = playerId === Array.from(this.clients.keys())[0] ? this.gameState.playerOne : this.gameState.playerTwo;
        const moveSpeed = 2;

        if (key === 'A' && pressed) {
            player.x -= moveSpeed;
        } else if (key === 'D' && pressed) {
            player.x += moveSpeed;
        }

        // Limit paddle movement
        player.x = Math.max(-GAME_WIDTH/2 + 10, Math.min(GAME_WIDTH/2 - 10, player.x));
    }
}

const game = new PingPongServer();

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    game.clients.set(socket.id, socket);
    if(game.clients.size > 1){
        io.to(socket.id).emit('secondPlayer');
        console.log(game.clients.size);
    }
    // Send initial game state to the new client
    socket.emit('gameState', game.gameState);

    socket.on('keyPress', (data) => {
        game.handlePlayerInput(socket.id, data.key, data.pressed);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        game.clients.delete(socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});