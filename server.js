const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

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

class Ball {
    constructor(id) {
        this.id = id;
        this.position = { x: 0, y: 6, z: 0 };
        this.velocity = new Vec3();
        this.summunDirection = true;
    }
}

class PingPongAI {
    constructor(gameWidth, gameLength) {
        this.gameWidth = gameWidth;
        this.gameLength = gameLength;
        this.paddleWidth = 20;
        this.updateInterval = 1000; // 1초마다 업데이트
        this.lastMoveTime = Date.now();
        this.predictedX = 0;
        this.reactionDelay = 100; // AI의 반응 지연시간 (ms)
        this.lastPaddlePos = 0;
        this.maxMoveSpeed = 2; // 한 번에 이동할 수 있는 최대 거리
        this.difficulty = 0.9; // AI 정확도 (0.0 ~ 1.0)
    }

    // 공의 위치가 패들에 도달할 시점의 X 좌표 예측
    predictBallPosition(ball, ballVelocity) {
        if (ballVelocity.z >= 0) {
            // 공이 AI 쪽으로 오고 있지 않은 경우
            return this.lastPaddlePos;
        }

        // 공이 패들에 도달하는 시간 계산
        const distanceToTravel = Math.abs(ball.z - (-this.gameLength/2));
        const timeToIntercept = Math.abs(distanceToTravel / ballVelocity.z);

        // 예상 X 위치 계산
        let predictedX = ball.x + (ballVelocity.x * timeToIntercept);

        // 벽과의 충돌 고려
        const bounces = Math.floor(Math.abs(predictedX) / (this.gameWidth/2));
        if (bounces % 2 === 1) {
            // 홀수 번 튕기는 경우
            predictedX = this.gameWidth/2 - (Math.abs(predictedX) % (this.gameWidth/2));
            if (predictedX < 0) predictedX *= -1;
        } else {
            // 짝수 번 튕기는 경우
            predictedX = Math.abs(predictedX) % (this.gameWidth/2);
            if (ball.x < 0) predictedX *= -1;
        }

        // AI 난이도에 따른 오차 추가
        const maxError = this.paddleWidth * (1 - this.difficulty);
        const randomError = (Math.random() - 0.5) * maxError;
        predictedX += randomError;

        // 패들이 이동할 수 있는 범위로 제한
        return Math.max(
            -this.gameWidth/2 + this.paddleWidth/2, 
            Math.min(this.gameWidth/2 - this.paddleWidth/2, predictedX)
        );
    }

    // AI 의사결정 및 이동
    update(gameState) {
        const currentTime = Date.now();
        if (currentTime - this.lastMoveTime < this.updateInterval) {
            return null; // 아직 업데이트 시간이 되지 않음
        }

        this.lastMoveTime = currentTime;

        // 모든 공에 대해 예측을 수행하고 가장 가까운 공을 타겟팅
        let closestBall = null;
        let shortestTime = Infinity;

        for (const ball of gameState.balls) {
            // 공의 위치와 속도
            const ballPos = ball.position;
            const ballVel = ball.velocity;

            // 공이 AI 쪽으로 오고 있는 경우만 고려
            if (ballVel.z < 0) {
                const timeToIntercept = Math.abs((ballPos.z - (-this.gameLength/2)) / ballVel.z);
                if (timeToIntercept < shortestTime) {
                    shortestTime = timeToIntercept;
                    closestBall = ball;
                }
            }
        }

        if (!closestBall) {
            // 모든 공이 반대 방향으로 가고 있는 경우, 중앙으로 복귀
            this.predictedX = 0;
        } else {
            this.predictedX = this.predictBallPosition(
                closestBall.position,
                closestBall.velocity
            );
        }

        // 현재 패들 위치와 목표 위치의 차이 계산
        const currentPaddleX = gameState.playerTwo.x;
        const distance = this.predictedX - currentPaddleX;
        
        // 부드러운 이동을 위한 이동량 계산
        let moveAmount = Math.min(Math.abs(distance), this.maxMoveSpeed) * Math.sign(distance);
        
        this.lastPaddlePos = currentPaddleX + moveAmount;
        
        // 이동 방향 결정
        if (Math.abs(moveAmount) < 0.1) {
            return null; // 작은 움직임은 무시
        }
        
        return moveAmount > 0 ? 'D' : 'A';
    }
}


const GAME_WIDTH = 100;
const GAME_LENGTH = 250;
const CONSTANT_BALL_SPEED = 50;
const GAME_SET_SCORE = 5;

class PingPongServer {
    constructor(ballCount = 1) {
        this.gameState = {
            oneName: 'sabyun',
            twoName: 'ai',
            playerOne: { x: 0, y: 6, z: 100 },
            playerTwo: { x: 0, y: 6, z: -100 },
            balls: [],
            score: { playerOne: 0, playerTwo: 0 },
        };
        
        // Initialize balls
        for (let i = 0; i < ballCount; i++) {
            this.addBall();
        }

        this.gameStart = false;
        this.clients = new Map();
        this.resetAllBalls();
        setInterval(() => this.updatePhysics(), 1000 / 60);
    }

    addBall() {
        const ball = new Ball(this.gameState.balls.length);
        this.gameState.balls.push(ball);
        this.setBallVelocity(ball);
    }

    setBallVelocity(ball) {
        const maxAngle = Math.PI / 3;
        const angle = (Math.random() * 2 - 1) * maxAngle;
        const direction = ball.summunDirection ? 1 : -1;
        
        const vx = Math.sin(angle) * CONSTANT_BALL_SPEED;
        const vz = Math.cos(angle) * CONSTANT_BALL_SPEED * direction;
        
        ball.velocity = new Vec3(vx, 0, vz);
    }

    updatePhysics() {
        if (!this.gameStart) return;

        this.gameState.balls.forEach(ball => {
            // Update ball position
            ball.position.x += ball.velocity.x * (1/60);
            ball.position.y += ball.velocity.y * (1/60);
            ball.position.z += ball.velocity.z * (1/60);

            // Check collisions
            this.checkPaddleCollision(ball, this.gameState.playerOne);
            this.checkPaddleCollision(ball, this.gameState.playerTwo);

            // Check wall collisions
            if (Math.abs(ball.position.x) > GAME_WIDTH/2 - 2) {
                ball.velocity.x *= -1;
            }

            // Check scoring
            if (Math.abs(ball.position.z) > GAME_LENGTH/2 || 
                ball.position.y < 0 || 
                ball.position.y > 20) {
                
                if (ball.position.z > 0) {
                    this.gameState.score.playerTwo++;
                    ball.summunDirection = true;
                } else {
                    this.gameState.score.playerOne++;
                    ball.summunDirection = true;
                }

                if (this.gameState.score.playerOne > GAME_SET_SCORE || 
                    this.gameState.score.playerTwo > GAME_SET_SCORE) {
                    this.socketSend('gameEnd', 
                        `winner is ${this.gameState.score.playerOne > 
                            this.gameState.score.playerTwo ? 
                            this.gameState.oneName : 
                            this.gameState.twoName}`
                    );
                    this.gameStart = false;
                }

                if (this.gameStart) {
                    this.socketSend('score');
                    this.resetBall(ball);
                }
            }
        });

        this.broadcastGameState();
    }

    checkPaddleCollision(ball, paddle) {
        const dx = ball.position.x - paddle.x;
        const dy = ball.position.y - paddle.y;
        const dz = ball.position.z - paddle.z;
        const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);

        if (distance < 9) {
            const hitPointDiff = ball.position.x - paddle.x;
            const maxBounceAngle = Math.PI / 3;
            const bounceAngle = (hitPointDiff / 10) * maxBounceAngle;

            const speed = new Vec3(
                ball.velocity.x, 
                ball.velocity.y, 
                ball.velocity.z
            ).length();
            const direction = (ball.position.z < paddle.z) ? -1 : 1;

            ball.velocity.x = Math.sin(bounceAngle) * speed;
            ball.velocity.z = Math.cos(bounceAngle) * speed * direction;
            ball.velocity.y = Math.min(ball.velocity.y, 0);
        }
    }

    resetBall(ball) {
        ball.position = { x: 0, y: 5, z: 0 };
        this.setBallVelocity(ball);
    }

    resetAllBalls() {
        this.gameState.balls.forEach(ball => this.resetBall(ball));
    }

    broadcastGameState() {
        this.socketSend('gameState');
    }

    handlePlayerInput(playerId, key, pressed) {
        const player = playerId === Array.from(this.clients.keys())[0] ? 
            this.gameState.playerOne : 
            this.gameState.playerTwo;
        const moveSpeed = 2;

        if (key === 'A' && pressed) {
            player.x -= moveSpeed;
        } else if (key === 'D' && pressed) {
            player.x += moveSpeed;
        }

        player.x = Math.max(-GAME_WIDTH/2 + 10, 
            Math.min(GAME_WIDTH/2 - 10, player.x));
    }

    socketSend(type, op = null) {
        if (type === 'gameStart' || type === 'gameState' || type === 'score') {
            if (!op) {
                io.emit('data', { ...this.gameState, type });
            } else {
                op.emit('data', { ...this.gameState, type });
            }
        } else if (type === 'gameWait' && op) {
            op.emit('data', { type });
        } else if (type === 'secondPlayer') {
            io.to(op).emit('data', { type });
            this.socketSend('gameStart');
        } else if (!op) {
            op.emit('data', { type });
        } else if (type === 'gameEnd') {
            io.emit('data', { type, txt: op });
        }
    }
}

// 게임 인스턴스 생성 (2개의 공으로 시작)
const game = new PingPongServer(2);

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    game.clients.set(socket.id, socket);
    
    if (game.clients.size > 1) {
        game.socketSend('secondPlayer', socket.id);
        game.gameStart = true;
    } else {
        console.log('wait player');
        game.socketSend('gameWait', socket);
    }
    
    game.socketSend('gameState', socket);

    socket.on('keyPress', (data) => {
        game.handlePlayerInput(socket.id, data.key, data.pressed);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        game.clients.delete(socket.id);
        game = new PingPongServer(2);
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});