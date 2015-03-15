var Player = require('./lib/player.js');
var Parser = require('./lib/parser.js');
var Editor = require('./lib/editor.js');
var Terminal = require('./ext/term.js');

window.TTYPlayer = module.exports = {
    Parser: Parser,
    Player: Player,
    Editor: Editor,
    Terminal: Terminal,
};
