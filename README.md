<!DOCTYPE html><html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Click the Box Game</title>
    <style>
        body {
            text-align: center;
            font-family: Arial, sans-serif;
        }
        #gameArea {
            width: 400px;
            height: 400px;
            border: 2px solid black;
            margin: auto;
            position: relative;
            overflow: hidden;
        }
        .box {
            width: 50px;
            height: 50px;
            background-color: red;
            position: absolute;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <h1>Click the Box Game</h1>
    <p>Score: <span id="score">0</span></p>
    <div id="gameArea"></div>
    <script>
        let score = 0;
        const gameArea = document.getElementById("gameArea");
        const scoreDisplay = document.getElementById("score");function createBox() {
        const box = document.createElement("div");
        box.classList.add("box");
        box.style.top = Math.random() * 350 + "px";
        box.style.left = Math.random() * 350 + "px";
        gameArea.appendChild(box);

        box.addEventListener("click", () => {
            score++;
            scoreDisplay.textContent = score;
            box.remove();
            createBox();
        });
    }

    createBox();
</script>

</body>
</html>
