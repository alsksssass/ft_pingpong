import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import * as CANNON from 'cannon-es';


const socket = io();

class PingPong {
    constructor() {
        // Three.js 설정
        this.score = {
            playerOne: 0,
            playerTwo: 0,
        }
        this.isremote = false;

        //properrit
        this.ballSummunDriction = 1;
        this.gameWidth = 100; // 3 index
        this.gameLenth = 250; // 1 index
        this.initColor = [0xffffff, 0xff0000, 0x000000, 0x0000cc];
        this.initColorIndex = 0;
        this.scene = new THREE.Scene();
        this.textdata = 0;
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(800, 800);
        this.ballMaterial = new CANNON.Material('ballMaterial');
        this.guideMaterial = new CANNON.Material('guideMaterial');
        this.paddleMaterial = new CANNON.Material('paddleMaterial');
        this.tableMaterial = new CANNON.Material('tableMaterial');

        this.makeWindow();
        // Cannon.js 물리 세계 설정
        this.world = new CANNON.World({
            gravity: new CANNON.Vec3(0, -9.82, 0)
        });
        // 접촉 재질 정의
        const ball_table_cm = new CANNON.ContactMaterial(
            this.ballMaterial,
            this.tableMaterial,
            {
                friction: 0,  // 마찰 제거
                restitution: 1  // 완전 탄성 충돌
            }
        );

        const ball_guide_cm = new CANNON.ContactMaterial(
            this.ballMaterial,
            this.guideMaterial,
            {
                friction: 0.0,
                restitution: 1.0  // 완전 탄성 충돌
            }
        );
        const ball_paddle_cm = new CANNON.ContactMaterial(
            this.ballMaterial,
            this.paddleMaterial,
            {
                friction: 0,  // 마찰 제거
                restitution: 1  // 완전 탄성 충돌
            }
        );

        this.world.addContactMaterial(ball_table_cm);
        this.world.addContactMaterial(ball_guide_cm);
        this.world.addContactMaterial(ball_paddle_cm);

        //공설정
        this.constantBallSpeed = 80;  // 수정: 초기화

        // 카메라 설정
        this.camSetPosition = true;
        this.cameraRadius = 200;
        this.cameraTheta = 1.56;
        this.cameraPhi = 0.1;
        this.cameraTarget = new THREE.Vector3(0, 0, 0);
        this.updateCameraPosition();

        // 플레이어 설정
        this.playerOneVelocity = 0;
        this.playerTwoVelocity = 0;
        this.maxVelocity = 1.5;
        this.acceleration = 0.1;
        this.deceleration = 0.1;
        this.playerOnePosition = 0;
        this.playerTwoPosition = 0;
        this.playerOne = this.makeGameBar(0, 6, 100, 1);
        this.playerTwo = this.makeGameBar(0, 6, -100, 0);


        // 공 생성
        this.ball = this.createBall();
        this.setBallVelocity(this.constantBallSpeed);  // 수정: 초기 속도 설정

        // 키 상태 추적
        this.keys = {
            A: false,
            D: false
        };

        // 조명 설정
        this.setupLights();

        // 마우스 이벤트 관련 변수
        this.isDragging = false;
        this.previousMousePosition = {
            x: 0,
            y: 0
        };

        // 이벤트 리스너 설정
        this.setupEventListeners();

        // 게임 요소 생성
        this.makeFont(`you ${this.score.playerOne} : other ${this.score.playerTwo}`);
        this.makeLine();
        this.makeTable();
        this.rightGuide = this.makeGuideLine(50, 5, 0);
        this.leftGuide = this.makeGuideLine(-50, 5, 0);
        this.setupCollisionEvents();

        // 애니메이션 루프 시작
        this.animate = this.animate.bind(this);
        this.animate();
    }



    makeWindow() {
        const newDiv = document.createElement('div');
        newDiv.classList.add("gameWindow");
        newDiv.appendChild(this.renderer.domElement);
        document.body.appendChild(newDiv);
    }

    setupLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0xffffff, 1, 1000);
        pointLight.position.set(0, 100, 0);
        this.scene.add(pointLight);
    }

    setupCollisionEvents() {
        this.world.addEventListener('postStep', () => {
            const ball = this.ball.body;
            const playerOnePaddle = this.playerOne.body;
            const playerTwoPaddle = this.playerTwo.body;

            if (!ball || !playerOnePaddle || !playerTwoPaddle) {
                console.error("One or more game objects are undefined");
                return;
            }

            if (this.checkCollision(ball, playerOnePaddle)) {
                this.adjustBallVelocityAfterPaddleHit(ball, playerOnePaddle);
            } else if (this.checkCollision(ball, playerTwoPaddle)) {
                this.adjustBallVelocityAfterPaddleHit(ball, playerTwoPaddle);
            }
        });
    }

    checkCollision(ball, paddle) {
        if (!ball || !paddle || !ball.shapes || !paddle.shapes ||
            ball.shapes.length === 0 || paddle.shapes.length === 0) {
            return false;
        }

        const ballShape = ball.shapes[0];
        const paddleShape = paddle.shapes[0];

        if (ballShape.type !== CANNON.Shape.types.SPHERE || paddleShape.type !== CANNON.Shape.types.BOX) {
            return false;
        }

        // x와 z 축에 대한 거리 계산
        const dx = Math.abs(ball.position.x - paddle.position.x);
        const dz = Math.abs(ball.position.z - paddle.position.z);

        // y 축에 대한 별도 검사
        const dy = Math.abs(ball.position.y - paddle.position.y);

        // 충돌 조건
        const collisionX = dx < (ballShape.radius + paddleShape.halfExtents.x);
        const collisionZ = dz < (ballShape.radius + paddleShape.halfExtents.z);
        const collisionY = dy < (ballShape.radius + paddleShape.halfExtents.y);

        return collisionX && collisionZ && collisionY;
    }

    adjustBallVelocityAfterPaddleHit(ball, paddle) {
        const velocity = ball.velocity;
        const speed = velocity.length();

        // 공의 현재 위치와 패들의 중심 사이의 차이 계산
        const paddleCenterX = paddle.position.x;
        const hitPointDiff = ball.position.x - paddleCenterX;

        // 반사 각도 계산 (패들의 어느 부분에 맞았는지에 따라 달라짐)
        const maxBounceAngle = Math.PI / 3; // 45도
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


    maintainConstantVelocity() {
        // const velocity = this.ball.body.velocity;
        // const currentSpeed = velocity.length();

        // if (currentSpeed > 0 && isFinite(currentSpeed)) {
        //     const scaleFactor = this.constantBallSpeed / currentSpeed;
        //     velocity.scale(scaleFactor, velocity);
        //     velocity.y = Math.min(velocity.y, 0);  // y 속도를 제한
        //     this.ball.body.velocity.copy(velocity);
        // } else {
        //     // 속도가 0이거나 무한대인 경우 재설정
        //     this.setBallVelocity(this.constantBallSpeed);
        // }

        // // 최소 Z 방향 속도 확인
        // // const minZVelocity = this.constantBallSpeed * 0.4;
        // // if (Math.abs(velocity.z) < minZVelocity) {
        // //     this.adjustBallVelocity(this.ball.body);
        // // }
    }

    setupEventListeners() {
        window.addEventListener('keydown', this.onKeyDown.bind(this), false);
        window.addEventListener('keyup', this.onKeyUp.bind(this), false);
        this.renderer.domElement.addEventListener('mousedown', this.onMouseDown.bind(this), false);
        this.renderer.domElement.addEventListener('mousemove', this.onMouseMove.bind(this), false);
        this.renderer.domElement.addEventListener('mouseup', this.onMouseUp.bind(this), false);
        window.addEventListener('resize', this.onWindowResize.bind(this), false);
    }

    createBall() {
        const ballGeometry = new THREE.SphereGeometry(2, 32, 32);
        const ballMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff });
        const ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);
        ballMesh.position.set(0, 6, 0);
        this.scene.add(ballMesh);
        const ballShape = new CANNON.Sphere(2);
        const ballBody = new CANNON.Body({
            mass: 1,  // 수정: 질량을 1로 변경
            shape: ballShape,
            material: this.ballMaterial,
            position: new CANNON.Vec3(0, 6, 0),  // 수정: 초기 위치를 높게 설정
            linearDamping: 0,
            angularDamping: 0,
            fixedRotation: true,
        });
        this.world.addBody(ballBody);

        return { mesh: ballMesh, body: ballBody };
    }

    maintainConstantVelocity() {
        const velocity = this.ball.body.velocity;
        const currentSpeed = velocity.length();

        if (currentSpeed > 0 && isFinite(currentSpeed)) {
            const scaleFactor = this.constantBallSpeed / currentSpeed;
            velocity.scale(scaleFactor, velocity);
            velocity.y = Math.min(velocity.y, 0);  // y 속도를 제한
            this.ball.body.velocity.copy(velocity);
        } else {
            // 속도가 0이거나 무한대인 경우 재설정
            this.setBallVelocity(this.constantBallSpeed);
        }
    }

    makeGameBar(x, y, z, check) {
        const paddleGeometry = new THREE.BoxGeometry(20, 5, 5);
        const paddleMaterial = new THREE.MeshPhongMaterial({ color: this.initColor[check]});
        const paddleMesh = new THREE.Mesh(paddleGeometry, paddleMaterial);
        paddleMesh.position.set(x, y, z);
        this.scene.add(paddleMesh);

        const paddleShape = new CANNON.Box(new CANNON.Vec3(10, 2.5, 2.5));
        const paddleBody = new CANNON.Body({
            mass: 0,
            shape: paddleShape,
            material: this.paddleMaterial,
            position: new CANNON.Vec3(x, y, z)
        });
        this.world.addBody(paddleBody);

        return { mesh: paddleMesh, body: paddleBody };
    }

    makeTable() {
        const tableGeometry = new THREE.BoxGeometry(this.gameWidth, 5, this.gameLenth);
        const tableMaterial = new THREE.MeshPhongMaterial({ color: 0x1a5c1a });
        const tableMesh = new THREE.Mesh(tableGeometry, tableMaterial);
        this.scene.add(tableMesh);

        const tableShape = new CANNON.Box(new CANNON.Vec3(50, 2.5, 125));
        const tableBody = new CANNON.Body({
            mass: 0,
            material: this.tableMaterial,
            shape: tableShape,
            position: new CANNON.Vec3(0, 0, 0)
        });
        this.world.addBody(tableBody);

        return { mesh: tableMesh, body: tableBody };
    }

    makeFont(msg) {
        if (this.textdata)
            this.scene.remove(this.textdata);
        const loader = new FontLoader();
        loader.load(
            'https://threejs.org/examples/fonts/helvetiker_regular.typeface.json',
            (font) => {
                const textGeo = new TextGeometry(msg, {
                    font: font,
                    size: 10,
                    height: 1,
                    curveSegments: 1,
                    bevelEnabled: true,
                    bevelThickness: 1,
                    bevelSize: 0.1,
                    bevelOffset: 0.1,
                    bevelSegments: 1
                });
                const material = new THREE.MeshPhongMaterial({ color: 0xffffff });
                const textMesh = new THREE.Mesh(textGeo, material);
                textMesh.position.set(-40, 50, 10);
                if (this.camSetPosition)
                    textMesh.rotateX(30);
                this.scene.add(textMesh);
                this.textdata = textMesh;
            }
        );
    }

    makeLine() {
        const lineGeometry = new THREE.BoxGeometry(this.gameWidth, 6, 1);
        const lineMaterial = new THREE.MeshPhongMaterial({ color: 0x0000ff });
        const line = new THREE.Mesh(lineGeometry, lineMaterial);
        this.scene.add(line);
        return line;
    }

    makeGuideLine(x, y, z) {
        const guideGeometry = new THREE.BoxGeometry(1, 10, this.gameLenth);
        const guideMaterial = new THREE.MeshPhongMaterial({ color: 0x0000ff });
        const guide = new THREE.Mesh(guideGeometry, guideMaterial);
        guide.position.set(x, y, z);
        this.scene.add(guide);

        // Cannon.js 바디 생성
        const guideShape = new CANNON.Box(new CANNON.Vec3(0.5, 5, this.gameLenth / 2));
        const guideBody = new CANNON.Body({
            mass: 0,  // 정적 바디로 설정
            shape: guideShape,
            material: this.guideMaterial,
            position: new CANNON.Vec3(x, y, z)
        });
        this.world.addBody(guideBody);

        return { mesh: guide, body: guideBody };
    }
    onKeyDown(event) {
        const key = event.key.toUpperCase();
        if (key === 'A' || key === 'D') {
            this.keys[key] = true;
        }
        if (key === 'R') {
            if (this.camSetPosition === false) {
                this.camSetPosition = true;
                this.cameraTheta = 1.57;
                this.cameraPhi = 0.1;
            }
            else {
                this.camSetPosition = false;
                this.cameraTheta = 1.57;
                this.cameraPhi = 1.3;
            }
            this.updateCameraPosition();
            this.makeFont(`you ${this.score.playerOne} : other ${this.score.playerTwo}`);
        }
        if (key === 'C') {
            console.log(this.initColorIndex);
            this.initColorIndex = (this.initColorIndex + 1) % this.initColor.length;
            this.playerOne.mesh.material.color.setHex(this.initColor[this.initColorIndex]);

        }
    }

    onKeyUp(event) {
        const key = event.key.toUpperCase();
        if (key === 'A' || key === 'D') {
            this.keys[key] = false;
        }
    }

    gameAi() {
        //this.playerTwoPosition < this.ball.body.position.x && this.ball.body.position.x - this.playerTwoPosition > 10
        if (this.playerTwoPosition > this.ball.body.position.x && this.playerTwoPosition - this.ball.body.position.x > 13) {
            this.playerTwoVelocity = Math.max(this.playerTwoVelocity - this.acceleration, -this.maxVelocity);
        } else if (this.playerTwoPosition < this.ball.body.position.x && this.ball.body.position.x - this.playerTwoPosition > 13) {
            this.playerTwoVelocity = Math.min(this.playerTwoVelocity + this.acceleration, this.maxVelocity);
        } else {
            if (this.playerTwoVelocity > 0) {
                this.playerTwoVelocity = Math.max(0, this.playerTwoVelocity - this.deceleration);
            } else if (this.playerTwoVelocity < 0) {
                this.playerTwoVelocity = Math.min(0, this.playerTwoVelocity + this.deceleration);
            }
        }

        this.playerTwoPosition += this.playerTwoVelocity;
        this.playerTwoPosition = Math.max(-40, Math.min(40, this.playerTwoPosition));
        this.playerTwo.mesh.position.set(this.playerTwoPosition, 6, -100);
        this.playerTwo.body.position.set(this.playerTwoPosition, 6, -100);
    }
    updateKey() {
        if (this.keys.A) {
            this.playerOneVelocity = Math.max(this.playerOneVelocity - this.acceleration, -this.maxVelocity);
        } else if (this.keys.D) {
            this.playerOneVelocity = Math.min(this.playerOneVelocity + this.acceleration, this.maxVelocity);
        } else {
            if (this.playerOneVelocity > 0) {
                this.playerOneVelocity = Math.max(0, this.playerOneVelocity - this.deceleration);
            } else if (this.playerOneVelocity < 0) {
                this.playerOneVelocity = Math.min(0, this.playerOneVelocity + this.deceleration);
            }
        }
        this.playerOnePosition += this.playerOneVelocity;
        this.playerOnePosition = Math.max(-40, Math.min(40, this.playerOnePosition));
        this.playerOne.mesh.position.set(this.playerOnePosition, 6, 100);
        this.playerOne.body.position.set(this.playerOnePosition, 6, 100);
    }
    makePositionDate() {
        return {
            playerOne: this.playerOnePosition,
            playerTwo: this.playerTwoPosition,
            ball: this.ball.body.position,
            score: this.score,
        }
    }
    onMouseDown(event) {
        this.isDragging = true;
        this.previousMousePosition = {
            x: event.clientX,
            y: event.clientY
        };
    }

    onMouseMove(event) {
        if (!this.isDragging) return;

        const deltaMove = {
            x: event.clientX - this.previousMousePosition.x,
            y: event.clientY - this.previousMousePosition.y
        };

        this.previousMousePosition = {
            x: event.clientX,
            y: event.clientY
        };

        this.rotateCamera(deltaMove);
    }

    onMouseUp(event) {
        this.isDragging = false;
    }

    rotateCamera(deltaMove) {
        this.cameraTheta -= deltaMove.x * 0.01;
        this.cameraPhi -= deltaMove.y * 0.01;
        this.cameraPhi = Math.max(0.1, Math.min(Math.PI - 0.1, this.cameraPhi));
        this.updateCameraPosition();
    }
    updateCameraPosition() {
        this.camera.position.x = this.cameraRadius * Math.sin(this.cameraPhi) * Math.cos(this.cameraTheta);
        this.camera.position.y = this.cameraRadius * Math.cos(this.cameraPhi);
        this.camera.position.z = this.cameraRadius * Math.sin(this.cameraPhi) * Math.sin(this.cameraTheta);
        // console.log(this.camera.position);
        this.camera.lookAt(this.cameraTarget);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    setBallVelocity(speed) {
        // 60도를 라디안으로 변환 (π/3)
        const maxAngle = Math.PI / 3;

        // -60도에서 60도 사이의 랜덤한 각도 생성
        const angle = (Math.random() * 2 - 1) * maxAngle;

        // 50% 확률로 왼쪽 또는 오른쪽으로 발사
        const direction = this.ballSummunDriction;
        console.log(direction);
        // x와 z 방향의 속도 계산
        const vx = Math.sin(angle) * speed;
        const vz = Math.cos(angle) * speed * direction;
        const vy = 0;  // 수직 속도 제거

        // 속도 설정
        this.ball.body.velocity.set(vx, vy, vz);
    }

    resetBall() {
        this.ball.body.position.set(0, 1, 0);  // 수정: 초기 위치를 높게 설정
        this.ball.body.velocity.setZero();
        this.setBallVelocity(this.constantBallSpeed);
    }

    updatePhysics() {
        this.world.step(1 / 60);

        // NaN 값 체크 및 처리
        if (isNaN(this.ball.body.position.x) || isNaN(this.ball.body.position.y) || isNaN(this.ball.body.position.z)) {
            console.error("Ball position is NaN. Resetting...");
            this.resetBall();
        } else {
            this.ball.mesh.position.copy(this.ball.body.position);
            this.ball.mesh.quaternion.copy(this.ball.body.quaternion);
        }

        this.playerOne.mesh.position.copy(this.playerOne.body.position);
        this.playerTwo.mesh.position.copy(this.playerTwo.body.position);
        if (Math.abs(this.ball.body.position.z) > 120) {
            if (this.ball.body.position.z > 0) {
                this.score.playerOne += 1;
                this.ballSummunDriction = 1;
            }
            else {
                this.score.playerTwo += 1;
                this.ballSummunDriction = -1;
            }
            this.resetBall();
            this.makeFont(`you ${this.score.playerOne} : other ${this.score.playerTwo}`);
        }

        this.maintainConstantVelocity();
    }

    animate() {
        requestAnimationFrame(this.animate);
        socket.emit('position', this.makePositionDate());
        this.updatePhysics();
        this.updateKey();
        if(!this.isremote)
            this.gameAi();
        this.renderer.render(this.scene, this.camera);

        // console.log(this.ball.body.position);
    }

    remoteMove(data) {
        this.playerTwo.mesh.position.set(data.playerTwo, 6, 100);
        this.playerTwo.body.position.set(data.playerTwo, 6, 100);
        this.ball.body.position = data.ball;
    }
}

socket.on('ping', (data) => console.log(data));

// socket.on('ping', ({user, payload}) => {
//     if(user === you) return ;

//     // notification
const game = new PingPong();
socket.on('remote', (data) => {
    game.isremote = true;
    console.log("multiplaying");
    // game.playerTwoPosition = data.playerTwo;
    // game.playerOnePosition = data.playerOne;
    // game.ball.body.position = data.ball;
    // game.score = data.score;
    game.remoteMove(data);
});

