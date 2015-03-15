var dom = require('./dom.js');
function Editor(chunks) {
    this.chunks = chunks;
    this.state = {
        scrubber: 0,
        zoom: false,
        zoomStart: null,
        zoomEnd: null,
    };
    this.el = dom.el('div', {
        class: 'tty-editor',
    }, [
        (this.canvasEl = dom.el('canvas', {
            width: 640,
            height: 88
        }, [])),
        dom.el('div', {}, [
            (this.cutEl = dom.el('button', {
                "disabled": ""
            }, [
                txt('✂︎')
            ]))
        ]),
    ]);
    this.canvasEl.addEventListener('mousedown', this.onDown.bind(this));
    this.canvasEl.addEventListener('mouseup', this.onUp.bind(this));
    this.canvasEl.addEventListener('mouseout', this.onOut.bind(this));
    this.canvasEl.addEventListener('mousemove', this.onMove.bind(this));
    this.canvasEl.addEventListener('touchstart', this.onDown.bind(this));
    this.canvasEl.addEventListener('touchend', this.onUp.bind(this));
    this.canvasEl.addEventListener('touchcancel', this.onOut.bind(this));
    this.canvasEl.addEventListener('touchmove', this.onMove.bind(this));
}
Editor.prototype.attach = function (target) {
    target.appendChild(this.el);
    this.canvasEl.width = target.clientWidth();
    this.redraw();
};
Editor.prototype.onDown = function (event) {
};
Editor.prototype.onUp = function (event) {
};
Editor.prototype.onMove = function (event) {
};
Editor.prototype.onOut = function (event) {
};
