var terminal = new ViewTTY.Terminal({
    cols: 80,
    rows: 25,
    noFocus: true,
    noEvents: true
});
terminal.open(document.getElementById('term'));
terminal.write('Loading ttyrec file');
terminal.showCursor();

// Then we create a player and hook its events to the terminal for display
var player = new ViewTTY.Player();
player.addListener(function (event) {
    if (event.type === 'data') {
        terminal.write(event.data.data);
    }
});

// Now let's initialize the UI:
var buttons = {
    play: document.querySelector('[data-play]'),
    pause: document.querySelector('[data-pause]'),
    rewind: document.querySelector('[data-rewind]'),
    clear: document.querySelector('[data-clear]'),
};
buttons.clear.onclick = function () {
    terminal.reset();
    terminal.showCursor();
};
buttons.rewind.onclick = function () {
    player.rewind();
};
buttons.play.onclick = function () {
    player.play();
};
buttons.pause.onclick = function () {
    player.pause();
};

// And we can also hook up the player's events to update the UI
player.addListener(function (event) {
    if (event.type === 'play') {
        buttons.play.disabled = true;
        buttons.pause.disabled = false;
        buttons.rewind.disabled = false;
    }
    if (event.type === 'rewind') {
        buttons.play.disabled = false;
        buttons.pause.disabled = true;
        buttons.rewind.disabled = true;
    }
    if (event.type === 'pause') {
        buttons.play.disabled = false;
        buttons.pause.disabled = true;
        buttons.rewind.disabled = false;
    }
    if (event.type === 'end') {
        buttons.play.disabled = true;
        buttons.pause.disabled = true;
        buttons.rewind.disabled = false;
    }
});

// Now all we need to do is fetch the ttyrec output file as an ArrayBuffer
fetchArrayBuffer('example.ttyrec', function (arraybuffer) {
    terminal.reset();
    terminal.showCursor();
    try {
        // parse the response into chunks,
        var parser = new ViewTTY.Parser();
        var chunks = parser.parse(arraybuffer);

        // load the chunks into the player,
        player.load(chunks);

        // and now we're ready to go!
        player.play();
    } catch (e) {
        terminal.write('\n\rERROR: unable to play the ttyrec file!\n\rYour browser may not be supported :(');
    }
});

function fetchArrayBuffer(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.responseType = 'arraybuffer';
    xhr.onreadystatechange = function () {
        if (this.readyState === this.DONE) {
            if (this.status === 200) {
                callback(this.response);
            } else {
                terminal.write('\n\rERROR: failed to load the ttyrec file.');
            }
        } else {
            terminal.write('.');
        }
    };
    xhr.send();
}
