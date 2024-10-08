const socket = io()
socket.on('connect', () => {
    var playerName = localStorage.getItem('playerName') || 'anonymous';
    var roomID = localStorage.getItem('roomID') || '';
    // create room with empty roomID
    socket.emit('set-data', { playerName: playerName, roomID: roomID })
})
socket.on('timeout', () => {
    window.location.href = "./timeout.html"
})
socket.on('result', (unluckyNum, loser) => {
    window.location.href = `./result` + `?unluckyNum=${unluckyNum}&loser=${loser}`
})
socket.on('update', (timer, playerList, startNum, endNum, currentPlayer) => {
    document.querySelector('#timer>p').innerText = timer
    document.getElementById('startNum').innerText = startNum
    document.getElementById('endNum').innerText = endNum
    document.getElementById('currentPlayer').innerText = playerList[currentPlayer] ? playerList[currentPlayer] : ""
    let plyerTable = document.getElementById('player-list')
    plyerTable.innerHTML = `<tr><th>No.</th><th>Name</th></tr>`
    for (let i in playerList) {
        let index = parseInt(i)
        // headlight the player row
        if (index == currentPlayer)
            plyerTable.innerHTML += `<tr style='background-color: #d7ba71;'><td>${(index + 1)}</td><td>${playerList[i]}</td></tr>`
        else
            plyerTable.innerHTML += `<tr><td>${(index + 1)}</td><td>${playerList[i]}</td></tr>`
    }
})
// pop up the waiting window
socket.on('waiting', (players, roomID) => {
    document.getElementById('waiting').style.display = 'flex'
    document.getElementById('waiting-room-id').innerText = "Room ID: " + roomID
    updateWaiting(players)

})
// update the waiting window
socket.on('update-waiting', (players) => {
    updateWaiting(players)
})
function updateWaiting(players) {
    let playerList = document.getElementById('player-waiting-list')
    playerList.innerHTML = `<tr><th>Name</th><th>Ready</th></tr>`
    for (let i = 0; i < players.length; i++) {
        playerList.innerHTML += `<tr><td>${players[i].name}</td> <td>${players[i].ready ? "✔️" : "❌"}</td> </tr>`
    }
}
// show a temporary message for 3 seconds
socket.on('msg', (msg, elementId = 'msg') => {
    console.log(elementId)
    let msgBox = document.getElementById(elementId)
    msgBox.innerText = msg
    setTimeout(() => { msgBox.innerText = "" }, 3000);
})

// pop up the input guess box
socket.on('guessNum', () => {
    document.getElementById('guess-num').style.display = 'flex'
    document.getElementById('guess').focus()
    document.getElementById('guess').value = ''
})

// get the roomID from server and save it to local storage
socket.on('roomID', (result) => {
    localStorage.setItem('roomID', result)
    document.getElementById('room-id').innerText = "Room ID: " + result
})
socket.on('start-game', () => {
    document.getElementById('waiting').style.display = 'none'
})
socket.on('room-not-found', () => {
    alert('Room not found')
    window.location.href = "./"
})

function sendGuess() {
    let num = document.getElementById('guess').value
    socket.emit('guessNum', num)
    document.getElementById('guess-num').style.display = 'none'
}

window.onload = () => {
    document.getElementById('guess').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            sendGuess()
        }
    })
}