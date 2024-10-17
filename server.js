const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const CANNON = require('cannon-es');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 정적 파일 서빙 설정
app.use(express.static(path.join(__dirname, 'public')));
app.use('/three', express.static(path.join(__dirname, 'node_modules/three')));

// 루트 경로 처리
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

class PingPongServer {
    constructor() {
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0);

        this.gameWidth = 100;
        this.gameLenth = 250;
        this.constantBallSpeed = 80;

        this.playerOne = this.createPaddle(0, 6, 100);
        this.playerTwo = this.createPaddle(0, 6, -100);
        this.ball = this.createBall();

        this.createTable();

        this.setupCollisionEvents();

        this.score = { playerOne: 0, playerTwo: 0 };

        setInterval(() => this.updatePhysics(), 1000 / 60);
    }

    createPaddle(x, y, z) {
        const paddleShape = new CANNON.Box(new CANNON.Vec3(10, 2.5, 2.5));
        const paddleBody = new CANNON.Body({
            mass: 0,
            shape: paddleShape,
            position: new CANNON.Vec3(x, y, z)
        });
        this.world.addBody(paddleBody);
        return paddleBody;
    }

    createBall() {
        const ballShape = new CANNON.Sphere(2);
        const ballBody = new CANNON.Body({
            mass: 1,
            shape: ballShape,
            position: new CANNON.Vec3(0, 6, 0),
            velocity: new CANNON.Vec3(this.constantBallSpeed, 0, 0)
        });
        this.world.addBody(ballBody);
        return ballBody;
    }

    createTable() {
        const tableShape = new CANNON.Box(new CANNON.Vec3(this.gameWidth/2, 2.5, this.gameLenth/2));
        const tableBody = new CANNON.Body({
            mass: 0,
            shape: tableShape,
            position: new CANNON.Vec3(0, 0, 0)
        });
        this.world.addBody(tableBody);
    }

    setupCollisionEvents() {
        this.world.addEventListener('postStep', () => {
            if (this.checkCollision(this.ball, this.playerOne)) {
                this.adjustBallVelocityAfterPaddleHit(this.ball, this.playerOne);
            } else if (this.checkCollision(this.ball, this.playerTwo)) {
                this.adjustBallVelocityAfterPaddleHit(this.ball, this.playerTwo);
            }
        });
    }

    checkCollision(ball, paddle) {
        const distance = ball.position.distanceTo(paddle.position);
        return distance < (ball.shapes[0].radius + paddle.shapes[0].halfExtents.x);
    }

    adjustBallVelocityAfterPaddleHit(ball, paddle) {
        const velocity = ball.velocity;
        const speed = velocity.length();

        // 공의 현재 위치와 패들의 중심 사이의 차이 계산
        const paddleCenterX = paddle.position.x;
        const hitPointDiff = ball.position.x - paddleCenterX;

        // 반사 각도 계산 (패들의 어느 부분에 맞았는지에 따라 달라짐)
        const maxBounceAngle = Math.PI / 3; // 60도
        const bounceAngle = (hitPointDiff / paddle.shapes[0].halfExtents.x) * maxBounceAngle;

        // 새로운 속도 계산
        const direction = (ball.position.z < paddle.position.z) ? -1 : 1; // 공이 어느 방향으로 가야 하는지 결정
        const newVelocityX = Math.sin(bounceAngle) * speed;
        const newVelocityZ = Math.cos(bounceAngle) * speed * direction;

        // 속도 설정
        velocity.x = newVelocityX;
        velocity.z = newVelocityZ;
        velocity.y = Math.min(velocity.y, 0); // y 속도를 아래로 제한

        // 일정 속도 유지
        velocity.normalize();
        velocity.scale(this.constantBallSpeed, velocity);

        ball.velocity.copy(velocity);
    }

    updatePhysics() {
        this.world.step(1/60);
        this.maintainConstantVelocity();
        this.checkBoundaries();
        this.broadcastGameState();
    }

    maintainConstantVelocity() {
        const velocity = this.ball.velocity;
        const currentSpeed = velocity.length();
        if (currentSpeed > 0 && isFinite(currentSpeed)) {
            const scaleFactor = this.constantBallSpeed / currentSpeed;
            velocity.scale(scaleFactor, velocity);
            this.ball.velocity.copy(velocity);
        }
    }

    checkBoundaries() {
        if (Math.abs(this.ball.position.z) > this.gameLenth/2) {
            if (this.ball.position.z > 0) {
                this.score.playerTwo++;
            } else {
                this.score.playerOne++;
            }
            this.resetBall();
        }
    }

    resetBall() {
        this.ball.position.set(0, 6, 0);
        this.ball.velocity.set(
            (Math.random() - 0.5) * this.constantBallSpeed,
            0,
            (Math.random() < 0.5 ? 1 : -1) * this.constantBallSpeed
        );
    }

    broadcastGameState() {
        const gameState = {
            playerOne: this.playerOne.position,
            playerTwo: this.playerTwo.position,
            ball: this.ball.position,
            score: this.score
        };
        io.emit('gameState', gameState);
    }

    handlePlayerInput(playerId, key, pressed) {
        const player = playerId === 1 ? this.playerOne : this.playerTwo;
        const moveSpeed = 2;

        if (key === 'A' && pressed) {
            player.position.x -= moveSpeed;
        } else if (key === 'D' && pressed) {
            player.position.x += moveSpeed;
        }

        // 패들이 테이블 밖으로 나가지 않도록 제한
        player.position.x = Math.max(-this.gameWidth/2 + 10, Math.min(this.gameWidth/2 - 10, player.position.x));
    }
}

const game = new PingPongServer();

io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('keyPress', (data) => {
        game.handlePlayerInput(socket.id, data.key, data.pressed);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});