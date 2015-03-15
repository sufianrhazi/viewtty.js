var Player = require('./lib/player.js');
var Parser = require('./lib/parser.js');
var Terminal = require('./ext/term.js');

window.ViewTTY = module.exports = {
    Parser: Parser,
    Player: Player,
    Terminal: Terminal
};
