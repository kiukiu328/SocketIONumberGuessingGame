const express = require('express')
const app = express()
const http = require("http").Server(app)
const io = require("socket.io")(http, { cors: { origin: '*' } })// prevent CORS error
app.use(express.static("public"))
app.set("view engine", "ejs")
http.listen(6827)

io.on("connect_error", (err) => {
    console.log(`connect_error due to ${err.message}`)
})

app.get("/", (req, res) => {
    res.render("index")
})
app.get("/result", (req, res) => {
    res.render("result", { unluckyNum: req.query.unluckyNum, loser: req.query.loser })
})
app.get("/game", (req, res) => {
    res.render("game", { playerName: req.query.playerName, roomID: req.query.roomID })
})





var games = {}
io.on("connection", socket => {

    connectedSocket = Array.from(io.sockets.sockets).map(socket => socket[0]);
    socket.on('set-data', (data) => {
        if (data.roomID != "" && games[data.roomID] === undefined) {
            console.log("Room not found:", data.roomID)
            socket.emit('room-not-found')
            return
        }
        if (data.roomID == "") {
            data.roomID = Math.random().toString(36).slice(2)
            games[data.roomID] = new Game(data.roomID)
            console.log("Room Created: ", data.roomID)
        } else {
            console.log("Join Room: ", data.roomID)
        }
        socket.playerName = data.playerName
        socket.roomID = data.roomID
        socket.join(data.roomID)
        games[data.roomID].addPlayer(new Player(socket))
    })
    socket.on('ready', () => {
        games[socket.roomID].setPlayerReady(socket.id)
        io.to(socket.roomID).emit('update-waiting', Object.values(games[socket.roomID].players).map(p => { return { name: p.name, ready: p.ready } }))
        if (Object.values(games[socket.roomID].players).filter(p => p.ready == false).length == 0) {
            games[socket.roomID].start()
        }
    })

    socket.on('disconnect', () => {
        if (games[socket.roomID] === undefined) {
            return
        }
        games[socket.roomID].removePlayer(socket)
    })
    socket.on('guessNum', (num) => {
        games[socket.roomID].guessNum(num, socket)
        
    })

})
class Player {
    constructor(socket) {
        this.id = socket.id
        this.name = socket.playerName
        this.socket = socket
        this.ready = false
        socket.emit('roomID', socket.roomID)
    }
}
const countDownTime = 100
class Game {
    constructor(roomID) {
        this.roomID = roomID
        this.players = {}
        this.startNum = 1
        this.endNum = 100
        this.countDownTimer = countDownTime
        this.currentPlayerIndex = 0
        this.playing = false
        this.interval = null
        this.currentPlayer = null
        this.unluckyNum = Math.floor(Math.random() * (99 - 2)) + 2
        console.log(`Unlucky Num: ${this.unluckyNum}`)
    }
    setPlayerReady(playerID) {
        this.players[playerID].ready = true
    }
    addPlayer(player) {
        this.players[player.socket.id] = player
        io.to(this.roomID).emit('msg', `${player.name} has joined the room`)
        io.to(this.roomID).emit('update', this.countDownTimer, Object.values(this.players).map(p => p.name), this.startNum, this.endNum, this.currentPlayerIndex)
        if (!this.playing) {
            let temp = Object.values(this.players).map(p => { return { name: p.name, ready: p.ready } })
            io.to(this.roomID).emit('waiting', temp, this.roomID)
        }
    }
    removePlayer(player) {
        console.log("Player Leave: ", player.id)
        delete this.players[player.id]
        io.to(this.roomID).emit('msg', `${player.name} has left the room`)
        let playerLength = Object.values(this.players).length
        if ( playerLength == 0) {
            delete games[this.roomID]
            console.log("Room Deleted: ", this.roomID)
            clearInterval(this.interval)
        }else if (playerLength == 1) {
            io.to(this.roomID).emit('waiting', Object.values(this.players).map(p => { return { name: p.name, ready: p.ready } }), this.roomID)
            this.playing = false
            clearInterval(this.interval)
        }
    }
    start() {
        console.log("Game Start")
        this.playing = true
        io.to(this.roomID).emit('start-game')

        // pop up the input guess box
        this.currentPlayer = this.players[Object.keys(this.players)[this.currentPlayerIndex]]
        this.currentPlayer.socket.emit('guessNum')
        this.interval = setInterval(this.gameLoop.bind(this), 1000)
    }
    guessNum(num, socket) {
        if (this.currentPlayer.socket.id != socket.id) {
            return
        }
        num = parseInt(num)
        if (num > this.startNum && num < this.endNum) {
            if (num == this.unluckyNum) {
                let loser = this.players[socket.id].name
                io.to(this.roomID).emit('result', this.unluckyNum, loser)
            } else {
                if (num < this.unluckyNum) {
                    this.startNum = num
                }
                else if (num > this.unluckyNum) {
                    this.endNum = num
                }
                io.to(this.roomID).emit('msg', `Player ${this.players[socket.id].name} guessed ${num}`)
                this.countDownTimer = countDownTime
                this.nextPlayer()
            }
            io.to(this.roomID).emit('update', this.countDownTimer, Object.values(this.players).map(p => p.name), this.startNum, this.endNum, this.currentPlayerIndex)
        } else {
            socket.emit('guess-msg', 'Not a vaild Number')
            socket.emit('guessNum')
        }
    }
    nextPlayer() {
        this.currentPlayerIndex = ++this.currentPlayerIndex % Object.values(this.players).length
        this.currentPlayer = this.players[Object.keys(this.players)[this.currentPlayerIndex]]
        this.currentPlayer.socket.emit('guessNum')
    }
    gameLoop() {
        // broadcast the information to all player
        io.to(this.roomID).emit('update', this.countDownTimer, Object.values(this.players).map(p =>  p.name), this.startNum, this.endNum, this.currentPlayerIndex)
        // count down
        this.countDownTimer--
        // if timeout kick the user
        if ( this.countDownTimer <= 0) {
            this.currentPlayer.socket.emit('timeout')
            this.currentPlayer.socket.disconnect()
            this.countDownTimer = countDownTime
        }
    }

}
