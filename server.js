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
const countDownTime = 10
class Game {
    constructor(roomID) {
        this.roomID = roomID
        this.players = {}
        this.playersLength = 0
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
    emitUpdate() {
        io.to(this.roomID).emit('update', this.countDownTimer, Object.values(this.players).map(p => p.name), this.startNum, this.endNum, this.currentPlayerIndex)
    }
    emitWaiting() {
        io.to(this.roomID).emit('waiting', Object.values(this.players).map(p => { return { name: p.name, ready: p.ready } }), this.roomID)
    }
    setPlayerReady(playerID) {
        this.players[playerID].ready = true
    }

    addPlayer(player) {
        this.players[player.socket.id] = player
        this.playersLength++

        io.to(this.roomID).emit('msg', `${player.name} has joined the room`)
        this.emitUpdate()

        // if the game is not playing, pop up the waiting window
        if (!this.playing) {
            this.emitWaiting()
        }
    }
    removePlayer(player) {
        // remove the player from the game
        console.log("Player Leave: ", player.id)
        io.to(this.roomID).emit('msg', `${player.name} has left the room`)
        delete this.players[player.id]
        this.playersLength--

        // if the game is not playing, update the waiting window
        if (!this.playing) {
            io.to(this.roomID).emit('update-waiting', Object.values(this.players).map(p => { return { name: p.name, ready: p.ready } }))
        }
        // if no player left, delete the room
        else if (this.playersLength == 0) {
            delete games[this.roomID]
            clearInterval(this.interval)

            console.log("Room Deleted: ", this.roomID)
        }
        // if only one player left, stop the game
        else if (this.playersLength == 1) {
            let player = Object.values(this.players)[0]
            player.ready = false
            this.playing = false
            clearInterval(this.interval)

            this.emitWaiting()
            this.emitUpdate()

            console.log("Player Left: ", player.name)
        }
    }
    start() {
        this.playing = true
        this.currentPlayer = this.players[Object.keys(this.players)[this.currentPlayerIndex]]
        this.interval = setInterval(this.gameLoop.bind(this), 1000)

        // pop up the input guess box
        this.currentPlayer.socket.emit('guessNum')
        io.to(this.roomID).emit('start-game')
        console.log("Game Start")
    }
    guessNum(num, socket) {
        // check if the player is the current player
        if (this.currentPlayer.socket.id != socket.id) {
            return
        }
        num = parseInt(num)
        // check if the number is valid
        if (num <= this.startNum || num >= this.endNum) {
            socket.emit('msg', 'Not a vaild Number', 'guess-box-msg')
            socket.emit('guessNum')
            return
        }
        // check if the number is the unlucky number
        if (num == this.unluckyNum) {
            let loser = this.players[socket.id].name
            io.to(this.roomID).emit('result', this.unluckyNum, loser)
            return
        }
        if (num < this.unluckyNum) {
            this.startNum = num
        }
        else if (num > this.unluckyNum) {
            this.endNum = num
        }
        io.to(this.roomID).emit('msg', `Player ${this.players[socket.id].name} guessed ${num}`)
        this.emitUpdate()

        this.countDownTimer = countDownTime
        this.nextPlayer()
    }
    nextPlayer() {
        this.currentPlayerIndex = ++this.currentPlayerIndex % this.playersLength
        this.currentPlayer = this.players[Object.keys(this.players)[this.currentPlayerIndex]]
        this.currentPlayer.socket.emit('guessNum')
    }
    gameLoop() {
        // broadcast the information to all player
        this.emitUpdate()
        // count down
        this.countDownTimer--
        // if timeout kick the user
        if (this.countDownTimer <= 0) {
            this.currentPlayer.socket.emit('timeout')
            this.currentPlayer.socket.disconnect()
            this.countDownTimer = countDownTime
        }
    }

}
