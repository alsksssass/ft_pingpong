import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

const socket = io();

class PingPongClient {
    constructor(remoteOption) {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(800, 800);
        this.remotePlay = remoteOption;
        this.gameWidth = 100;
        this.gameLenth = 250;
        this.initColor = [0xffffff, 0xff0000, 0x000000, 0x0000cc]

        //두번째 플레이어 확인
        this.secondPlayer = false;
        
        // 텍스트
        this.textdata = null;

        // 마우스 이벤트 관련 변수
        this.isDragging = false;
        this.previousMousePosition = {
            x: 0,
            y: 0
        };
        // 카메라 설정
        this.camSetPosition = true;
        this.cameraRadius = 200;
        this.cameraTheta = 1.56;
        this.cameraPhi = 1.03;
        this.cameraTarget = new THREE.Vector3(0, 0, 0);
        this.updateCameraPosition();

        this.makeWindow();
        this.setupLights();
        this.setupEventListeners();

        this.playerOne = this.makeGameBar(0, 6, 100, 1);
        this.playerTwo = this.makeGameBar(0, 6, -100, 0);
        this.ball = this.createBall();
        this.makeTable();
        this.makeLine();
        this.makeGuideLines();

        this.animate = this.animate.bind(this);
        this.animate();

        this.setupSocketListeners();
    }

    makeWindow() {
        const newDiv = document.createElement('div');
        newDiv.classList.add("gameWindow");
        newDiv.appendChild(this.renderer.domElement);
        document.body.appendChild(newDiv);
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
                textMesh.position.set(-20, 50, 0);
                this.scene.add(textMesh);
                this.textdata = textMesh;
            }
        );
    }
    setupLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 1);
        this.scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0xffffff, 1, 1000);
        pointLight.position.set(0, 100, 0);
        this.scene.add(pointLight);
    }

    setupEventListeners() {
        window.addEventListener('keydown', this.onKeyDown.bind(this), false);
        window.addEventListener('keyup', this.onKeyUp.bind(this), false);
        this.renderer.domElement.addEventListener('mousedown', this.onMouseDown.bind(this), false);
        this.renderer.domElement.addEventListener('mousemove', this.onMouseMove.bind(this), false);
        this.renderer.domElement.addEventListener('mouseup', this.onMouseUp.bind(this), false);
        window.addEventListener('resize', this.onWindowResize.bind(this), false);
    }

    onKeyDown(event) {
        const key = event.key.toUpperCase();
        if (!this.secondPlayer && (key === 'A' || key === 'D')) {
            socket.emit('keyPress', { key: key, pressed: true });
        }
        else if(this.secondPlayer && (key === 'A' || key === 'D')) {
            socket.emit('keyPress', { key: key === 'A' ? 'D':'A', pressed: true });
        }
    }

    onKeyUp(event) {
        const key = event.key.toUpperCase();
        if (!this.secondPlayer && (key === 'A' || key === 'D')) {
            socket.emit('keyPress', { key: key, pressed: false });
        }
        else if(this.secondPlayer && (key === 'A' || key === 'D')) {
            socket.emit('keyPress', { key: key === 'A' ? 'D':'A', pressed: false });
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
        console.log(this.cameraPhi, this.cameraRadius, this.cameraTheta);
        this.cameraTheta -= deltaMove.x * 0.01;
        this.cameraPhi -= deltaMove.y * 0.01;
        this.cameraPhi = Math.max(0.1, Math.min(Math.PI - 0.1, this.cameraPhi));
        this.updateCameraPosition();
    }
    updateCameraPosition() {
        this.camera.position.x = this.cameraRadius * Math.sin(this.cameraPhi) * Math.cos(this.cameraTheta);
        this.camera.position.y = this.cameraRadius * Math.cos(this.cameraPhi);
        this.camera.position.z = this.cameraRadius * Math.sin(this.cameraPhi) * Math.sin(this.cameraTheta);
        this.camera.lookAt(this.cameraTarget);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    createBall() {
        const ballGeometry = new THREE.SphereGeometry(2, 32, 32);
        const ballMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff });
        const ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);
        this.scene.add(ballMesh);
        return ballMesh;
    }

    makeGameBar(x, y, z, check) {
        const paddleGeometry = new THREE.BoxGeometry(20, 5, 5);
        const paddleMaterial = new THREE.MeshPhongMaterial({ color: this.initColor[check]});
        const paddleMesh = new THREE.Mesh(paddleGeometry, paddleMaterial);
        paddleMesh.position.set(x, y, z);
        this.scene.add(paddleMesh);
        return paddleMesh;
    }

    makeTable() {
        const tableGeometry = new THREE.BoxGeometry(this.gameWidth, 5, this.gameLenth);
        const tableMaterial = new THREE.MeshPhongMaterial({ color: 0x1a5c1a });
        const tableMesh = new THREE.Mesh(tableGeometry, tableMaterial);
        this.scene.add(tableMesh);
    }

    makeLine() {
        const lineGeometry = new THREE.BoxGeometry(this.gameWidth, 6, 1);
        const lineMaterial = new THREE.MeshPhongMaterial({ color: 0x0000ff });
        const line = new THREE.Mesh(lineGeometry, lineMaterial);
        this.scene.add(line);
    }

    makeGuideLines() {
        const guideGeometry = new THREE.BoxGeometry(1, 10, this.gameLenth);
        const guideMaterial = new THREE.MeshPhongMaterial({ color: 0x0000ff });
        
        this.leftGuide = new THREE.Mesh(guideGeometry, guideMaterial);
        this.leftGuide.position.set(-this.gameWidth/2, 5, 0);
        this.scene.add(this.leftGuide);

        this.rightGuide = new THREE.Mesh(guideGeometry, guideMaterial);
        this.rightGuide.position.set(this.gameWidth/2, 5, 0);
        this.scene.add(this.rightGuide);
    }

    updateGameState(gameState) {
        this.playerOne.position.set(gameState.playerOne.x, gameState.playerOne.y, gameState.playerOne.z);
        this.playerTwo.position.set(gameState.playerTwo.x, gameState.playerTwo.y, gameState.playerTwo.z);
        this.ball.position.set(gameState.ball.x, gameState.ball.y, gameState.ball.z);
    }

    setupSocketListeners() {
        socket.on('gameState', (gameState) => {
            this.updateGameState(gameState);
        });
    }

    animate() {
        requestAnimationFrame(this.animate);
        if(this.textdata)
            this.textdata.lookAt(this.camera.position);
        this.renderer.render(this.scene, this.camera);
    }
}

const game = new PingPongClient(true);

socket.on('secondPlayer', (gameState)=> {
    game.secondPlayer = true;
    game.cameraTheta = -game.cameraTheta;
    game.updateCameraPosition();
    game.playerOne.material.color.setHex(game.initColor[0]);
    game.playerTwo.material.color.setHex(game.initColor[1]);
});

socket.on('score',(gameState)=>{
    game.makeFont(!game.secondPlayer ? `${gameState.oneName} ${gameState.score.playerOne} : ${gameState.score.playerTwo} ${gameState.twoName}`: `${gameState.twoName} ${gameState.score.playerTwo} : ${gameState.score.playerOne} ${gameState.oneName}`);
});