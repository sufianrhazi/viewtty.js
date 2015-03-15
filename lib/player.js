function Player() {
    this._chunks = null;
    this._frame = 0;
    this._tickHandle = null;
    this.listeners = [];
}
Player.prototype.load = function (chunks) {
    this._chunks = chunks;
    this.rewind();
};
Player.prototype.addListener = function (f) {
    this.listeners.push(f);
};
Player.prototype.removeListener = function (f) {
    this.listeners = this.listeners.filter(function (elem) {
        return f !== elem;
    });
};
Player.prototype.play = function play() {
    if (this._tickHandle) {
        return true;
    }
    if (this._frame >= this._chunks.length) {
        return true;
    }
    this._emit('play');
    this._step();
    return false;
};
Player.prototype._emit = function _emit(type, data) {
    this.listeners.forEach(function (f) {
        try {
            f({
                type: type,
                data: data
            });
        } catch (e) {
            // throw listener failure out-of-band
            setTimeout(function () { throw e; }, 0);
        }
    }.bind(this));
};
Player.prototype.pause = function pause() {
    if (this._tickHandle) {
        this._emit('pause');
        clearTimeout(this._tickHandle);
        this._tickHandle = null;
    }
};
Player.prototype.rewind = function rewind() {
    this.pause();
    this._emit('rewind');
    this._frame = 0;
};
Player.prototype._step = function _step() {
    var frame = this._frame;
    var currentChunk = this._chunks[this._frame];
    this._emit('data', {
        data: currentChunk.data, 
        frame: frame,
        ms: currentChunk.ms
    });

    this._frame++;
    if (this._frame < this._chunks.length) {
        var nextChunk = this._chunks[this._frame];
        this._tickHandle = setTimeout(this._step.bind(this), nextChunk.ms - currentChunk.ms);
    } else {
        this._emit('end');
    }
};

module.exports = Player;
