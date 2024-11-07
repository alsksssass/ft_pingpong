import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
const socket = io();
const WAIT_GAME = 1;
const START_GAME = 2;
const END_GAME = 3;
const SOUND_BALL = 'public/localdata/sound/ball.mp3';
const audioListenr = new THREE.AudioListener();
const basicSound = new THREE.Audio(audioListenr);

// 오디오 관리 클래스
class AudioManager {
    constructor(camera) {
        this.camera = camera;
        this.audioContext = null;
        this.listener = null;
        this.sounds = new Map(); // 여러 사운드 관리를 위한 Map
        this.audioLoader = null;
        this.initialized = false;
        this.initializationPromise = null;
    }

    // 초기화
    async init() {
        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = new Promise((resolve) => {
            const handleInteraction = async () => {
                if (this.initialized) return;

                // AudioContext 초기화
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                this.audioContext = new AudioContext();

                // Three.js 오디오 컴포넌트 초기화
                this.listener = new THREE.AudioListener();
                this.audioLoader = new THREE.AudioLoader();
                this.camera.add(this.listener);

                // suspended 상태인 경우 resume
                if (this.audioContext.state === 'suspended') {
                    await this.audioContext.resume();
                }

                this.initialized = true;

                // 이벤트 리스너 제거
                ['click', 'touchstart', 'keydown'].forEach(event => {
                    document.removeEventListener(event, handleInteraction);
                });

                resolve();
            };

            // 사용자 상호작용 이벤트 리스너 추가
            ['click', 'touchstart', 'keydown'].forEach(event => {
                document.addEventListener(event, handleInteraction);
            });
        });

        return this.initializationPromise;
    }

    // 새로운 사운드 로드
    async loadSound(name, path, options = {}) {
        if (!this.initialized) {
            throw new Error('AudioManager not initialized. Call init() first.');
        }

        return new Promise((resolve, reject) => {
            this.audioLoader.load(path, (buffer) => {
                const sound = new THREE.Audio(this.listener);
                sound.setBuffer(buffer);
                
                // 기본 옵션 설정
                sound.setVolume(options.volume ?? 0.5);
                sound.setLoop(options.loop ?? false);
                
                // Map에 사운드 저장
                this.sounds.set(name, {
                    sound,
                    options: { ...options }
                });
                resolve(sound);
            }, undefined, reject);
        });
    }

    // 사운드 재생
    play(name) {
        const soundData = this.sounds.get(name);
        if (!soundData) {
            console.warn(`Sound "${name}" not found`);
            return;
        }

        const { sound } = soundData;
        if (!sound.isPlaying) {
            sound.play();
        }
    }

    // 사운드 정지
    stop(name) {
        const soundData = this.sounds.get(name);
        if (!soundData) {
            console.warn(`Sound "${name}" not found`);
            return;
        }

        const { sound } = soundData;
        if (sound.isPlaying) {
            sound.stop();
        }
    }

    // 볼륨 조절
    setVolume(name, volume) {
        const soundData = this.sounds.get(name);
        if (!soundData) {
            console.warn(`Sound "${name}" not found`);
            return;
        }

        soundData.sound.setVolume(Math.max(0, Math.min(1, volume)));
    }

    // 모든 사운드 정지
    stopAll() {
        this.sounds.forEach(({ sound }) => {
            if (sound.isPlaying) {
                sound.stop();
            }
        });
    }

    // 리소스 정리
    dispose() {
        this.stopAll();
        this.sounds.forEach(({ sound }) => {
            sound.buffer = null;
        });
        this.sounds.clear();
        if (this.camera && this.listener) {
            this.camera.remove(this.listener);
        }
    }
}


class PingPongClient {
    constructor(remoteOption) {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.audio = new AudioManager(this.camera);
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(800, 800);
        this.remotePlay = remoteOption;
        this.gameWidth = 100;
        this.gameLenth = 250;
        this.initColor = [0xffffff, 0xff0000, 0x000000, 0x0000cc]
        this.gameStart = WAIT_GAME;
        //두번째 플레이어 확인
        this.secondPlayer = false;
        //공 갯수
        this.balls = [];
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
        const initAudio = async () => {
            // 사용자 상호작용을 기다림
            const handleFirstInteraction = async () => {
                try {
                    await this.audio.init();
                    await this.audio.loadSound('ball', 'public/localdata/sound/ball.mp3', {
                        loop: false,
                        volume: 0.9
                    });
                    console.log('Audio initialized successfully');
                    
                    // 이벤트 리스너 제거
                    ['click', 'touchstart', 'keydown'].forEach(event => {
                        document.removeEventListener(event, handleFirstInteraction);
                    });
                } catch (error) {
                    console.error('Failed to initialize audio:', error);
                }
            };

            // 사용자 상호작용 이벤트 리스너 추가
            ['click', 'touchstart', 'keydown'].forEach(event => {
                document.addEventListener(event, handleFirstInteraction);
            });
        };

        initAudio();
    }
    soundPlayer(type){
        console.log('aaa');
        const soundLoader = new THREE.AudioLoader();
        soundLoader.load(
            type,function(buffer){
                basicSound.setBuffer(buffer);
                basicSound.setLoop(false);
                basicSound.setVolume(0.5);
                basicSound.play();
            }
        )
    }
    makeWindow() {
        const newDiv = document.createElement('div');
        newDiv.classList.add("gameWindow");
        newDiv.appendChild(this.renderer.domElement);
        document.body.appendChild(newDiv);
    }
    makeFont(msg) {
        const loader = new FontLoader();
        loader.load(
            // '/localdata/helvetiker_regular.typeface.json',
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
                textGeo.computeBoundingBox();
                textGeo.center();
                const material = new THREE.MeshPhongMaterial({ color: 0xffffff });
                const textMesh = new THREE.Mesh(textGeo, material);
                textMesh.position.set(0, 50, 0);
                if (this.textdata) {
                    // 기존 텍스트 지오메트리 삭제 및 업데이트
                    this.scene.remove(this.textdata); // 씬에서 텍스트 제거
                    this.textdata.geometry.dispose();  // geometry 메모리 해제
                    this.textdata.material.dispose();  // material 메모리 해제
                    this.textdata = null;
                }
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
            socket.emit('keyPress', { key: key, pressed: true ,who:this.secondPlayer});
        }
        else if(this.secondPlayer && (key === 'A' || key === 'D')) {
            socket.emit('keyPress', { key: key === 'A' ? 'D':'A', pressed: true ,who:this.secondPlayer})
        }
        else if(key === ' ')
            socket.emit('keyPress', { key: ' ', pressed: true ,who:this.secondPlayer});
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

    // 여러 개의 공을 생성하는 메서드
    createBalls(count) {
        // 기존 공들 제거
        this.balls.forEach(ball => {
            this.scene.remove(ball);
            ball.geometry.dispose();
            ball.material.dispose();
        });
        this.balls = [];

        // 새로운 공들 생성
        for (let i = 0; i < count; i++) {
            const ball = this.createBall();
            this.balls.push(ball);
        }
    }

    updateGameState(gameState) {
        this.playerOne.position.set(
            gameState.playerOne.x, 
            gameState.playerOne.y, 
            gameState.playerOne.z
        );
        this.playerTwo.position.set(
            gameState.playerTwo.x, 
            gameState.playerTwo.y, 
            gameState.playerTwo.z
        );

        // 공의 개수가 변경된 경우 공들을 새로 생성
        if (this.balls.length !== gameState.balls.length) {
            this.createBalls(gameState.balls.length);
        }

        // 각 공의 위치 업데이트
        gameState.balls.forEach((ballData, index) => {
            this.balls[index].position.set(
                ballData.position.x,
                ballData.position.y,
                ballData.position.z
            );
            this.balls[index].material.color.setHex(this.initColor[gameState.balls[index].powerCounter]);
        });
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


    setupSocketListeners() {
        socket.on('data', (gameState) => {
            
            if(gameState.type === 'gameState') {
                this.updateGameState(gameState);
            }
            else if(gameState.type === 'score') {
                this.makeFont(!this.secondPlayer ? 
                    `${gameState.oneName} ${gameState.score.playerOne} : ${gameState.score.playerTwo} ${gameState.twoName}`: 
                    `${gameState.twoName} ${gameState.score.playerTwo} : ${gameState.score.playerOne} ${gameState.oneName}`
                );
            }
            else if(gameState.type === 'gameStart') {
                this.gameStart = START_GAME;
                this.makeFont(!this.secondPlayer ? 
                    `${gameState.oneName} ${gameState.score.playerOne} : ${gameState.score.playerTwo} ${gameState.twoName}`: 
                    `${gameState.twoName} ${gameState.score.playerTwo} : ${gameState.score.playerOne} ${gameState.oneName}`
                );
            }
            else if(gameState.type === 'gameEnd') {
                this.gameStart = END_GAME;
                this.makeFont(gameState.txt);
                this.textdata.lookAt(this.camera.position);
            }
            else if(gameState.type === 'secondPlayer') {
                this.secondPlayer = true;
                this.cameraTheta = -this.cameraTheta;
                this.updateCameraPosition();
                this.playerOne.material.color.setHex(this.initColor[0]);
                this.playerTwo.material.color.setHex(this.initColor[1]);
            }
            else if(gameState.type === 'gameWait') {
                this.gameStart = WAIT_GAME;
            }
            else if(gameState.type === 'sound'){
                if(gameState.sound == 'ballToWall' && this.audio.sounds.has('ball')){
                    this.audio.play('ball');
                }
            }
        });
    }

    animate() {
        requestAnimationFrame(this.animate);
        if(this.gameStart === START_GAME) {
            if(this.textdata) {
                this.textdata.lookAt(this.camera.position);
            }
        }
        else if(this.gameStart === WAIT_GAME) {
            this.makeFont('waiting for player!');
        }
        else if(this.gameStart === END_GAME) {
            this.textdata.rotation.y += 0.05;
        }
        this.renderer.render(this.scene, this.camera);
    }
}

const game = new PingPongClient(true);

// socket.on('secondPlayer', (gameState)=> {
//     game.secondPlayer = true;
//     game.cameraTheta = -game.cameraTheta;
//     game.updateCameraPosition();
//     game.playerOne.material.color.setHex(game.initColor[0]);
//     game.playerTwo.material.color.setHex(game.initColor[1]);
// });

// socket.on('score',(gameState)=>{
//     game.makeFont(!game.secondPlayer ? `${gameState.oneName} ${gameState.score.playerOne} : ${gameState.score.playerTwo} ${gameState.twoName}`: `${gameState.twoName} ${gameState.score.playerTwo} : ${gameState.score.playerOne} ${gameState.oneName}`);
// });
// socket.on('gameStart',(gameState)=>{
//     game.gameStart = START_GAME;
//     game.makeFont(!game.secondPlayer ? `${gameState.oneName} ${gameState.score.playerOne} : ${gameState.score.playerTwo} ${gameState.twoName}`: `${gameState.twoName} ${gameState.score.playerTwo} : ${gameState.score.playerOne} ${gameState.oneName}`);
// });
// socket.on('gameEnd',(txt)=>{
//     game.gameStart = END_GAME;
//     game.makeFont(txt);
//     game.textdata.lookAt(game.camera.position);
//     // game.textdata.lookAt(game.camera.position);
//     // alert(txt);
// });

// socket.on('data',(gameState = null)=>{
//     console.log(gameState.type,gameState);
//     if(gameState.type === 'score'){
//         game.makeFont(!game.secondPlayer ? `${gameState.oneName} ${gameState.score.playerOne} : ${gameState.score.playerTwo} ${gameState.twoName}`: `${gameState.twoName} ${gameState.score.playerTwo} : ${gameState.score.playerOne} ${gameState.oneName}`);
//     }
//     else if(gameState.type === 'gameStart'){
//     game.gameStart = START_GAME;
//     game.makeFont(!game.secondPlayer ? `${gameState.oneName} ${gameState.score.playerOne} : ${gameState.score.playerTwo} ${gameState.twoName}`: `${gameState.twoName} ${gameState.score.playerTwo} : ${gameState.score.playerOne} ${gameState.oneName}`);
//     }
//     else if(gameState.type === 'gameEnd'){
//     game.gameStart = END_GAME;
//     game.makeFont(gameState.txt);
//     game.textdata.lookAt(game.camera.position);
//     }
//     else if(gameState.type === 'secondPlayer'){
//     game.secondPlayer = true;
//     game.cameraTheta = -game.cameraTheta;
//     game.updateCameraPosition();
//     game.playerOne.material.color.setHex(game.initColor[0]);
//     game.playerTwo.material.color.setHex(game.initColor[1]);
//     }
//     else if(gameState.type === 'gameWait'){
//         game.gameStart = WAIT_GAME;
//     }
// })