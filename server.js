const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { update } = require('three/examples/jsm/libs/tween.module.js');
const { time } = require('console');
const { type } = require('os');
// const { element } = require('three/webgpu');

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



const GAME_WIDTH = 100;
const GAME_LENGTH = 250;
const CONSTANT_BALL_SPEED = 50;
const GAME_SET_SCORE = 5;
const AI_RATE = 10;
const BALL_SIZE = 5;
const PADDLE_WIDTH = 20;
const PADDLE_height = 5;
const PADDLE_depth = 5;
class Ball {
    constructor(id) {
        this.id = id;
        this.position = { x: 0, y: 6, z: 0 };
        this.velocity = new Vec3();
        this.summunDirection = true;
        this.powerCounter = 0;
        this.radius = BALL_SIZE;
    }
}

class PingPongServer {
    constructor(multiOption = false,ballCount = 1) {
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
        this.isSinglePlayer = multiOption? true:{A:false,B:false};
        this.gameStart = false;
        this.clients = new Map();
        // this.resetAllBalls();
        setInterval(() => this.updatePhysics(), 1000 / 60);
        if(this.isSinglePlayer !== true)
            setInterval(() => this.updateAi(), 1000 / 10);
    }

    addBall() {
        const ball = new Ball(this.gameState.balls.length);
        this.gameState.balls.push(ball);
        this.setBallVelocity(ball,1,true);
    }

    setBallVelocity(ball,powerUp = 1,strat = false) {
        const maxAngle = Math.PI / 6;
        const angle = (Math.random() * 2 - 1) * maxAngle;
        let direction = ball.summunDirection ? 1 : -1;
        if(strat){
            direction = this.gameState.balls.length === 1 ? 1 : -1;
        }
        powerUp = ball.powerCounter > 1 ? 1: powerUp;
        ball.powerCounter = powerUp === 2 ? 1 :0;
        const vx = Math.sin(angle) * CONSTANT_BALL_SPEED * powerUp;
        const vz = Math.cos(angle) * CONSTANT_BALL_SPEED * powerUp* direction;
        ball.velocity = new Vec3(vx, 0, vz);
    }
    
    updateAi() {
        const ballPosition = this.gameState.balls;
        let target = 0;
        if(ballPosition.length !==1){
            target = ballPosition.findIndex((item, index) => 
                item.position.z === Math.min(...ballPosition.map(b => b.position.z))
        );
        }
        if(ballPosition[target].position.x < this.gameState.balls[target].position.z) return;  //is comming
        if(ballPosition[target].z > 0 || Math.floor(Math.random() *100) < AI_RATE) return; //over half and ai rate
        if(ballPosition[target].position.x < this.gameState.playerTwo.x){
            if(this.isSinglePlayer.B) this.isSinglePlayer.B = false;
            if(!this.isSinglePlayer.A === true) this.isSinglePlayer.A = true;
            this.handlePlayerInput('ai','A',this.isSinglePlayer.A);
        }
        else{
            if(this.isSinglePlayer.A) this.isSinglePlayer.A = false;
            if(!this.isSinglePlayer.B === true) this.isSinglePlayer.B = true;
            this.handlePlayerInput('ai','D',this.isSinglePlayer.B);
        }
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
                this.socketSend('sound','ballToWall');
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
                    ball.summunDirection = false;
                }

                if (this.gameState.score.playerOne > GAME_SET_SCORE || 
                    this.gameState.score.playerTwo > GAME_SET_SCORE) {
                        console.log('end!!');
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

        // 1. 구의 중심에서 가장 가까운 박스 위의 점 찾기
        const closestPoint = {
            x: Math.max(paddle.x - PADDLE_WIDTH / 2,
                Math.min(ball.position.x, paddle.x + PADDLE_WIDTH / 2)),
            y: Math.max(paddle.y - PADDLE_height / 2,
                Math.min(ball.position.y, paddle.y + PADDLE_height / 2)),
            z: Math.max(paddle.z - PADDLE_depth / 2,
                Math.min(ball.position.z, paddle.z + PADDLE_depth / 2))
        };

        // 2. 구의 중심과 가장 가까운 점 사이의 거리 계산
        const distance = Math.sqrt(
            Math.pow(ball.position.x - closestPoint.x, 2) +
            Math.pow(ball.position.y - closestPoint.y, 2) +
            Math.pow(ball.position.z - closestPoint.z, 2)
        );

        // 3. 거리가 구의 반지름보다 작거나 같으면 충돌
        if (distance <= BALL_SIZE) {
            this.socketSend('sound','ballToWall');
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
    isInRange(number, target, range) {
        return Math.abs(number - target) <= range;
    }
    resetBall(ball) {
        ball.position = { x: 0, y: 5, z: 0 };
        ball.powerCounter = 0;
        this.setBallVelocity(ball);
    }

    resetAllBalls() {
        this.gameState.balls.forEach(ball => this.resetBall(ball));
    }

    broadcastGameState() {
        this.socketSend('gameState');
    }

    handlePlayerInput(playerId, key, pressed) {
        const player = (playerId === 'ai' || playerId === Array.from(this.clients.keys())[1]) ? 
            this.gameState.playerTwo : this.gameState.playerOne;
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
            if(!this.isSinglePlayer)
                io.to(op).emit('data', { type });
            this.socketSend('gameStart');
        } else if (!op) {
            op.emit('data', { type });
        } else if (type === 'gameEnd') {
            io.emit('data', { type, txt: op });
        }
        else if(type === 'sound'){
            io.emit('data',{type, sound : op});
        }
        else if(type === 'effect'){
            io.emit('data',{type,op});
        }
    }
}

// 게임 인스턴스 생성 (2개의 공으로 시작)
const game = new PingPongServer(false,2);

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    game.clients.set(socket.id, socket);
    
    if (game.clients.size > 1) {
        game.socketSend('secondPlayer', socket.id);
        game.socketSend('gameStart');
        game.gameStart = true;
    }
    else {
        console.log('wait player');
        game.socketSend('gameWait', socket);
        if(game.isSinglePlayer){
        game.socketSend('gameStart');
        game.gameStart = true;
        }
    }
    
    game.socketSend('gameState', socket);

    socket.on('keyPress', (data) => {
        if(data.key !==' ')
            game.handlePlayerInput(socket.id, data.key, data.pressed);
        else{
            const player = !data.who ? game.gameState.playerOne:game.gameState.playerTwo;
            const isCollision = game.gameState.balls.filter(element => game.isInRange(Math.floor(element.position.x), Math.floor(player.x),10) && game.isInRange(Math.floor(element.position.z), Math.floor(player.z),10));
            if(isCollision.length === 1) {
                game.setBallVelocity(isCollision[0],2);
                game.socketSend('effect',isCollision[0].position);
            };
    }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        game.clients.delete(socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});