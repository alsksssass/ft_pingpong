const { ifError } = require("assert");
const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);  // 'soket.io'를 'socket.io'로 수정

app.use(express.static('public'));

var user_list= [];

io.on('connection', (socket) => {
	console.log("connect!!");
	user_list.push(socket.id);
	io.emit('ping',"ping!!");

	socket.on('position', (data)=>{
		if(user_list.length < 2 || !data)
			return;
		console.log("remote on");
		const reboundSocket = user_list[0] === socket.id ? user_list[1]: user_list[0];
		io.to(reboundSocket).emit('remote', makeSendData(data, user_list[0] === socket.id));
	})
	socket.on('disconnect', ()=>{
		deleteUser(socket.id);
		console.log("delete!!");
	})
});

function makeSendData(data, isPlayerOne){
	return{
		playerOne: data.playerTwo,
		playerTwo: data.playerOne,
		ball: isPlayerOne === 1 ? data.ball : null,
		score: data.score,
	}
}
function deleteUser(socketId) {  // 'name' 대신 'socketId' 사용
    user_list = user_list.filter(id => id !== socketId);
}
http.listen(3000, () => {
    console.log('server running 3000 port!');
});


// createMesssage(socket, payload, type){
// 	return {
// 		type, payload, user: socket.id;
// 	}
// }

/* 
{
	type: 'data'
	payload:'안녕 sabyun',
	user: 'sdjflksdfjklsdjf'
	}
} */