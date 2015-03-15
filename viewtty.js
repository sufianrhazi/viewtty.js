(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
/**
 * term.js - an xterm emulator
 * Copyright (c) 2012-2013, Christopher Jeffrey (MIT License)
 * https://github.com/chjj/term.js
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 * Originally forked from (with the author's permission):
 *   Fabrice Bellard's javascript vt100 for jslinux:
 *   http://bellard.org/jslinux/
 *   Copyright (c) 2011 Fabrice Bellard
 *   The original design remains. The terminal itself
 *   has been extended to include xterm CSI codes, among
 *   other features.
 */

;(function() {

/**
 * Terminal Emulation References:
 *   http://vt100.net/
 *   http://invisible-island.net/xterm/ctlseqs/ctlseqs.txt
 *   http://invisible-island.net/xterm/ctlseqs/ctlseqs.html
 *   http://invisible-island.net/vttest/
 *   http://www.inwap.com/pdp10/ansicode.txt
 *   http://linux.die.net/man/4/console_codes
 *   http://linux.die.net/man/7/urxvt
 */

'use strict';

/**
 * Shared
 */

var window = this
  , document = this.document;

/**
 * EventEmitter
 */

function EventEmitter() {
  this._events = this._events || {};
}

EventEmitter.prototype.addListener = function(type, listener) {
  this._events[type] = this._events[type] || [];
  this._events[type].push(listener);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.removeListener = function(type, listener) {
  if (!this._events[type]) return;

  var obj = this._events[type]
    , i = obj.length;

  while (i--) {
    if (obj[i] === listener || obj[i].listener === listener) {
      obj.splice(i, 1);
      return;
    }
  }
};

EventEmitter.prototype.off = EventEmitter.prototype.removeListener;

EventEmitter.prototype.removeAllListeners = function(type) {
  if (this._events[type]) delete this._events[type];
};

EventEmitter.prototype.once = function(type, listener) {
  function on() {
    var args = Array.prototype.slice.call(arguments);
    this.removeListener(type, on);
    return listener.apply(this, args);
  }
  on.listener = listener;
  return this.on(type, on);
};

EventEmitter.prototype.emit = function(type) {
  if (!this._events[type]) return;

  var args = Array.prototype.slice.call(arguments, 1)
    , obj = this._events[type]
    , l = obj.length
    , i = 0;

  for (; i < l; i++) {
    obj[i].apply(this, args);
  }
};

EventEmitter.prototype.listeners = function(type) {
  return this._events[type] = this._events[type] || [];
};

/**
 * States
 */

var normal = 0
  , escaped = 1
  , csi = 2
  , osc = 3
  , charset = 4
  , dcs = 5
  , ignore = 6;

/**
 * Terminal
 */

function Terminal(options) {
  var self = this;

  if (!(this instanceof Terminal)) {
    return new Terminal(arguments[0], arguments[1], arguments[2]);
  }

  EventEmitter.call(this);

  if (typeof options === 'number') {
    options = {
      cols: arguments[0],
      rows: arguments[1],
      handler: arguments[2]
    };
  }

  options = options || {};

  each(keys(Terminal.defaults), function(key) {
    if (options[key] == null) {
      options[key] = Terminal.options[key];
      // Legacy:
      if (Terminal[key] !== Terminal.defaults[key]) {
        options[key] = Terminal[key];
      }
    }
    self[key] = options[key];
  });

  if (options.colors.length === 8) {
    options.colors = options.colors.concat(Terminal._colors.slice(8));
  } else if (options.colors.length === 16) {
    options.colors = options.colors.concat(Terminal._colors.slice(16));
  } else if (options.colors.length === 10) {
    options.colors = options.colors.slice(0, -2).concat(
      Terminal._colors.slice(8, -2), options.colors.slice(-2));
  } else if (options.colors.length === 18) {
    options.colors = options.colors.slice(0, -2).concat(
      Terminal._colors.slice(16, -2), options.colors.slice(-2));
  }
  this.colors = options.colors;

  this.options = options;

  // this.context = options.context || window;
  // this.document = options.document || document;
  this.parent = options.body || options.parent
    || (document ? document.getElementsByTagName('body')[0] : null);

  this.cols = options.cols || options.geometry[0];
  this.rows = options.rows || options.geometry[1];

  if (options.handler) {
    this.on('data', options.handler);
  }

  this.ybase = 0;
  this.ydisp = 0;
  this.x = 0;
  this.y = 0;
  this.cursorState = 0;
  this.cursorHidden = false;
  this.convertEol;
  this.state = 0;
  this.queue = '';
  this.scrollTop = 0;
  this.scrollBottom = this.rows - 1;

  // modes
  this.applicationKeypad = false;
  this.applicationCursor = false;
  this.originMode = false;
  this.insertMode = false;
  this.wraparoundMode = false;
  this.normal = null;

  // select modes
  this.prefixMode = false;
  this.selectMode = false;
  this.visualMode = false;
  this.searchMode = false;
  this.searchDown;
  this.entry = '';
  this.entryPrefix = 'Search: ';
  this._real;
  this._selected;
  this._textarea;

  // charset
  this.charset = null;
  this.gcharset = null;
  this.glevel = 0;
  this.charsets = [null];

  // mouse properties
  this.decLocator;
  this.x10Mouse;
  this.vt200Mouse;
  this.vt300Mouse;
  this.normalMouse;
  this.mouseEvents;
  this.sendFocus;
  this.utfMouse;
  this.sgrMouse;
  this.urxvtMouse;

  // misc
  this.element;
  this.children;
  this.refreshStart;
  this.refreshEnd;
  this.savedX;
  this.savedY;
  this.savedCols;

  // stream
  this.readable = true;
  this.writable = true;

  this.defAttr = (0 << 18) | (257 << 9) | (256 << 0);
  this.curAttr = this.defAttr;

  this.params = [];
  this.currentParam = 0;
  this.prefix = '';
  this.postfix = '';

  this.lines = [];
  var i = this.rows;
  while (i--) {
    this.lines.push(this.blankLine());
  }

  this.tabs;
  this.setupStops();
}

inherits(Terminal, EventEmitter);

// back_color_erase feature for xterm.
Terminal.prototype.eraseAttr = function() {
  // if (this.is('screen')) return this.defAttr;
  return (this.defAttr & ~0x1ff) | (this.curAttr & 0x1ff);
};

/**
 * Colors
 */

// Colors 0-15
Terminal.tangoColors = [
  // dark:
  '#2e3436',
  '#cc0000',
  '#4e9a06',
  '#c4a000',
  '#3465a4',
  '#75507b',
  '#06989a',
  '#d3d7cf',
  // bright:
  '#555753',
  '#ef2929',
  '#8ae234',
  '#fce94f',
  '#729fcf',
  '#ad7fa8',
  '#34e2e2',
  '#eeeeec'
];

Terminal.xtermColors = [
  // dark:
  '#000000', // black
  '#cd0000', // red3
  '#00cd00', // green3
  '#cdcd00', // yellow3
  '#0000ee', // blue2
  '#cd00cd', // magenta3
  '#00cdcd', // cyan3
  '#e5e5e5', // gray90
  // bright:
  '#7f7f7f', // gray50
  '#ff0000', // red
  '#00ff00', // green
  '#ffff00', // yellow
  '#5c5cff', // rgb:5c/5c/ff
  '#ff00ff', // magenta
  '#00ffff', // cyan
  '#ffffff'  // white
];

// Colors 0-15 + 16-255
// Much thanks to TooTallNate for writing this.
Terminal.colors = (function() {
  var colors = Terminal.tangoColors.slice()
    , r = [0x00, 0x5f, 0x87, 0xaf, 0xd7, 0xff]
    , i;

  // 16-231
  i = 0;
  for (; i < 216; i++) {
    out(r[(i / 36) % 6 | 0], r[(i / 6) % 6 | 0], r[i % 6]);
  }

  // 232-255 (grey)
  i = 0;
  for (; i < 24; i++) {
    r = 8 + i * 10;
    out(r, r, r);
  }

  function out(r, g, b) {
    colors.push('#' + hex(r) + hex(g) + hex(b));
  }

  function hex(c) {
    c = c.toString(16);
    return c.length < 2 ? '0' + c : c;
  }

  return colors;
})();

// Default BG/FG
Terminal.colors[256] = '#000000';
Terminal.colors[257] = '#f0f0f0';

Terminal._colors = Terminal.colors.slice();

Terminal.vcolors = (function() {
  var out = []
    , colors = Terminal.colors
    , i = 0
    , color;

  for (; i < 256; i++) {
    color = parseInt(colors[i].substring(1), 16);
    out.push([
      (color >> 16) & 0xff,
      (color >> 8) & 0xff,
      color & 0xff
    ]);
  }

  return out;
})();

/**
 * Options
 */

Terminal.defaults = {
  colors: Terminal.colors,
  convertEol: false,
  termName: 'xterm',
  geometry: [80, 24],
  cursorBlink: true,
  visualBell: false,
  popOnBell: false,
  scrollback: 1000,
  screenKeys: false,
  debug: false,
  useStyle: false
  // programFeatures: false,
  // focusKeys: false,
};

Terminal.options = {};

each(keys(Terminal.defaults), function(key) {
  Terminal[key] = Terminal.defaults[key];
  Terminal.options[key] = Terminal.defaults[key];
});

/**
 * Focused Terminal
 */

Terminal.focus = null;

Terminal.prototype.focus = function() {
  if (Terminal.focus === this) return;

  if (Terminal.focus) {
    Terminal.focus.blur();
  }

  if (this.sendFocus) this.send('\x1b[I');
  this.showCursor();

  // try {
  //   this.element.focus();
  // } catch (e) {
  //   ;
  // }

  // this.emit('focus');

  Terminal.focus = this;
};

Terminal.prototype.blur = function() {
  if (Terminal.focus !== this) return;

  this.cursorState = 0;
  this.refresh(this.y, this.y);
  if (this.sendFocus) this.send('\x1b[O');

  // try {
  //   this.element.blur();
  // } catch (e) {
  //   ;
  // }

  // this.emit('blur');

  Terminal.focus = null;
};

/**
 * Initialize global behavior
 */

Terminal.prototype.initGlobal = function() {
  var document = this.document;

  Terminal._boundDocs = Terminal._boundDocs || [];
  if (~indexOf(Terminal._boundDocs, document)) {
    return;
  }
  Terminal._boundDocs.push(document);

  Terminal.bindPaste(document);

  Terminal.bindKeys(document);

  Terminal.bindCopy(document);

  if (this.isMobile) {
    this.fixMobile(document);
  }

  if (this.useStyle) {
    Terminal.insertStyle(document, this.colors[256], this.colors[257]);
  }
};

/**
 * Bind to paste event
 */

Terminal.bindPaste = function(document) {
  // This seems to work well for ctrl-V and middle-click,
  // even without the contentEditable workaround.
  var window = document.defaultView;
  on(window, 'paste', function(ev) {
    var term = Terminal.focus;
    if (!term) return;
    if (ev.clipboardData) {
      term.send(ev.clipboardData.getData('text/plain'));
    } else if (term.context.clipboardData) {
      term.send(term.context.clipboardData.getData('Text'));
    }
    // Not necessary. Do it anyway for good measure.
    term.element.contentEditable = 'inherit';
    return cancel(ev);
  });
};

/**
 * Global Events for key handling
 */

Terminal.bindKeys = function(document) {
  // We should only need to check `target === body` below,
  // but we can check everything for good measure.
  on(document, 'keydown', function(ev) {
    if (!Terminal.focus) return;
    var target = ev.target || ev.srcElement;
    if (!target) return;
    if (target === Terminal.focus.element
        || target === Terminal.focus.context
        || target === Terminal.focus.document
        || target === Terminal.focus.body
        || target === Terminal._textarea
        || target === Terminal.focus.parent) {
      return Terminal.focus.keyDown(ev);
    }
  }, true);

  on(document, 'keypress', function(ev) {
    if (!Terminal.focus) return;
    var target = ev.target || ev.srcElement;
    if (!target) return;
    if (target === Terminal.focus.element
        || target === Terminal.focus.context
        || target === Terminal.focus.document
        || target === Terminal.focus.body
        || target === Terminal._textarea
        || target === Terminal.focus.parent) {
      return Terminal.focus.keyPress(ev);
    }
  }, true);

  // If we click somewhere other than a
  // terminal, unfocus the terminal.
  on(document, 'mousedown', function(ev) {
    if (!Terminal.focus) return;

    var el = ev.target || ev.srcElement;
    if (!el) return;

    do {
      if (el === Terminal.focus.element) return;
    } while (el = el.parentNode);

    Terminal.focus.blur();
  });
};

/**
 * Copy Selection w/ Ctrl-C (Select Mode)
 */

Terminal.bindCopy = function(document) {
  var window = document.defaultView;

  // if (!('onbeforecopy' in document)) {
  //   // Copies to *only* the clipboard.
  //   on(window, 'copy', function fn(ev) {
  //     var term = Terminal.focus;
  //     if (!term) return;
  //     if (!term._selected) return;
  //     var text = term.grabText(
  //       term._selected.x1, term._selected.x2,
  //       term._selected.y1, term._selected.y2);
  //     term.emit('copy', text);
  //     ev.clipboardData.setData('text/plain', text);
  //   });
  //   return;
  // }

  // Copies to primary selection *and* clipboard.
  // NOTE: This may work better on capture phase,
  // or using the `beforecopy` event.
  on(window, 'copy', function(ev) {
    var term = Terminal.focus;
    if (!term) return;
    if (!term._selected) return;
    var textarea = term.getCopyTextarea();
    var text = term.grabText(
      term._selected.x1, term._selected.x2,
      term._selected.y1, term._selected.y2);
    term.emit('copy', text);
    textarea.focus();
    textarea.textContent = text;
    textarea.value = text;
    textarea.setSelectionRange(0, text.length);
    setTimeout(function() {
      term.element.focus();
      term.focus();
    }, 1);
  });
};

/**
 * Fix Mobile
 */

Terminal.prototype.fixMobile = function(document) {
  var self = this;

  var textarea = document.createElement('textarea');
  textarea.style.position = 'absolute';
  textarea.style.left = '-32000px';
  textarea.style.top = '-32000px';
  textarea.style.width = '0px';
  textarea.style.height = '0px';
  textarea.style.opacity = '0';
  textarea.style.backgroundColor = 'transparent';
  textarea.style.borderStyle = 'none';
  textarea.style.outlineStyle = 'none';
  textarea.autocapitalize = 'none';
  textarea.autocorrect = 'off';

  document.getElementsByTagName('body')[0].appendChild(textarea);

  Terminal._textarea = textarea;

  setTimeout(function() {
    textarea.focus();
  }, 1000);

  if (this.isAndroid) {
    on(textarea, 'change', function() {
      var value = textarea.textContent || textarea.value;
      textarea.value = '';
      textarea.textContent = '';
      self.send(value + '\r');
    });
  }
};

/**
 * Insert a default style
 */

Terminal.insertStyle = function(document, bg, fg) {
  var style = document.getElementById('term-style');
  if (style) return;

  var head = document.getElementsByTagName('head')[0];
  if (!head) return;

  var style = document.createElement('style');
  style.id = 'term-style';

  // textContent doesn't work well with IE for <style> elements.
  style.innerHTML = ''
    + '.terminal {\n'
    + '  float: left;\n'
    + '  border: ' + bg + ' solid 5px;\n'
    + '  font-family: "DejaVu Sans Mono", "Liberation Mono", monospace;\n'
    + '  font-size: 11px;\n'
    + '  color: ' + fg + ';\n'
    + '  background: ' + bg + ';\n'
    + '}\n'
    + '\n'
    + '.terminal-cursor {\n'
    + '  color: ' + bg + ';\n'
    + '  background: ' + fg + ';\n'
    + '}\n';

  // var out = '';
  // each(Terminal.colors, function(color, i) {
  //   if (i === 256) {
  //     out += '\n.term-bg-color-default { background-color: ' + color + '; }';
  //   }
  //   if (i === 257) {
  //     out += '\n.term-fg-color-default { color: ' + color + '; }';
  //   }
  //   out += '\n.term-bg-color-' + i + ' { background-color: ' + color + '; }';
  //   out += '\n.term-fg-color-' + i + ' { color: ' + color + '; }';
  // });
  // style.innerHTML += out + '\n';

  head.insertBefore(style, head.firstChild);
};

/**
 * Open Terminal
 */

Terminal.prototype.open = function(parent) {
  var self = this
    , i = 0
    , div;

  this.parent = parent || this.parent;

  if (!this.parent) {
    throw new Error('Terminal requires a parent element.');
  }

  // Grab global elements.
  this.context = this.parent.ownerDocument.defaultView;
  this.document = this.parent.ownerDocument;
  this.body = this.document.getElementsByTagName('body')[0];

  // Parse user-agent strings.
  if (this.context.navigator && this.context.navigator.userAgent) {
    this.isMac = !!~this.context.navigator.userAgent.indexOf('Mac');
    this.isIpad = !!~this.context.navigator.userAgent.indexOf('iPad');
    this.isIphone = !!~this.context.navigator.userAgent.indexOf('iPhone');
    this.isAndroid = !!~this.context.navigator.userAgent.indexOf('Android');
    this.isMobile = this.isIpad || this.isIphone || this.isAndroid;
    this.isMSIE = !!~this.context.navigator.userAgent.indexOf('MSIE');
  }

  // Create our main terminal element.
  this.element = this.document.createElement('div');
  this.element.className = 'terminal';
  this.element.style.outline = 'none';
  this.element.setAttribute('tabindex', 0);
  this.element.setAttribute('spellcheck', 'false');
  this.element.style.backgroundColor = this.colors[256];
  this.element.style.color = this.colors[257];

  // Create the lines for our terminal.
  this.children = [];
  for (; i < this.rows; i++) {
    div = this.document.createElement('div');
    this.element.appendChild(div);
    this.children.push(div);
  }
  this.parent.appendChild(this.element);

  // Draw the screen.
  this.refresh(0, this.rows - 1);

  if (this.options.noEvents) {
    // Initialize global actions that
    // need to be taken on the document.
    this.initGlobal();
  }

  if (!this.options.noFocus) {
    // Ensure there is a Terminal.focus.
    this.focus();

    // Start blinking the cursor.
    this.startBlink();

    // Bind to DOM events related
    // to focus and paste behavior.
    on(this.element, 'focus', function() {
      self.focus();
      if (self.isMobile) {
        Terminal._textarea.focus();
      }
    });

    // This causes slightly funky behavior.
    // on(this.element, 'blur', function() {
    //   self.blur();
    // });

    on(this.element, 'mousedown', function() {
      self.focus();
    });

    // Clickable paste workaround, using contentEditable.
    // This probably shouldn't work,
    // ... but it does. Firefox's paste
    // event seems to only work for textareas?
    on(this.element, 'mousedown', function(ev) {
      var button = ev.button != null
        ? +ev.button
        : ev.which != null
          ? ev.which - 1
          : null;

      // Does IE9 do this?
      if (self.isMSIE) {
        button = button === 1 ? 0 : button === 4 ? 1 : button;
      }

      if (button !== 2) return;

      self.element.contentEditable = 'true';
      setTimeout(function() {
        self.element.contentEditable = 'inherit'; // 'false';
      }, 1);
    }, true);
  }

  if (this.options.noMouse) {
    // Listen for mouse events and translate
    // them into terminal mouse protocols.
    this.bindMouse();
  }

  // this.emit('open');

  if (!this.options.noFocus) {
      // This can be useful for pasting,
      // as well as the iPad fix.
      setTimeout(function() {
        self.element.focus();
      }, 100);
  }

  // Figure out whether boldness affects
  // the character width of monospace fonts.
  if (Terminal.brokenBold == null) {
    Terminal.brokenBold = isBoldBroken(this.document);
  }
};

// XTerm mouse events
// http://invisible-island.net/xterm/ctlseqs/ctlseqs.html#Mouse%20Tracking
// To better understand these
// the xterm code is very helpful:
// Relevant files:
//   button.c, charproc.c, misc.c
// Relevant functions in xterm/button.c:
//   BtnCode, EmitButtonCode, EditorButton, SendMousePosition
Terminal.prototype.bindMouse = function() {
  var el = this.element
    , self = this
    , pressed = 32;

  var wheelEvent = 'onmousewheel' in this.context
    ? 'mousewheel'
    : 'DOMMouseScroll';

  // mouseup, mousedown, mousewheel
  // left click: ^[[M 3<^[[M#3<
  // mousewheel up: ^[[M`3>
  function sendButton(ev) {
    var button
      , pos;

    // get the xterm-style button
    button = getButton(ev);

    // get mouse coordinates
    pos = getCoords(ev);
    if (!pos) return;

    sendEvent(button, pos);

    switch (ev.type) {
      case 'mousedown':
        pressed = button;
        break;
      case 'mouseup':
        // keep it at the left
        // button, just in case.
        pressed = 32;
        break;
      case wheelEvent:
        // nothing. don't
        // interfere with
        // `pressed`.
        break;
    }
  }

  // motion example of a left click:
  // ^[[M 3<^[[M@4<^[[M@5<^[[M@6<^[[M@7<^[[M#7<
  function sendMove(ev) {
    var button = pressed
      , pos;

    pos = getCoords(ev);
    if (!pos) return;

    // buttons marked as motions
    // are incremented by 32
    button += 32;

    sendEvent(button, pos);
  }

  // encode button and
  // position to characters
  function encode(data, ch) {
    if (!self.utfMouse) {
      if (ch === 255) return data.push(0);
      if (ch > 127) ch = 127;
      data.push(ch);
    } else {
      if (ch === 2047) return data.push(0);
      if (ch < 127) {
        data.push(ch);
      } else {
        if (ch > 2047) ch = 2047;
        data.push(0xC0 | (ch >> 6));
        data.push(0x80 | (ch & 0x3F));
      }
    }
  }

  // send a mouse event:
  // regular/utf8: ^[[M Cb Cx Cy
  // urxvt: ^[[ Cb ; Cx ; Cy M
  // sgr: ^[[ Cb ; Cx ; Cy M/m
  // vt300: ^[[ 24(1/3/5)~ [ Cx , Cy ] \r
  // locator: CSI P e ; P b ; P r ; P c ; P p & w
  function sendEvent(button, pos) {
    // self.emit('mouse', {
    //   x: pos.x - 32,
    //   y: pos.x - 32,
    //   button: button
    // });

    if (self.vt300Mouse) {
      // NOTE: Unstable.
      // http://www.vt100.net/docs/vt3xx-gp/chapter15.html
      button &= 3;
      pos.x -= 32;
      pos.y -= 32;
      var data = '\x1b[24';
      if (button === 0) data += '1';
      else if (button === 1) data += '3';
      else if (button === 2) data += '5';
      else if (button === 3) return;
      else data += '0';
      data += '~[' + pos.x + ',' + pos.y + ']\r';
      self.send(data);
      return;
    }

    if (self.decLocator) {
      // NOTE: Unstable.
      button &= 3;
      pos.x -= 32;
      pos.y -= 32;
      if (button === 0) button = 2;
      else if (button === 1) button = 4;
      else if (button === 2) button = 6;
      else if (button === 3) button = 3;
      self.send('\x1b['
        + button
        + ';'
        + (button === 3 ? 4 : 0)
        + ';'
        + pos.y
        + ';'
        + pos.x
        + ';'
        + (pos.page || 0)
        + '&w');
      return;
    }

    if (self.urxvtMouse) {
      pos.x -= 32;
      pos.y -= 32;
      pos.x++;
      pos.y++;
      self.send('\x1b[' + button + ';' + pos.x + ';' + pos.y + 'M');
      return;
    }

    if (self.sgrMouse) {
      pos.x -= 32;
      pos.y -= 32;
      self.send('\x1b[<'
        + ((button & 3) === 3 ? button & ~3 : button)
        + ';'
        + pos.x
        + ';'
        + pos.y
        + ((button & 3) === 3 ? 'm' : 'M'));
      return;
    }

    var data = [];

    encode(data, button);
    encode(data, pos.x);
    encode(data, pos.y);

    self.send('\x1b[M' + String.fromCharCode.apply(String, data));
  }

  function getButton(ev) {
    var button
      , shift
      , meta
      , ctrl
      , mod;

    // two low bits:
    // 0 = left
    // 1 = middle
    // 2 = right
    // 3 = release
    // wheel up/down:
    // 1, and 2 - with 64 added
    switch (ev.type) {
      case 'mousedown':
        button = ev.button != null
          ? +ev.button
          : ev.which != null
            ? ev.which - 1
            : null;

        if (self.isMSIE) {
          button = button === 1 ? 0 : button === 4 ? 1 : button;
        }
        break;
      case 'mouseup':
        button = 3;
        break;
      case 'DOMMouseScroll':
        button = ev.detail < 0
          ? 64
          : 65;
        break;
      case 'mousewheel':
        button = ev.wheelDeltaY > 0
          ? 64
          : 65;
        break;
    }

    // next three bits are the modifiers:
    // 4 = shift, 8 = meta, 16 = control
    shift = ev.shiftKey ? 4 : 0;
    meta = ev.metaKey ? 8 : 0;
    ctrl = ev.ctrlKey ? 16 : 0;
    mod = shift | meta | ctrl;

    // no mods
    if (self.vt200Mouse) {
      // ctrl only
      mod &= ctrl;
    } else if (!self.normalMouse) {
      mod = 0;
    }

    // increment to SP
    button = (32 + (mod << 2)) + button;

    return button;
  }

  // mouse coordinates measured in cols/rows
  function getCoords(ev) {
    var x, y, w, h, el;

    // ignore browsers without pageX for now
    if (ev.pageX == null) return;

    x = ev.pageX;
    y = ev.pageY;
    el = self.element;

    // should probably check offsetParent
    // but this is more portable
    while (el && el !== self.document.documentElement) {
      x -= el.offsetLeft;
      y -= el.offsetTop;
      el = 'offsetParent' in el
        ? el.offsetParent
        : el.parentNode;
    }

    // convert to cols/rows
    w = self.element.clientWidth;
    h = self.element.clientHeight;
    x = Math.round((x / w) * self.cols);
    y = Math.round((y / h) * self.rows);

    // be sure to avoid sending
    // bad positions to the program
    if (x < 0) x = 0;
    if (x > self.cols) x = self.cols;
    if (y < 0) y = 0;
    if (y > self.rows) y = self.rows;

    // xterm sends raw bytes and
    // starts at 32 (SP) for each.
    x += 32;
    y += 32;

    return {
      x: x,
      y: y,
      type: ev.type === wheelEvent
        ? 'mousewheel'
        : ev.type
    };
  }

  on(el, 'mousedown', function(ev) {
    if (!self.mouseEvents) return;

    // send the button
    sendButton(ev);

    // ensure focus
    self.focus();

    // fix for odd bug
    //if (self.vt200Mouse && !self.normalMouse) {
    if (self.vt200Mouse) {
      sendButton({ __proto__: ev, type: 'mouseup' });
      return cancel(ev);
    }

    // bind events
    if (self.normalMouse) on(self.document, 'mousemove', sendMove);

    // x10 compatibility mode can't send button releases
    if (!self.x10Mouse) {
      on(self.document, 'mouseup', function up(ev) {
        sendButton(ev);
        if (self.normalMouse) off(self.document, 'mousemove', sendMove);
        off(self.document, 'mouseup', up);
        return cancel(ev);
      });
    }

    return cancel(ev);
  });

  //if (self.normalMouse) {
  //  on(self.document, 'mousemove', sendMove);
  //}

  on(el, wheelEvent, function(ev) {
    if (!self.mouseEvents) return;
    if (self.x10Mouse
        || self.vt300Mouse
        || self.decLocator) return;
    sendButton(ev);
    return cancel(ev);
  });

  // allow mousewheel scrolling in
  // the shell for example
  on(el, wheelEvent, function(ev) {
    if (self.mouseEvents) return;
    if (self.applicationKeypad) return;
    if (ev.type === 'DOMMouseScroll') {
      self.scrollDisp(ev.detail < 0 ? -5 : 5);
    } else {
      self.scrollDisp(ev.wheelDeltaY > 0 ? -5 : 5);
    }
    return cancel(ev);
  });
};

/**
 * Destroy Terminal
 */

Terminal.prototype.destroy = function() {
  this.readable = false;
  this.writable = false;
  this._events = {};
  this.handler = function() {};
  this.write = function() {};
  if (this.element.parentNode) {
    this.element.parentNode.removeChild(this.element);
  }
  //this.emit('close');
};

/**
 * Rendering Engine
 */

// In the screen buffer, each character
// is stored as a an array with a character
// and a 32-bit integer.
// First value: a utf-16 character.
// Second value:
// Next 9 bits: background color (0-511).
// Next 9 bits: foreground color (0-511).
// Next 14 bits: a mask for misc. flags:
//   1=bold, 2=underline, 4=blink, 8=inverse, 16=invisible

Terminal.prototype.refresh = function(start, end) {
  var x
    , y
    , i
    , line
    , out
    , ch
    , width
    , data
    , attr
    , bg
    , fg
    , flags
    , row
    , parent;

  if (end - start >= this.rows / 2) {
    parent = this.element.parentNode;
    if (parent) parent.removeChild(this.element);
  }

  width = this.cols;
  y = start;

  if (end >= this.lines.length) {
    this.log('`end` is too large. Most likely a bad CSR.');
    end = this.lines.length - 1;
  }

  for (; y <= end; y++) {
    row = y + this.ydisp;

    line = this.lines[row];
    out = '';

    if (y === this.y
        && this.cursorState
        && (this.ydisp === this.ybase || this.selectMode)
        && !this.cursorHidden) {
      x = this.x;
    } else {
      x = -1;
    }

    attr = this.defAttr;
    i = 0;

    for (; i < width; i++) {
      data = line[i][0];
      ch = line[i][1];

      if (i === x) data = -1;

      if (data !== attr) {
        if (attr !== this.defAttr) {
          out += '</span>';
        }
        if (data !== this.defAttr) {
          if (data === -1) {
            out += '<span class="reverse-video terminal-cursor">';
          } else {
            out += '<span style="';

            bg = data & 0x1ff;
            fg = (data >> 9) & 0x1ff;
            flags = data >> 18;

            // bold
            if (flags & 1) {
              if (!Terminal.brokenBold) {
                out += 'font-weight:bold;';
              }
              // See: XTerm*boldColors
              if (fg < 8) fg += 8;
            }

            // underline
            if (flags & 2) {
              out += 'text-decoration:underline;';
            }

            // blink
            if (flags & 4) {
              if (flags & 2) {
                out = out.slice(0, -1);
                out += ' blink;';
              } else {
                out += 'text-decoration:blink;';
              }
            }

            // inverse
            if (flags & 8) {
              bg = (data >> 9) & 0x1ff;
              fg = data & 0x1ff;
              // Should inverse just be before the
              // above boldColors effect instead?
              if ((flags & 1) && fg < 8) fg += 8;
            }

            // invisible
            if (flags & 16) {
              out += 'visibility:hidden;';
            }

            // out += '" class="'
            //   + 'term-bg-color-' + bg
            //   + ' '
            //   + 'term-fg-color-' + fg
            //   + '">';

            if (bg !== 256) {
              out += 'background-color:'
                + this.colors[bg]
                + ';';
            }

            if (fg !== 257) {
              out += 'color:'
                + this.colors[fg]
                + ';';
            }

            out += '">';
          }
        }
      }

      switch (ch) {
        case '&':
          out += '&amp;';
          break;
        case '<':
          out += '&lt;';
          break;
        case '>':
          out += '&gt;';
          break;
        default:
          if (ch <= ' ') {
            out += '&nbsp;';
          } else {
            if (isWide(ch)) i++;
            out += ch;
          }
          break;
      }

      attr = data;
    }

    if (attr !== this.defAttr) {
      out += '</span>';
    }

    this.children[y].innerHTML = out;
  }

  if (parent) parent.appendChild(this.element);
};

Terminal.prototype._cursorBlink = function() {
  if (Terminal.focus !== this) return;
  this.cursorState ^= 1;
  this.refresh(this.y, this.y);
};

Terminal.prototype.showCursor = function() {
  if (!this.cursorState) {
    this.cursorState = 1;
    this.refresh(this.y, this.y);
  } else {
    // Temporarily disabled:
    // this.refreshBlink();
  }
};

Terminal.prototype.startBlink = function() {
  if (!this.cursorBlink) return;
  var self = this;
  this._blinker = function() {
    self._cursorBlink();
  };
  this._blink = setInterval(this._blinker, 500);
};

Terminal.prototype.refreshBlink = function() {
  if (!this.cursorBlink) return;
  clearInterval(this._blink);
  this._blink = setInterval(this._blinker, 500);
};

Terminal.prototype.scroll = function() {
  var row;

  if (++this.ybase === this.scrollback) {
    this.ybase = this.ybase / 2 | 0;
    this.lines = this.lines.slice(-(this.ybase + this.rows) + 1);
  }

  this.ydisp = this.ybase;

  // last line
  row = this.ybase + this.rows - 1;

  // subtract the bottom scroll region
  row -= this.rows - 1 - this.scrollBottom;

  if (row === this.lines.length) {
    // potential optimization:
    // pushing is faster than splicing
    // when they amount to the same
    // behavior.
    this.lines.push(this.blankLine());
  } else {
    // add our new line
    this.lines.splice(row, 0, this.blankLine());
  }

  if (this.scrollTop !== 0) {
    if (this.ybase !== 0) {
      this.ybase--;
      this.ydisp = this.ybase;
    }
    this.lines.splice(this.ybase + this.scrollTop, 1);
  }

  // this.maxRange();
  this.updateRange(this.scrollTop);
  this.updateRange(this.scrollBottom);
};

Terminal.prototype.scrollDisp = function(disp) {
  this.ydisp += disp;

  if (this.ydisp > this.ybase) {
    this.ydisp = this.ybase;
  } else if (this.ydisp < 0) {
    this.ydisp = 0;
  }

  this.refresh(0, this.rows - 1);
};

Terminal.prototype.write = function(data) {
  var l = data.length
    , i = 0
    , j
    , cs
    , ch;

  this.refreshStart = this.y;
  this.refreshEnd = this.y;

  if (this.ybase !== this.ydisp) {
    this.ydisp = this.ybase;
    this.maxRange();
  }

  // this.log(JSON.stringify(data.replace(/\x1b/g, '^[')));

  for (; i < l; i++) {
    ch = data[i];
    switch (this.state) {
      case normal:
        switch (ch) {
          // '\0'
          // case '\0':
          // case '\200':
          //   break;

          // '\a'
          case '\x07':
            this.bell();
            break;

          // '\n', '\v', '\f'
          case '\n':
          case '\x0b':
          case '\x0c':
            if (this.convertEol) {
              this.x = 0;
            }
            // TODO: Implement eat_newline_glitch.
            // if (this.realX >= this.cols) break;
            // this.realX = 0;
            this.y++;
            if (this.y > this.scrollBottom) {
              this.y--;
              this.scroll();
            }
            break;

          // '\r'
          case '\r':
            this.x = 0;
            break;

          // '\b'
          case '\x08':
            if (this.x > 0) {
              this.x--;
            }
            break;

          // '\t'
          case '\t':
            this.x = this.nextStop();
            break;

          // shift out
          case '\x0e':
            this.setgLevel(1);
            break;

          // shift in
          case '\x0f':
            this.setgLevel(0);
            break;

          // '\e'
          case '\x1b':
            this.state = escaped;
            break;

          default:
            // ' '
            if (ch >= ' ') {
              if (this.charset && this.charset[ch]) {
                ch = this.charset[ch];
              }

              if (this.x >= this.cols) {
                this.x = 0;
                this.y++;
                if (this.y > this.scrollBottom) {
                  this.y--;
                  this.scroll();
                }
              }

              this.lines[this.y + this.ybase][this.x] = [this.curAttr, ch];
              this.x++;
              this.updateRange(this.y);

              if (isWide(ch)) {
                j = this.y + this.ybase;
                if (this.cols < 2 || this.x >= this.cols) {
                  this.lines[j][this.x - 1] = [this.curAttr, ' '];
                  break;
                }
                this.lines[j][this.x] = [this.curAttr, ' '];
                this.x++;
              }
            }
            break;
        }
        break;
      case escaped:
        switch (ch) {
          // ESC [ Control Sequence Introducer ( CSI is 0x9b).
          case '[':
            this.params = [];
            this.currentParam = 0;
            this.state = csi;
            break;

          // ESC ] Operating System Command ( OSC is 0x9d).
          case ']':
            this.params = [];
            this.currentParam = 0;
            this.state = osc;
            break;

          // ESC P Device Control String ( DCS is 0x90).
          case 'P':
            this.params = [];
            this.currentParam = 0;
            this.state = dcs;
            break;

          // ESC _ Application Program Command ( APC is 0x9f).
          case '_':
            this.state = ignore;
            break;

          // ESC ^ Privacy Message ( PM is 0x9e).
          case '^':
            this.state = ignore;
            break;

          // ESC c Full Reset (RIS).
          case 'c':
            this.reset();
            break;

          // ESC E Next Line ( NEL is 0x85).
          // ESC D Index ( IND is 0x84).
          case 'E':
            this.x = 0;
            ;
          case 'D':
            this.index();
            break;

          // ESC M Reverse Index ( RI is 0x8d).
          case 'M':
            this.reverseIndex();
            break;

          // ESC % Select default/utf-8 character set.
          // @ = default, G = utf-8
          case '%':
            //this.charset = null;
            this.setgLevel(0);
            this.setgCharset(0, Terminal.charsets.US);
            this.state = normal;
            i++;
            break;

          // ESC (,),*,+,-,. Designate G0-G2 Character Set.
          case '(': // <-- this seems to get all the attention
          case ')':
          case '*':
          case '+':
          case '-':
          case '.':
            switch (ch) {
              case '(':
                this.gcharset = 0;
                break;
              case ')':
                this.gcharset = 1;
                break;
              case '*':
                this.gcharset = 2;
                break;
              case '+':
                this.gcharset = 3;
                break;
              case '-':
                this.gcharset = 1;
                break;
              case '.':
                this.gcharset = 2;
                break;
            }
            this.state = charset;
            break;

          // Designate G3 Character Set (VT300).
          // A = ISO Latin-1 Supplemental.
          // Not implemented.
          case '/':
            this.gcharset = 3;
            this.state = charset;
            i--;
            break;

          // ESC N
          // Single Shift Select of G2 Character Set
          // ( SS2 is 0x8e). This affects next character only.
          case 'N':
            break;
          // ESC O
          // Single Shift Select of G3 Character Set
          // ( SS3 is 0x8f). This affects next character only.
          case 'O':
            break;
          // ESC n
          // Invoke the G2 Character Set as GL (LS2).
          case 'n':
            this.setgLevel(2);
            break;
          // ESC o
          // Invoke the G3 Character Set as GL (LS3).
          case 'o':
            this.setgLevel(3);
            break;
          // ESC |
          // Invoke the G3 Character Set as GR (LS3R).
          case '|':
            this.setgLevel(3);
            break;
          // ESC }
          // Invoke the G2 Character Set as GR (LS2R).
          case '}':
            this.setgLevel(2);
            break;
          // ESC ~
          // Invoke the G1 Character Set as GR (LS1R).
          case '~':
            this.setgLevel(1);
            break;

          // ESC 7 Save Cursor (DECSC).
          case '7':
            this.saveCursor();
            this.state = normal;
            break;

          // ESC 8 Restore Cursor (DECRC).
          case '8':
            this.restoreCursor();
            this.state = normal;
            break;

          // ESC # 3 DEC line height/width
          case '#':
            this.state = normal;
            i++;
            break;

          // ESC H Tab Set (HTS is 0x88).
          case 'H':
            this.tabSet();
            break;

          // ESC = Application Keypad (DECPAM).
          case '=':
            this.log('Serial port requested application keypad.');
            this.applicationKeypad = true;
            this.state = normal;
            break;

          // ESC > Normal Keypad (DECPNM).
          case '>':
            this.log('Switching back to normal keypad.');
            this.applicationKeypad = false;
            this.state = normal;
            break;

          default:
            this.state = normal;
            this.error('Unknown ESC control: %s.', ch);
            break;
        }
        break;

      case charset:
        switch (ch) {
          case '0': // DEC Special Character and Line Drawing Set.
            cs = Terminal.charsets.SCLD;
            break;
          case 'A': // UK
            cs = Terminal.charsets.UK;
            break;
          case 'B': // United States (USASCII).
            cs = Terminal.charsets.US;
            break;
          case '4': // Dutch
            cs = Terminal.charsets.Dutch;
            break;
          case 'C': // Finnish
          case '5':
            cs = Terminal.charsets.Finnish;
            break;
          case 'R': // French
            cs = Terminal.charsets.French;
            break;
          case 'Q': // FrenchCanadian
            cs = Terminal.charsets.FrenchCanadian;
            break;
          case 'K': // German
            cs = Terminal.charsets.German;
            break;
          case 'Y': // Italian
            cs = Terminal.charsets.Italian;
            break;
          case 'E': // NorwegianDanish
          case '6':
            cs = Terminal.charsets.NorwegianDanish;
            break;
          case 'Z': // Spanish
            cs = Terminal.charsets.Spanish;
            break;
          case 'H': // Swedish
          case '7':
            cs = Terminal.charsets.Swedish;
            break;
          case '=': // Swiss
            cs = Terminal.charsets.Swiss;
            break;
          case '/': // ISOLatin (actually /A)
            cs = Terminal.charsets.ISOLatin;
            i++;
            break;
          default: // Default
            cs = Terminal.charsets.US;
            break;
        }
        this.setgCharset(this.gcharset, cs);
        this.gcharset = null;
        this.state = normal;
        break;

      case osc:
        // OSC Ps ; Pt ST
        // OSC Ps ; Pt BEL
        //   Set Text Parameters.
        if (ch === '\x1b' || ch === '\x07') {
          if (ch === '\x1b') i++;

          this.params.push(this.currentParam);

          switch (this.params[0]) {
            case 0:
            case 1:
            case 2:
              if (this.params[1]) {
                this.title = this.params[1];
                this.handleTitle(this.title);
              }
              break;
            case 3:
              // set X property
              break;
            case 4:
            case 5:
              // change dynamic colors
              break;
            case 10:
            case 11:
            case 12:
            case 13:
            case 14:
            case 15:
            case 16:
            case 17:
            case 18:
            case 19:
              // change dynamic ui colors
              break;
            case 46:
              // change log file
              break;
            case 50:
              // dynamic font
              break;
            case 51:
              // emacs shell
              break;
            case 52:
              // manipulate selection data
              break;
            case 104:
            case 105:
            case 110:
            case 111:
            case 112:
            case 113:
            case 114:
            case 115:
            case 116:
            case 117:
            case 118:
              // reset colors
              break;
          }

          this.params = [];
          this.currentParam = 0;
          this.state = normal;
        } else {
          if (!this.params.length) {
            if (ch >= '0' && ch <= '9') {
              this.currentParam =
                this.currentParam * 10 + ch.charCodeAt(0) - 48;
            } else if (ch === ';') {
              this.params.push(this.currentParam);
              this.currentParam = '';
            }
          } else {
            this.currentParam += ch;
          }
        }
        break;

      case csi:
        // '?', '>', '!'
        if (ch === '?' || ch === '>' || ch === '!') {
          this.prefix = ch;
          break;
        }

        // 0 - 9
        if (ch >= '0' && ch <= '9') {
          this.currentParam = this.currentParam * 10 + ch.charCodeAt(0) - 48;
          break;
        }

        // '$', '"', ' ', '\''
        if (ch === '$' || ch === '"' || ch === ' ' || ch === '\'') {
          this.postfix = ch;
          break;
        }

        this.params.push(this.currentParam);
        this.currentParam = 0;

        // ';'
        if (ch === ';') break;

        this.state = normal;

        switch (ch) {
          // CSI Ps A
          // Cursor Up Ps Times (default = 1) (CUU).
          case 'A':
            this.cursorUp(this.params);
            break;

          // CSI Ps B
          // Cursor Down Ps Times (default = 1) (CUD).
          case 'B':
            this.cursorDown(this.params);
            break;

          // CSI Ps C
          // Cursor Forward Ps Times (default = 1) (CUF).
          case 'C':
            this.cursorForward(this.params);
            break;

          // CSI Ps D
          // Cursor Backward Ps Times (default = 1) (CUB).
          case 'D':
            this.cursorBackward(this.params);
            break;

          // CSI Ps ; Ps H
          // Cursor Position [row;column] (default = [1,1]) (CUP).
          case 'H':
            this.cursorPos(this.params);
            break;

          // CSI Ps J  Erase in Display (ED).
          case 'J':
            this.eraseInDisplay(this.params);
            break;

          // CSI Ps K  Erase in Line (EL).
          case 'K':
            this.eraseInLine(this.params);
            break;

          // CSI Pm m  Character Attributes (SGR).
          case 'm':
            if (!this.prefix) {
              this.charAttributes(this.params);
            }
            break;

          // CSI Ps n  Device Status Report (DSR).
          case 'n':
            if (!this.prefix) {
              this.deviceStatus(this.params);
            }
            break;

          /**
           * Additions
           */

          // CSI Ps @
          // Insert Ps (Blank) Character(s) (default = 1) (ICH).
          case '@':
            this.insertChars(this.params);
            break;

          // CSI Ps E
          // Cursor Next Line Ps Times (default = 1) (CNL).
          case 'E':
            this.cursorNextLine(this.params);
            break;

          // CSI Ps F
          // Cursor Preceding Line Ps Times (default = 1) (CNL).
          case 'F':
            this.cursorPrecedingLine(this.params);
            break;

          // CSI Ps G
          // Cursor Character Absolute  [column] (default = [row,1]) (CHA).
          case 'G':
            this.cursorCharAbsolute(this.params);
            break;

          // CSI Ps L
          // Insert Ps Line(s) (default = 1) (IL).
          case 'L':
            this.insertLines(this.params);
            break;

          // CSI Ps M
          // Delete Ps Line(s) (default = 1) (DL).
          case 'M':
            this.deleteLines(this.params);
            break;

          // CSI Ps P
          // Delete Ps Character(s) (default = 1) (DCH).
          case 'P':
            this.deleteChars(this.params);
            break;

          // CSI Ps X
          // Erase Ps Character(s) (default = 1) (ECH).
          case 'X':
            this.eraseChars(this.params);
            break;

          // CSI Pm `  Character Position Absolute
          //   [column] (default = [row,1]) (HPA).
          case '`':
            this.charPosAbsolute(this.params);
            break;

          // 141 61 a * HPR -
          // Horizontal Position Relative
          case 'a':
            this.HPositionRelative(this.params);
            break;

          // CSI P s c
          // Send Device Attributes (Primary DA).
          // CSI > P s c
          // Send Device Attributes (Secondary DA)
          case 'c':
            this.sendDeviceAttributes(this.params);
            break;

          // CSI Pm d
          // Line Position Absolute  [row] (default = [1,column]) (VPA).
          case 'd':
            this.linePosAbsolute(this.params);
            break;

          // 145 65 e * VPR - Vertical Position Relative
          case 'e':
            this.VPositionRelative(this.params);
            break;

          // CSI Ps ; Ps f
          //   Horizontal and Vertical Position [row;column] (default =
          //   [1,1]) (HVP).
          case 'f':
            this.HVPosition(this.params);
            break;

          // CSI Pm h  Set Mode (SM).
          // CSI ? Pm h - mouse escape codes, cursor escape codes
          case 'h':
            this.setMode(this.params);
            break;

          // CSI Pm l  Reset Mode (RM).
          // CSI ? Pm l
          case 'l':
            this.resetMode(this.params);
            break;

          // CSI Ps ; Ps r
          //   Set Scrolling Region [top;bottom] (default = full size of win-
          //   dow) (DECSTBM).
          // CSI ? Pm r
          case 'r':
            this.setScrollRegion(this.params);
            break;

          // CSI s
          //   Save cursor (ANSI.SYS).
          case 's':
            this.saveCursor(this.params);
            break;

          // CSI u
          //   Restore cursor (ANSI.SYS).
          case 'u':
            this.restoreCursor(this.params);
            break;

          /**
           * Lesser Used
           */

          // CSI Ps I
          // Cursor Forward Tabulation Ps tab stops (default = 1) (CHT).
          case 'I':
            this.cursorForwardTab(this.params);
            break;

          // CSI Ps S  Scroll up Ps lines (default = 1) (SU).
          case 'S':
            this.scrollUp(this.params);
            break;

          // CSI Ps T  Scroll down Ps lines (default = 1) (SD).
          // CSI Ps ; Ps ; Ps ; Ps ; Ps T
          // CSI > Ps; Ps T
          case 'T':
            // if (this.prefix === '>') {
            //   this.resetTitleModes(this.params);
            //   break;
            // }
            // if (this.params.length > 2) {
            //   this.initMouseTracking(this.params);
            //   break;
            // }
            if (this.params.length < 2 && !this.prefix) {
              this.scrollDown(this.params);
            }
            break;

          // CSI Ps Z
          // Cursor Backward Tabulation Ps tab stops (default = 1) (CBT).
          case 'Z':
            this.cursorBackwardTab(this.params);
            break;

          // CSI Ps b  Repeat the preceding graphic character Ps times (REP).
          case 'b':
            this.repeatPrecedingCharacter(this.params);
            break;

          // CSI Ps g  Tab Clear (TBC).
          case 'g':
            this.tabClear(this.params);
            break;

          // CSI Pm i  Media Copy (MC).
          // CSI ? Pm i
          // case 'i':
          //   this.mediaCopy(this.params);
          //   break;

          // CSI Pm m  Character Attributes (SGR).
          // CSI > Ps; Ps m
          // case 'm': // duplicate
          //   if (this.prefix === '>') {
          //     this.setResources(this.params);
          //   } else {
          //     this.charAttributes(this.params);
          //   }
          //   break;

          // CSI Ps n  Device Status Report (DSR).
          // CSI > Ps n
          // case 'n': // duplicate
          //   if (this.prefix === '>') {
          //     this.disableModifiers(this.params);
          //   } else {
          //     this.deviceStatus(this.params);
          //   }
          //   break;

          // CSI > Ps p  Set pointer mode.
          // CSI ! p   Soft terminal reset (DECSTR).
          // CSI Ps$ p
          //   Request ANSI mode (DECRQM).
          // CSI ? Ps$ p
          //   Request DEC private mode (DECRQM).
          // CSI Ps ; Ps " p
          case 'p':
            switch (this.prefix) {
              // case '>':
              //   this.setPointerMode(this.params);
              //   break;
              case '!':
                this.softReset(this.params);
                break;
              // case '?':
              //   if (this.postfix === '$') {
              //     this.requestPrivateMode(this.params);
              //   }
              //   break;
              // default:
              //   if (this.postfix === '"') {
              //     this.setConformanceLevel(this.params);
              //   } else if (this.postfix === '$') {
              //     this.requestAnsiMode(this.params);
              //   }
              //   break;
            }
            break;

          // CSI Ps q  Load LEDs (DECLL).
          // CSI Ps SP q
          // CSI Ps " q
          // case 'q':
          //   if (this.postfix === ' ') {
          //     this.setCursorStyle(this.params);
          //     break;
          //   }
          //   if (this.postfix === '"') {
          //     this.setCharProtectionAttr(this.params);
          //     break;
          //   }
          //   this.loadLEDs(this.params);
          //   break;

          // CSI Ps ; Ps r
          //   Set Scrolling Region [top;bottom] (default = full size of win-
          //   dow) (DECSTBM).
          // CSI ? Pm r
          // CSI Pt; Pl; Pb; Pr; Ps$ r
          // case 'r': // duplicate
          //   if (this.prefix === '?') {
          //     this.restorePrivateValues(this.params);
          //   } else if (this.postfix === '$') {
          //     this.setAttrInRectangle(this.params);
          //   } else {
          //     this.setScrollRegion(this.params);
          //   }
          //   break;

          // CSI s     Save cursor (ANSI.SYS).
          // CSI ? Pm s
          // case 's': // duplicate
          //   if (this.prefix === '?') {
          //     this.savePrivateValues(this.params);
          //   } else {
          //     this.saveCursor(this.params);
          //   }
          //   break;

          // CSI Ps ; Ps ; Ps t
          // CSI Pt; Pl; Pb; Pr; Ps$ t
          // CSI > Ps; Ps t
          // CSI Ps SP t
          // case 't':
          //   if (this.postfix === '$') {
          //     this.reverseAttrInRectangle(this.params);
          //   } else if (this.postfix === ' ') {
          //     this.setWarningBellVolume(this.params);
          //   } else {
          //     if (this.prefix === '>') {
          //       this.setTitleModeFeature(this.params);
          //     } else {
          //       this.manipulateWindow(this.params);
          //     }
          //   }
          //   break;

          // CSI u     Restore cursor (ANSI.SYS).
          // CSI Ps SP u
          // case 'u': // duplicate
          //   if (this.postfix === ' ') {
          //     this.setMarginBellVolume(this.params);
          //   } else {
          //     this.restoreCursor(this.params);
          //   }
          //   break;

          // CSI Pt; Pl; Pb; Pr; Pp; Pt; Pl; Pp$ v
          // case 'v':
          //   if (this.postfix === '$') {
          //     this.copyRectagle(this.params);
          //   }
          //   break;

          // CSI Pt ; Pl ; Pb ; Pr ' w
          // case 'w':
          //   if (this.postfix === '\'') {
          //     this.enableFilterRectangle(this.params);
          //   }
          //   break;

          // CSI Ps x  Request Terminal Parameters (DECREQTPARM).
          // CSI Ps x  Select Attribute Change Extent (DECSACE).
          // CSI Pc; Pt; Pl; Pb; Pr$ x
          // case 'x':
          //   if (this.postfix === '$') {
          //     this.fillRectangle(this.params);
          //   } else {
          //     this.requestParameters(this.params);
          //     //this.__(this.params);
          //   }
          //   break;

          // CSI Ps ; Pu ' z
          // CSI Pt; Pl; Pb; Pr$ z
          // case 'z':
          //   if (this.postfix === '\'') {
          //     this.enableLocatorReporting(this.params);
          //   } else if (this.postfix === '$') {
          //     this.eraseRectangle(this.params);
          //   }
          //   break;

          // CSI Pm ' {
          // CSI Pt; Pl; Pb; Pr$ {
          // case '{':
          //   if (this.postfix === '\'') {
          //     this.setLocatorEvents(this.params);
          //   } else if (this.postfix === '$') {
          //     this.selectiveEraseRectangle(this.params);
          //   }
          //   break;

          // CSI Ps ' |
          // case '|':
          //   if (this.postfix === '\'') {
          //     this.requestLocatorPosition(this.params);
          //   }
          //   break;

          // CSI P m SP }
          // Insert P s Column(s) (default = 1) (DECIC), VT420 and up.
          // case '}':
          //   if (this.postfix === ' ') {
          //     this.insertColumns(this.params);
          //   }
          //   break;

          // CSI P m SP ~
          // Delete P s Column(s) (default = 1) (DECDC), VT420 and up
          // case '~':
          //   if (this.postfix === ' ') {
          //     this.deleteColumns(this.params);
          //   }
          //   break;

          default:
            this.error('Unknown CSI code: %s.', ch);
            break;
        }

        this.prefix = '';
        this.postfix = '';
        break;

      case dcs:
        if (ch === '\x1b' || ch === '\x07') {
          if (ch === '\x1b') i++;

          switch (this.prefix) {
            // User-Defined Keys (DECUDK).
            case '':
              break;

            // Request Status String (DECRQSS).
            // test: echo -e '\eP$q"p\e\\'
            case '$q':
              var pt = this.currentParam
                , valid = false;

              switch (pt) {
                // DECSCA
                case '"q':
                  pt = '0"q';
                  break;

                // DECSCL
                case '"p':
                  pt = '61"p';
                  break;

                // DECSTBM
                case 'r':
                  pt = ''
                    + (this.scrollTop + 1)
                    + ';'
                    + (this.scrollBottom + 1)
                    + 'r';
                  break;

                // SGR
                case 'm':
                  pt = '0m';
                  break;

                default:
                  this.error('Unknown DCS Pt: %s.', pt);
                  pt = '';
                  break;
              }

              this.send('\x1bP' + +valid + '$r' + pt + '\x1b\\');
              break;

            // Set Termcap/Terminfo Data (xterm, experimental).
            case '+p':
              break;

            // Request Termcap/Terminfo String (xterm, experimental)
            // Regular xterm does not even respond to this sequence.
            // This can cause a small glitch in vim.
            // test: echo -ne '\eP+q6b64\e\\'
            case '+q':
              var pt = this.currentParam
                , valid = false;

              this.send('\x1bP' + +valid + '+r' + pt + '\x1b\\');
              break;

            default:
              this.error('Unknown DCS prefix: %s.', this.prefix);
              break;
          }

          this.currentParam = 0;
          this.prefix = '';
          this.state = normal;
        } else if (!this.currentParam) {
          if (!this.prefix && ch !== '$' && ch !== '+') {
            this.currentParam = ch;
          } else if (this.prefix.length === 2) {
            this.currentParam = ch;
          } else {
            this.prefix += ch;
          }
        } else {
          this.currentParam += ch;
        }
        break;

      case ignore:
        // For PM and APC.
        if (ch === '\x1b' || ch === '\x07') {
          if (ch === '\x1b') i++;
          this.state = normal;
        }
        break;
    }
  }

  this.updateRange(this.y);
  this.refresh(this.refreshStart, this.refreshEnd);
};

Terminal.prototype.writeln = function(data) {
  this.write(data + '\r\n');
};

// Key Resources:
// https://developer.mozilla.org/en-US/docs/DOM/KeyboardEvent
Terminal.prototype.keyDown = function(ev) {
  var self = this
    , key;

  switch (ev.keyCode) {
    // backspace
    case 8:
      if (ev.shiftKey) {
        key = '\x08'; // ^H
        break;
      }
      key = '\x7f'; // ^?
      break;
    // tab
    case 9:
      if (ev.shiftKey) {
        key = '\x1b[Z';
        break;
      }
      key = '\t';
      break;
    // return/enter
    case 13:
      key = '\r';
      break;
    // escape
    case 27:
      key = '\x1b';
      break;
    // left-arrow
    case 37:
      if (this.applicationCursor) {
        key = '\x1bOD'; // SS3 as ^[O for 7-bit
        //key = '\x8fD'; // SS3 as 0x8f for 8-bit
        break;
      }
      key = '\x1b[D';
      break;
    // right-arrow
    case 39:
      if (this.applicationCursor) {
        key = '\x1bOC';
        break;
      }
      key = '\x1b[C';
      break;
    // up-arrow
    case 38:
      if (this.applicationCursor) {
        key = '\x1bOA';
        break;
      }
      if (ev.ctrlKey) {
        this.scrollDisp(-1);
        return cancel(ev);
      } else {
        key = '\x1b[A';
      }
      break;
    // down-arrow
    case 40:
      if (this.applicationCursor) {
        key = '\x1bOB';
        break;
      }
      if (ev.ctrlKey) {
        this.scrollDisp(1);
        return cancel(ev);
      } else {
        key = '\x1b[B';
      }
      break;
    // delete
    case 46:
      key = '\x1b[3~';
      break;
    // insert
    case 45:
      key = '\x1b[2~';
      break;
    // home
    case 36:
      if (this.applicationKeypad) {
        key = '\x1bOH';
        break;
      }
      key = '\x1bOH';
      break;
    // end
    case 35:
      if (this.applicationKeypad) {
        key = '\x1bOF';
        break;
      }
      key = '\x1bOF';
      break;
    // page up
    case 33:
      if (ev.shiftKey) {
        this.scrollDisp(-(this.rows - 1));
        return cancel(ev);
      } else {
        key = '\x1b[5~';
      }
      break;
    // page down
    case 34:
      if (ev.shiftKey) {
        this.scrollDisp(this.rows - 1);
        return cancel(ev);
      } else {
        key = '\x1b[6~';
      }
      break;
    // F1
    case 112:
      key = '\x1bOP';
      break;
    // F2
    case 113:
      key = '\x1bOQ';
      break;
    // F3
    case 114:
      key = '\x1bOR';
      break;
    // F4
    case 115:
      key = '\x1bOS';
      break;
    // F5
    case 116:
      key = '\x1b[15~';
      break;
    // F6
    case 117:
      key = '\x1b[17~';
      break;
    // F7
    case 118:
      key = '\x1b[18~';
      break;
    // F8
    case 119:
      key = '\x1b[19~';
      break;
    // F9
    case 120:
      key = '\x1b[20~';
      break;
    // F10
    case 121:
      key = '\x1b[21~';
      break;
    // F11
    case 122:
      key = '\x1b[23~';
      break;
    // F12
    case 123:
      key = '\x1b[24~';
      break;
    default:
      // a-z and space
      if (ev.ctrlKey) {
        if (ev.keyCode >= 65 && ev.keyCode <= 90) {
          // Ctrl-A
          if (this.screenKeys) {
            if (!this.prefixMode && !this.selectMode && ev.keyCode === 65) {
              this.enterPrefix();
              return cancel(ev);
            }
          }
          // Ctrl-V
          if (this.prefixMode && ev.keyCode === 86) {
            this.leavePrefix();
            return;
          }
          // Ctrl-C
          if ((this.prefixMode || this.selectMode) && ev.keyCode === 67) {
            if (this.visualMode) {
              setTimeout(function() {
                self.leaveVisual();
              }, 1);
            }
            return;
          }
          key = String.fromCharCode(ev.keyCode - 64);
        } else if (ev.keyCode === 32) {
          // NUL
          key = String.fromCharCode(0);
        } else if (ev.keyCode >= 51 && ev.keyCode <= 55) {
          // escape, file sep, group sep, record sep, unit sep
          key = String.fromCharCode(ev.keyCode - 51 + 27);
        } else if (ev.keyCode === 56) {
          // delete
          key = String.fromCharCode(127);
        } else if (ev.keyCode === 219) {
          // ^[ - escape
          key = String.fromCharCode(27);
        } else if (ev.keyCode === 221) {
          // ^] - group sep
          key = String.fromCharCode(29);
        }
      } else if ((!this.isMac && ev.altKey) || (this.isMac && ev.metaKey)) {
        if (ev.keyCode >= 65 && ev.keyCode <= 90) {
          key = '\x1b' + String.fromCharCode(ev.keyCode + 32);
        } else if (ev.keyCode === 192) {
          key = '\x1b`';
        } else if (ev.keyCode >= 48 && ev.keyCode <= 57) {
          key = '\x1b' + (ev.keyCode - 48);
        }
      }
      break;
  }

  if (!key) return true;

  if (this.prefixMode) {
    this.leavePrefix();
    return cancel(ev);
  }

  if (this.selectMode) {
    this.keySelect(ev, key);
    return cancel(ev);
  }

  this.emit('keydown', ev);
  this.emit('key', key, ev);

  this.showCursor();
  this.handler(key);

  return cancel(ev);
};

Terminal.prototype.setgLevel = function(g) {
  this.glevel = g;
  this.charset = this.charsets[g];
};

Terminal.prototype.setgCharset = function(g, charset) {
  this.charsets[g] = charset;
  if (this.glevel === g) {
    this.charset = charset;
  }
};

Terminal.prototype.keyPress = function(ev) {
  var key;

  cancel(ev);

  if (ev.charCode) {
    key = ev.charCode;
  } else if (ev.which == null) {
    key = ev.keyCode;
  } else if (ev.which !== 0 && ev.charCode !== 0) {
    key = ev.which;
  } else {
    return false;
  }

  if (!key || ev.ctrlKey || ev.altKey || ev.metaKey) return false;

  key = String.fromCharCode(key);

  if (this.prefixMode) {
    this.leavePrefix();
    this.keyPrefix(ev, key);
    return false;
  }

  if (this.selectMode) {
    this.keySelect(ev, key);
    return false;
  }

  this.emit('keypress', key, ev);
  this.emit('key', key, ev);

  this.showCursor();
  this.handler(key);

  return false;
};

Terminal.prototype.send = function(data) {
  var self = this;

  if (!this.queue) {
    setTimeout(function() {
      self.handler(self.queue);
      self.queue = '';
    }, 1);
  }

  this.queue += data;
};

Terminal.prototype.bell = function() {
  this.emit('bell');
  if (!this.visualBell) return;
  var self = this;
  this.element.style.borderColor = 'white';
  setTimeout(function() {
    self.element.style.borderColor = '';
  }, 10);
  if (this.popOnBell) this.focus();
};

Terminal.prototype.log = function() {
  if (!this.debug) return;
  if (!this.context.console || !this.context.console.log) return;
  var args = Array.prototype.slice.call(arguments);
  this.context.console.log.apply(this.context.console, args);
};

Terminal.prototype.error = function() {
  if (!this.debug) return;
  if (!this.context.console || !this.context.console.error) return;
  var args = Array.prototype.slice.call(arguments);
  this.context.console.error.apply(this.context.console, args);
};

Terminal.prototype.resize = function(x, y) {
  var line
    , el
    , i
    , j
    , ch;

  if (x < 1) x = 1;
  if (y < 1) y = 1;

  // resize cols
  j = this.cols;
  if (j < x) {
    ch = [this.defAttr, ' ']; // does xterm use the default attr?
    i = this.lines.length;
    while (i--) {
      while (this.lines[i].length < x) {
        this.lines[i].push(ch);
      }
    }
  } else if (j > x) {
    i = this.lines.length;
    while (i--) {
      while (this.lines[i].length > x) {
        this.lines[i].pop();
      }
    }
  }
  this.setupStops(j);
  this.cols = x;

  // resize rows
  j = this.rows;
  if (j < y) {
    el = this.element;
    while (j++ < y) {
      if (this.lines.length < y + this.ybase) {
        this.lines.push(this.blankLine());
      }
      if (this.children.length < y) {
        line = this.document.createElement('div');
        el.appendChild(line);
        this.children.push(line);
      }
    }
  } else if (j > y) {
    while (j-- > y) {
      if (this.lines.length > y + this.ybase) {
        this.lines.pop();
      }
      if (this.children.length > y) {
        el = this.children.pop();
        if (!el) continue;
        el.parentNode.removeChild(el);
      }
    }
  }
  this.rows = y;

  // make sure the cursor stays on screen
  if (this.y >= y) this.y = y - 1;
  if (this.x >= x) this.x = x - 1;

  this.scrollTop = 0;
  this.scrollBottom = y - 1;

  this.refresh(0, this.rows - 1);

  // it's a real nightmare trying
  // to resize the original
  // screen buffer. just set it
  // to null for now.
  this.normal = null;
};

Terminal.prototype.updateRange = function(y) {
  if (y < this.refreshStart) this.refreshStart = y;
  if (y > this.refreshEnd) this.refreshEnd = y;
  // if (y > this.refreshEnd) {
  //   this.refreshEnd = y;
  //   if (y > this.rows - 1) {
  //     this.refreshEnd = this.rows - 1;
  //   }
  // }
};

Terminal.prototype.maxRange = function() {
  this.refreshStart = 0;
  this.refreshEnd = this.rows - 1;
};

Terminal.prototype.setupStops = function(i) {
  if (i != null) {
    if (!this.tabs[i]) {
      i = this.prevStop(i);
    }
  } else {
    this.tabs = {};
    i = 0;
  }

  for (; i < this.cols; i += 8) {
    this.tabs[i] = true;
  }
};

Terminal.prototype.prevStop = function(x) {
  if (x == null) x = this.x;
  while (!this.tabs[--x] && x > 0);
  return x >= this.cols
    ? this.cols - 1
    : x < 0 ? 0 : x;
};

Terminal.prototype.nextStop = function(x) {
  if (x == null) x = this.x;
  while (!this.tabs[++x] && x < this.cols);
  return x >= this.cols
    ? this.cols - 1
    : x < 0 ? 0 : x;
};

Terminal.prototype.eraseRight = function(x, y) {
  var line = this.lines[this.ybase + y]
    , ch = [this.eraseAttr(), ' ']; // xterm


  for (; x < this.cols; x++) {
    line[x] = ch;
  }

  this.updateRange(y);
};

Terminal.prototype.eraseLeft = function(x, y) {
  var line = this.lines[this.ybase + y]
    , ch = [this.eraseAttr(), ' ']; // xterm

  x++;
  while (x--) line[x] = ch;

  this.updateRange(y);
};

Terminal.prototype.eraseLine = function(y) {
  this.eraseRight(0, y);
};

Terminal.prototype.blankLine = function(cur) {
  var attr = cur
    ? this.eraseAttr()
    : this.defAttr;

  var ch = [attr, ' ']
    , line = []
    , i = 0;

  for (; i < this.cols; i++) {
    line[i] = ch;
  }

  return line;
};

Terminal.prototype.ch = function(cur) {
  return cur
    ? [this.eraseAttr(), ' ']
    : [this.defAttr, ' '];
};

Terminal.prototype.is = function(term) {
  var name = this.termName;
  return (name + '').indexOf(term) === 0;
};

Terminal.prototype.handler = function(data) {
  this.emit('data', data);
};

Terminal.prototype.handleTitle = function(title) {
  this.emit('title', title);
};

/**
 * ESC
 */

// ESC D Index (IND is 0x84).
Terminal.prototype.index = function() {
  this.y++;
  if (this.y > this.scrollBottom) {
    this.y--;
    this.scroll();
  }
  this.state = normal;
};

// ESC M Reverse Index (RI is 0x8d).
Terminal.prototype.reverseIndex = function() {
  var j;
  this.y--;
  if (this.y < this.scrollTop) {
    this.y++;
    // possibly move the code below to term.reverseScroll();
    // test: echo -ne '\e[1;1H\e[44m\eM\e[0m'
    // blankLine(true) is xterm/linux behavior
    this.lines.splice(this.y + this.ybase, 0, this.blankLine(true));
    j = this.rows - 1 - this.scrollBottom;
    this.lines.splice(this.rows - 1 + this.ybase - j + 1, 1);
    // this.maxRange();
    this.updateRange(this.scrollTop);
    this.updateRange(this.scrollBottom);
  }
  this.state = normal;
};

// ESC c Full Reset (RIS).
Terminal.prototype.reset = function() {
  this.options.rows = this.rows;
  this.options.cols = this.cols;
  Terminal.call(this, this.options);
  this.refresh(0, this.rows - 1);
};

// ESC H Tab Set (HTS is 0x88).
Terminal.prototype.tabSet = function() {
  this.tabs[this.x] = true;
  this.state = normal;
};

/**
 * CSI
 */

// CSI Ps A
// Cursor Up Ps Times (default = 1) (CUU).
Terminal.prototype.cursorUp = function(params) {
  var param = params[0];
  if (param < 1) param = 1;
  this.y -= param;
  if (this.y < 0) this.y = 0;
};

// CSI Ps B
// Cursor Down Ps Times (default = 1) (CUD).
Terminal.prototype.cursorDown = function(params) {
  var param = params[0];
  if (param < 1) param = 1;
  this.y += param;
  if (this.y >= this.rows) {
    this.y = this.rows - 1;
  }
};

// CSI Ps C
// Cursor Forward Ps Times (default = 1) (CUF).
Terminal.prototype.cursorForward = function(params) {
  var param = params[0];
  if (param < 1) param = 1;
  this.x += param;
  if (this.x >= this.cols) {
    this.x = this.cols - 1;
  }
};

// CSI Ps D
// Cursor Backward Ps Times (default = 1) (CUB).
Terminal.prototype.cursorBackward = function(params) {
  var param = params[0];
  if (param < 1) param = 1;
  this.x -= param;
  if (this.x < 0) this.x = 0;
};

// CSI Ps ; Ps H
// Cursor Position [row;column] (default = [1,1]) (CUP).
Terminal.prototype.cursorPos = function(params) {
  var row, col;

  row = params[0] - 1;

  if (params.length >= 2) {
    col = params[1] - 1;
  } else {
    col = 0;
  }

  if (row < 0) {
    row = 0;
  } else if (row >= this.rows) {
    row = this.rows - 1;
  }

  if (col < 0) {
    col = 0;
  } else if (col >= this.cols) {
    col = this.cols - 1;
  }

  this.x = col;
  this.y = row;
};

// CSI Ps J  Erase in Display (ED).
//     Ps = 0  -> Erase Below (default).
//     Ps = 1  -> Erase Above.
//     Ps = 2  -> Erase All.
//     Ps = 3  -> Erase Saved Lines (xterm).
// CSI ? Ps J
//   Erase in Display (DECSED).
//     Ps = 0  -> Selective Erase Below (default).
//     Ps = 1  -> Selective Erase Above.
//     Ps = 2  -> Selective Erase All.
Terminal.prototype.eraseInDisplay = function(params) {
  var j;
  switch (params[0]) {
    case 0:
      this.eraseRight(this.x, this.y);
      j = this.y + 1;
      for (; j < this.rows; j++) {
        this.eraseLine(j);
      }
      break;
    case 1:
      this.eraseLeft(this.x, this.y);
      j = this.y;
      while (j--) {
        this.eraseLine(j);
      }
      break;
    case 2:
      j = this.rows;
      while (j--) this.eraseLine(j);
      break;
    case 3:
      ; // no saved lines
      break;
  }
};

// CSI Ps K  Erase in Line (EL).
//     Ps = 0  -> Erase to Right (default).
//     Ps = 1  -> Erase to Left.
//     Ps = 2  -> Erase All.
// CSI ? Ps K
//   Erase in Line (DECSEL).
//     Ps = 0  -> Selective Erase to Right (default).
//     Ps = 1  -> Selective Erase to Left.
//     Ps = 2  -> Selective Erase All.
Terminal.prototype.eraseInLine = function(params) {
  switch (params[0]) {
    case 0:
      this.eraseRight(this.x, this.y);
      break;
    case 1:
      this.eraseLeft(this.x, this.y);
      break;
    case 2:
      this.eraseLine(this.y);
      break;
  }
};

// CSI Pm m  Character Attributes (SGR).
//     Ps = 0  -> Normal (default).
//     Ps = 1  -> Bold.
//     Ps = 4  -> Underlined.
//     Ps = 5  -> Blink (appears as Bold).
//     Ps = 7  -> Inverse.
//     Ps = 8  -> Invisible, i.e., hidden (VT300).
//     Ps = 2 2  -> Normal (neither bold nor faint).
//     Ps = 2 4  -> Not underlined.
//     Ps = 2 5  -> Steady (not blinking).
//     Ps = 2 7  -> Positive (not inverse).
//     Ps = 2 8  -> Visible, i.e., not hidden (VT300).
//     Ps = 3 0  -> Set foreground color to Black.
//     Ps = 3 1  -> Set foreground color to Red.
//     Ps = 3 2  -> Set foreground color to Green.
//     Ps = 3 3  -> Set foreground color to Yellow.
//     Ps = 3 4  -> Set foreground color to Blue.
//     Ps = 3 5  -> Set foreground color to Magenta.
//     Ps = 3 6  -> Set foreground color to Cyan.
//     Ps = 3 7  -> Set foreground color to White.
//     Ps = 3 9  -> Set foreground color to default (original).
//     Ps = 4 0  -> Set background color to Black.
//     Ps = 4 1  -> Set background color to Red.
//     Ps = 4 2  -> Set background color to Green.
//     Ps = 4 3  -> Set background color to Yellow.
//     Ps = 4 4  -> Set background color to Blue.
//     Ps = 4 5  -> Set background color to Magenta.
//     Ps = 4 6  -> Set background color to Cyan.
//     Ps = 4 7  -> Set background color to White.
//     Ps = 4 9  -> Set background color to default (original).

//   If 16-color support is compiled, the following apply.  Assume
//   that xterm's resources are set so that the ISO color codes are
//   the first 8 of a set of 16.  Then the aixterm colors are the
//   bright versions of the ISO colors:
//     Ps = 9 0  -> Set foreground color to Black.
//     Ps = 9 1  -> Set foreground color to Red.
//     Ps = 9 2  -> Set foreground color to Green.
//     Ps = 9 3  -> Set foreground color to Yellow.
//     Ps = 9 4  -> Set foreground color to Blue.
//     Ps = 9 5  -> Set foreground color to Magenta.
//     Ps = 9 6  -> Set foreground color to Cyan.
//     Ps = 9 7  -> Set foreground color to White.
//     Ps = 1 0 0  -> Set background color to Black.
//     Ps = 1 0 1  -> Set background color to Red.
//     Ps = 1 0 2  -> Set background color to Green.
//     Ps = 1 0 3  -> Set background color to Yellow.
//     Ps = 1 0 4  -> Set background color to Blue.
//     Ps = 1 0 5  -> Set background color to Magenta.
//     Ps = 1 0 6  -> Set background color to Cyan.
//     Ps = 1 0 7  -> Set background color to White.

//   If xterm is compiled with the 16-color support disabled, it
//   supports the following, from rxvt:
//     Ps = 1 0 0  -> Set foreground and background color to
//     default.

//   If 88- or 256-color support is compiled, the following apply.
//     Ps = 3 8  ; 5  ; Ps -> Set foreground color to the second
//     Ps.
//     Ps = 4 8  ; 5  ; Ps -> Set background color to the second
//     Ps.
Terminal.prototype.charAttributes = function(params) {
  // Optimize a single SGR0.
  if (params.length === 1 && params[0] === 0) {
    this.curAttr = this.defAttr;
    return;
  }

  var l = params.length
    , i = 0
    , flags = this.curAttr >> 18
    , fg = (this.curAttr >> 9) & 0x1ff
    , bg = this.curAttr & 0x1ff
    , p;

  for (; i < l; i++) {
    p = params[i];
    if (p >= 30 && p <= 37) {
      // fg color 8
      fg = p - 30;
    } else if (p >= 40 && p <= 47) {
      // bg color 8
      bg = p - 40;
    } else if (p >= 90 && p <= 97) {
      // fg color 16
      p += 8;
      fg = p - 90;
    } else if (p >= 100 && p <= 107) {
      // bg color 16
      p += 8;
      bg = p - 100;
    } else if (p === 0) {
      // default
      flags = this.defAttr >> 18;
      fg = (this.defAttr >> 9) & 0x1ff;
      bg = this.defAttr & 0x1ff;
      // flags = 0;
      // fg = 0x1ff;
      // bg = 0x1ff;
    } else if (p === 1) {
      // bold text
      flags |= 1;
    } else if (p === 4) {
      // underlined text
      flags |= 2;
    } else if (p === 5) {
      // blink
      flags |= 4;
    } else if (p === 7) {
      // inverse and positive
      // test with: echo -e '\e[31m\e[42mhello\e[7mworld\e[27mhi\e[m'
      flags |= 8;
    } else if (p === 8) {
      // invisible
      flags |= 16;
    } else if (p === 22) {
      // not bold
      flags &= ~1;
    } else if (p === 24) {
      // not underlined
      flags &= ~2;
    } else if (p === 25) {
      // not blink
      flags &= ~4;
    } else if (p === 27) {
      // not inverse
      flags &= ~8;
    } else if (p === 28) {
      // not invisible
      flags &= ~16;
    } else if (p === 39) {
      // reset fg
      fg = (this.defAttr >> 9) & 0x1ff;
    } else if (p === 49) {
      // reset bg
      bg = this.defAttr & 0x1ff;
    } else if (p === 38) {
      // fg color 256
      if (params[i + 1] === 2) {
        i += 2;
        fg = matchColor(
          params[i] & 0xff,
          params[i + 1] & 0xff,
          params[i + 2] & 0xff);
        if (fg === -1) fg = 0x1ff;
        i += 2;
      } else if (params[i + 1] === 5) {
        i += 2;
        p = params[i] & 0xff;
        fg = p;
      }
    } else if (p === 48) {
      // bg color 256
      if (params[i + 1] === 2) {
        i += 2;
        bg = matchColor(
          params[i] & 0xff,
          params[i + 1] & 0xff,
          params[i + 2] & 0xff);
        if (bg === -1) bg = 0x1ff;
        i += 2;
      } else if (params[i + 1] === 5) {
        i += 2;
        p = params[i] & 0xff;
        bg = p;
      }
    } else if (p === 100) {
      // reset fg/bg
      fg = (this.defAttr >> 9) & 0x1ff;
      bg = this.defAttr & 0x1ff;
    } else {
      this.error('Unknown SGR attribute: %d.', p);
    }
  }

  this.curAttr = (flags << 18) | (fg << 9) | bg;
};

// CSI Ps n  Device Status Report (DSR).
//     Ps = 5  -> Status Report.  Result (``OK'') is
//   CSI 0 n
//     Ps = 6  -> Report Cursor Position (CPR) [row;column].
//   Result is
//   CSI r ; c R
// CSI ? Ps n
//   Device Status Report (DSR, DEC-specific).
//     Ps = 6  -> Report Cursor Position (CPR) [row;column] as CSI
//     ? r ; c R (assumes page is zero).
//     Ps = 1 5  -> Report Printer status as CSI ? 1 0  n  (ready).
//     or CSI ? 1 1  n  (not ready).
//     Ps = 2 5  -> Report UDK status as CSI ? 2 0  n  (unlocked)
//     or CSI ? 2 1  n  (locked).
//     Ps = 2 6  -> Report Keyboard status as
//   CSI ? 2 7  ;  1  ;  0  ;  0  n  (North American).
//   The last two parameters apply to VT400 & up, and denote key-
//   board ready and LK01 respectively.
//     Ps = 5 3  -> Report Locator status as
//   CSI ? 5 3  n  Locator available, if compiled-in, or
//   CSI ? 5 0  n  No Locator, if not.
Terminal.prototype.deviceStatus = function(params) {
  if (!this.prefix) {
    switch (params[0]) {
      case 5:
        // status report
        this.send('\x1b[0n');
        break;
      case 6:
        // cursor position
        this.send('\x1b['
          + (this.y + 1)
          + ';'
          + (this.x + 1)
          + 'R');
        break;
    }
  } else if (this.prefix === '?') {
    // modern xterm doesnt seem to
    // respond to any of these except ?6, 6, and 5
    switch (params[0]) {
      case 6:
        // cursor position
        this.send('\x1b[?'
          + (this.y + 1)
          + ';'
          + (this.x + 1)
          + 'R');
        break;
      case 15:
        // no printer
        // this.send('\x1b[?11n');
        break;
      case 25:
        // dont support user defined keys
        // this.send('\x1b[?21n');
        break;
      case 26:
        // north american keyboard
        // this.send('\x1b[?27;1;0;0n');
        break;
      case 53:
        // no dec locator/mouse
        // this.send('\x1b[?50n');
        break;
    }
  }
};

/**
 * Additions
 */

// CSI Ps @
// Insert Ps (Blank) Character(s) (default = 1) (ICH).
Terminal.prototype.insertChars = function(params) {
  var param, row, j, ch;

  param = params[0];
  if (param < 1) param = 1;

  row = this.y + this.ybase;
  j = this.x;
  ch = [this.eraseAttr(), ' ']; // xterm

  while (param-- && j < this.cols) {
    this.lines[row].splice(j++, 0, ch);
    this.lines[row].pop();
  }
};

// CSI Ps E
// Cursor Next Line Ps Times (default = 1) (CNL).
// same as CSI Ps B ?
Terminal.prototype.cursorNextLine = function(params) {
  var param = params[0];
  if (param < 1) param = 1;
  this.y += param;
  if (this.y >= this.rows) {
    this.y = this.rows - 1;
  }
  this.x = 0;
};

// CSI Ps F
// Cursor Preceding Line Ps Times (default = 1) (CNL).
// reuse CSI Ps A ?
Terminal.prototype.cursorPrecedingLine = function(params) {
  var param = params[0];
  if (param < 1) param = 1;
  this.y -= param;
  if (this.y < 0) this.y = 0;
  this.x = 0;
};

// CSI Ps G
// Cursor Character Absolute  [column] (default = [row,1]) (CHA).
Terminal.prototype.cursorCharAbsolute = function(params) {
  var param = params[0];
  if (param < 1) param = 1;
  this.x = param - 1;
};

// CSI Ps L
// Insert Ps Line(s) (default = 1) (IL).
Terminal.prototype.insertLines = function(params) {
  var param, row, j;

  param = params[0];
  if (param < 1) param = 1;
  row = this.y + this.ybase;

  j = this.rows - 1 - this.scrollBottom;
  j = this.rows - 1 + this.ybase - j + 1;

  while (param--) {
    // test: echo -e '\e[44m\e[1L\e[0m'
    // blankLine(true) - xterm/linux behavior
    this.lines.splice(row, 0, this.blankLine(true));
    this.lines.splice(j, 1);
  }

  // this.maxRange();
  this.updateRange(this.y);
  this.updateRange(this.scrollBottom);
};

// CSI Ps M
// Delete Ps Line(s) (default = 1) (DL).
Terminal.prototype.deleteLines = function(params) {
  var param, row, j;

  param = params[0];
  if (param < 1) param = 1;
  row = this.y + this.ybase;

  j = this.rows - 1 - this.scrollBottom;
  j = this.rows - 1 + this.ybase - j;

  while (param--) {
    // test: echo -e '\e[44m\e[1M\e[0m'
    // blankLine(true) - xterm/linux behavior
    this.lines.splice(j + 1, 0, this.blankLine(true));
    this.lines.splice(row, 1);
  }

  // this.maxRange();
  this.updateRange(this.y);
  this.updateRange(this.scrollBottom);
};

// CSI Ps P
// Delete Ps Character(s) (default = 1) (DCH).
Terminal.prototype.deleteChars = function(params) {
  var param, row, ch;

  param = params[0];
  if (param < 1) param = 1;

  row = this.y + this.ybase;
  ch = [this.eraseAttr(), ' ']; // xterm

  while (param--) {
    this.lines[row].splice(this.x, 1);
    this.lines[row].push(ch);
  }
};

// CSI Ps X
// Erase Ps Character(s) (default = 1) (ECH).
Terminal.prototype.eraseChars = function(params) {
  var param, row, j, ch;

  param = params[0];
  if (param < 1) param = 1;

  row = this.y + this.ybase;
  j = this.x;
  ch = [this.eraseAttr(), ' ']; // xterm

  while (param-- && j < this.cols) {
    this.lines[row][j++] = ch;
  }
};

// CSI Pm `  Character Position Absolute
//   [column] (default = [row,1]) (HPA).
Terminal.prototype.charPosAbsolute = function(params) {
  var param = params[0];
  if (param < 1) param = 1;
  this.x = param - 1;
  if (this.x >= this.cols) {
    this.x = this.cols - 1;
  }
};

// 141 61 a * HPR -
// Horizontal Position Relative
// reuse CSI Ps C ?
Terminal.prototype.HPositionRelative = function(params) {
  var param = params[0];
  if (param < 1) param = 1;
  this.x += param;
  if (this.x >= this.cols) {
    this.x = this.cols - 1;
  }
};

// CSI Ps c  Send Device Attributes (Primary DA).
//     Ps = 0  or omitted -> request attributes from terminal.  The
//     response depends on the decTerminalID resource setting.
//     -> CSI ? 1 ; 2 c  (``VT100 with Advanced Video Option'')
//     -> CSI ? 1 ; 0 c  (``VT101 with No Options'')
//     -> CSI ? 6 c  (``VT102'')
//     -> CSI ? 6 0 ; 1 ; 2 ; 6 ; 8 ; 9 ; 1 5 ; c  (``VT220'')
//   The VT100-style response parameters do not mean anything by
//   themselves.  VT220 parameters do, telling the host what fea-
//   tures the terminal supports:
//     Ps = 1  -> 132-columns.
//     Ps = 2  -> Printer.
//     Ps = 6  -> Selective erase.
//     Ps = 8  -> User-defined keys.
//     Ps = 9  -> National replacement character sets.
//     Ps = 1 5  -> Technical characters.
//     Ps = 2 2  -> ANSI color, e.g., VT525.
//     Ps = 2 9  -> ANSI text locator (i.e., DEC Locator mode).
// CSI > Ps c
//   Send Device Attributes (Secondary DA).
//     Ps = 0  or omitted -> request the terminal's identification
//     code.  The response depends on the decTerminalID resource set-
//     ting.  It should apply only to VT220 and up, but xterm extends
//     this to VT100.
//     -> CSI  > Pp ; Pv ; Pc c
//   where Pp denotes the terminal type
//     Pp = 0  -> ``VT100''.
//     Pp = 1  -> ``VT220''.
//   and Pv is the firmware version (for xterm, this was originally
//   the XFree86 patch number, starting with 95).  In a DEC termi-
//   nal, Pc indicates the ROM cartridge registration number and is
//   always zero.
// More information:
//   xterm/charproc.c - line 2012, for more information.
//   vim responds with ^[[?0c or ^[[?1c after the terminal's response (?)
Terminal.prototype.sendDeviceAttributes = function(params) {
  if (params[0] > 0) return;

  if (!this.prefix) {
    if (this.is('xterm')
        || this.is('rxvt-unicode')
        || this.is('screen')) {
      this.send('\x1b[?1;2c');
    } else if (this.is('linux')) {
      this.send('\x1b[?6c');
    }
  } else if (this.prefix === '>') {
    // xterm and urxvt
    // seem to spit this
    // out around ~370 times (?).
    if (this.is('xterm')) {
      this.send('\x1b[>0;276;0c');
    } else if (this.is('rxvt-unicode')) {
      this.send('\x1b[>85;95;0c');
    } else if (this.is('linux')) {
      // not supported by linux console.
      // linux console echoes parameters.
      this.send(params[0] + 'c');
    } else if (this.is('screen')) {
      this.send('\x1b[>83;40003;0c');
    }
  }
};

// CSI Pm d
// Line Position Absolute  [row] (default = [1,column]) (VPA).
Terminal.prototype.linePosAbsolute = function(params) {
  var param = params[0];
  if (param < 1) param = 1;
  this.y = param - 1;
  if (this.y >= this.rows) {
    this.y = this.rows - 1;
  }
};

// 145 65 e * VPR - Vertical Position Relative
// reuse CSI Ps B ?
Terminal.prototype.VPositionRelative = function(params) {
  var param = params[0];
  if (param < 1) param = 1;
  this.y += param;
  if (this.y >= this.rows) {
    this.y = this.rows - 1;
  }
};

// CSI Ps ; Ps f
//   Horizontal and Vertical Position [row;column] (default =
//   [1,1]) (HVP).
Terminal.prototype.HVPosition = function(params) {
  if (params[0] < 1) params[0] = 1;
  if (params[1] < 1) params[1] = 1;

  this.y = params[0] - 1;
  if (this.y >= this.rows) {
    this.y = this.rows - 1;
  }

  this.x = params[1] - 1;
  if (this.x >= this.cols) {
    this.x = this.cols - 1;
  }
};

// CSI Pm h  Set Mode (SM).
//     Ps = 2  -> Keyboard Action Mode (AM).
//     Ps = 4  -> Insert Mode (IRM).
//     Ps = 1 2  -> Send/receive (SRM).
//     Ps = 2 0  -> Automatic Newline (LNM).
// CSI ? Pm h
//   DEC Private Mode Set (DECSET).
//     Ps = 1  -> Application Cursor Keys (DECCKM).
//     Ps = 2  -> Designate USASCII for character sets G0-G3
//     (DECANM), and set VT100 mode.
//     Ps = 3  -> 132 Column Mode (DECCOLM).
//     Ps = 4  -> Smooth (Slow) Scroll (DECSCLM).
//     Ps = 5  -> Reverse Video (DECSCNM).
//     Ps = 6  -> Origin Mode (DECOM).
//     Ps = 7  -> Wraparound Mode (DECAWM).
//     Ps = 8  -> Auto-repeat Keys (DECARM).
//     Ps = 9  -> Send Mouse X & Y on button press.  See the sec-
//     tion Mouse Tracking.
//     Ps = 1 0  -> Show toolbar (rxvt).
//     Ps = 1 2  -> Start Blinking Cursor (att610).
//     Ps = 1 8  -> Print form feed (DECPFF).
//     Ps = 1 9  -> Set print extent to full screen (DECPEX).
//     Ps = 2 5  -> Show Cursor (DECTCEM).
//     Ps = 3 0  -> Show scrollbar (rxvt).
//     Ps = 3 5  -> Enable font-shifting functions (rxvt).
//     Ps = 3 8  -> Enter Tektronix Mode (DECTEK).
//     Ps = 4 0  -> Allow 80 -> 132 Mode.
//     Ps = 4 1  -> more(1) fix (see curses resource).
//     Ps = 4 2  -> Enable Nation Replacement Character sets (DECN-
//     RCM).
//     Ps = 4 4  -> Turn On Margin Bell.
//     Ps = 4 5  -> Reverse-wraparound Mode.
//     Ps = 4 6  -> Start Logging.  This is normally disabled by a
//     compile-time option.
//     Ps = 4 7  -> Use Alternate Screen Buffer.  (This may be dis-
//     abled by the titeInhibit resource).
//     Ps = 6 6  -> Application keypad (DECNKM).
//     Ps = 6 7  -> Backarrow key sends backspace (DECBKM).
//     Ps = 1 0 0 0  -> Send Mouse X & Y on button press and
//     release.  See the section Mouse Tracking.
//     Ps = 1 0 0 1  -> Use Hilite Mouse Tracking.
//     Ps = 1 0 0 2  -> Use Cell Motion Mouse Tracking.
//     Ps = 1 0 0 3  -> Use All Motion Mouse Tracking.
//     Ps = 1 0 0 4  -> Send FocusIn/FocusOut events.
//     Ps = 1 0 0 5  -> Enable Extended Mouse Mode.
//     Ps = 1 0 1 0  -> Scroll to bottom on tty output (rxvt).
//     Ps = 1 0 1 1  -> Scroll to bottom on key press (rxvt).
//     Ps = 1 0 3 4  -> Interpret "meta" key, sets eighth bit.
//     (enables the eightBitInput resource).
//     Ps = 1 0 3 5  -> Enable special modifiers for Alt and Num-
//     Lock keys.  (This enables the numLock resource).
//     Ps = 1 0 3 6  -> Send ESC   when Meta modifies a key.  (This
//     enables the metaSendsEscape resource).
//     Ps = 1 0 3 7  -> Send DEL from the editing-keypad Delete
//     key.
//     Ps = 1 0 3 9  -> Send ESC  when Alt modifies a key.  (This
//     enables the altSendsEscape resource).
//     Ps = 1 0 4 0  -> Keep selection even if not highlighted.
//     (This enables the keepSelection resource).
//     Ps = 1 0 4 1  -> Use the CLIPBOARD selection.  (This enables
//     the selectToClipboard resource).
//     Ps = 1 0 4 2  -> Enable Urgency window manager hint when
//     Control-G is received.  (This enables the bellIsUrgent
//     resource).
//     Ps = 1 0 4 3  -> Enable raising of the window when Control-G
//     is received.  (enables the popOnBell resource).
//     Ps = 1 0 4 7  -> Use Alternate Screen Buffer.  (This may be
//     disabled by the titeInhibit resource).
//     Ps = 1 0 4 8  -> Save cursor as in DECSC.  (This may be dis-
//     abled by the titeInhibit resource).
//     Ps = 1 0 4 9  -> Save cursor as in DECSC and use Alternate
//     Screen Buffer, clearing it first.  (This may be disabled by
//     the titeInhibit resource).  This combines the effects of the 1
//     0 4 7  and 1 0 4 8  modes.  Use this with terminfo-based
//     applications rather than the 4 7  mode.
//     Ps = 1 0 5 0  -> Set terminfo/termcap function-key mode.
//     Ps = 1 0 5 1  -> Set Sun function-key mode.
//     Ps = 1 0 5 2  -> Set HP function-key mode.
//     Ps = 1 0 5 3  -> Set SCO function-key mode.
//     Ps = 1 0 6 0  -> Set legacy keyboard emulation (X11R6).
//     Ps = 1 0 6 1  -> Set VT220 keyboard emulation.
//     Ps = 2 0 0 4  -> Set bracketed paste mode.
// Modes:
//   http://vt100.net/docs/vt220-rm/chapter4.html
Terminal.prototype.setMode = function(params) {
  if (typeof params === 'object') {
    var l = params.length
      , i = 0;

    for (; i < l; i++) {
      this.setMode(params[i]);
    }

    return;
  }

  if (!this.prefix) {
    switch (params) {
      case 4:
        this.insertMode = true;
        break;
      case 20:
        //this.convertEol = true;
        break;
    }
  } else if (this.prefix === '?') {
    switch (params) {
      case 1:
        this.applicationCursor = true;
        break;
      case 2:
        this.setgCharset(0, Terminal.charsets.US);
        this.setgCharset(1, Terminal.charsets.US);
        this.setgCharset(2, Terminal.charsets.US);
        this.setgCharset(3, Terminal.charsets.US);
        // set VT100 mode here
        break;
      case 3: // 132 col mode
        this.savedCols = this.cols;
        this.resize(132, this.rows);
        break;
      case 6:
        this.originMode = true;
        break;
      case 7:
        this.wraparoundMode = true;
        break;
      case 12:
        // this.cursorBlink = true;
        break;
      case 66:
        this.log('Serial port requested application keypad.');
        this.applicationKeypad = true;
        break;
      case 9: // X10 Mouse
        // no release, no motion, no wheel, no modifiers.
      case 1000: // vt200 mouse
        // no motion.
        // no modifiers, except control on the wheel.
      case 1002: // button event mouse
      case 1003: // any event mouse
        // any event - sends motion events,
        // even if there is no button held down.
        this.x10Mouse = params === 9;
        this.vt200Mouse = params === 1000;
        this.normalMouse = params > 1000;
        this.mouseEvents = true;
        this.element.style.cursor = 'default';
        this.log('Binding to mouse events.');
        break;
      case 1004: // send focusin/focusout events
        // focusin: ^[[I
        // focusout: ^[[O
        this.sendFocus = true;
        break;
      case 1005: // utf8 ext mode mouse
        this.utfMouse = true;
        // for wide terminals
        // simply encodes large values as utf8 characters
        break;
      case 1006: // sgr ext mode mouse
        this.sgrMouse = true;
        // for wide terminals
        // does not add 32 to fields
        // press: ^[[<b;x;yM
        // release: ^[[<b;x;ym
        break;
      case 1015: // urxvt ext mode mouse
        this.urxvtMouse = true;
        // for wide terminals
        // numbers for fields
        // press: ^[[b;x;yM
        // motion: ^[[b;x;yT
        break;
      case 25: // show cursor
        this.cursorHidden = false;
        break;
      case 1049: // alt screen buffer cursor
        //this.saveCursor();
        ; // FALL-THROUGH
      case 47: // alt screen buffer
      case 1047: // alt screen buffer
        if (!this.normal) {
          var normal = {
            lines: this.lines,
            ybase: this.ybase,
            ydisp: this.ydisp,
            x: this.x,
            y: this.y,
            scrollTop: this.scrollTop,
            scrollBottom: this.scrollBottom,
            tabs: this.tabs
            // XXX save charset(s) here?
            // charset: this.charset,
            // glevel: this.glevel,
            // charsets: this.charsets
          };
          this.reset();
          this.normal = normal;
          this.showCursor();
        }
        break;
    }
  }
};

// CSI Pm l  Reset Mode (RM).
//     Ps = 2  -> Keyboard Action Mode (AM).
//     Ps = 4  -> Replace Mode (IRM).
//     Ps = 1 2  -> Send/receive (SRM).
//     Ps = 2 0  -> Normal Linefeed (LNM).
// CSI ? Pm l
//   DEC Private Mode Reset (DECRST).
//     Ps = 1  -> Normal Cursor Keys (DECCKM).
//     Ps = 2  -> Designate VT52 mode (DECANM).
//     Ps = 3  -> 80 Column Mode (DECCOLM).
//     Ps = 4  -> Jump (Fast) Scroll (DECSCLM).
//     Ps = 5  -> Normal Video (DECSCNM).
//     Ps = 6  -> Normal Cursor Mode (DECOM).
//     Ps = 7  -> No Wraparound Mode (DECAWM).
//     Ps = 8  -> No Auto-repeat Keys (DECARM).
//     Ps = 9  -> Don't send Mouse X & Y on button press.
//     Ps = 1 0  -> Hide toolbar (rxvt).
//     Ps = 1 2  -> Stop Blinking Cursor (att610).
//     Ps = 1 8  -> Don't print form feed (DECPFF).
//     Ps = 1 9  -> Limit print to scrolling region (DECPEX).
//     Ps = 2 5  -> Hide Cursor (DECTCEM).
//     Ps = 3 0  -> Don't show scrollbar (rxvt).
//     Ps = 3 5  -> Disable font-shifting functions (rxvt).
//     Ps = 4 0  -> Disallow 80 -> 132 Mode.
//     Ps = 4 1  -> No more(1) fix (see curses resource).
//     Ps = 4 2  -> Disable Nation Replacement Character sets (DEC-
//     NRCM).
//     Ps = 4 4  -> Turn Off Margin Bell.
//     Ps = 4 5  -> No Reverse-wraparound Mode.
//     Ps = 4 6  -> Stop Logging.  (This is normally disabled by a
//     compile-time option).
//     Ps = 4 7  -> Use Normal Screen Buffer.
//     Ps = 6 6  -> Numeric keypad (DECNKM).
//     Ps = 6 7  -> Backarrow key sends delete (DECBKM).
//     Ps = 1 0 0 0  -> Don't send Mouse X & Y on button press and
//     release.  See the section Mouse Tracking.
//     Ps = 1 0 0 1  -> Don't use Hilite Mouse Tracking.
//     Ps = 1 0 0 2  -> Don't use Cell Motion Mouse Tracking.
//     Ps = 1 0 0 3  -> Don't use All Motion Mouse Tracking.
//     Ps = 1 0 0 4  -> Don't send FocusIn/FocusOut events.
//     Ps = 1 0 0 5  -> Disable Extended Mouse Mode.
//     Ps = 1 0 1 0  -> Don't scroll to bottom on tty output
//     (rxvt).
//     Ps = 1 0 1 1  -> Don't scroll to bottom on key press (rxvt).
//     Ps = 1 0 3 4  -> Don't interpret "meta" key.  (This disables
//     the eightBitInput resource).
//     Ps = 1 0 3 5  -> Disable special modifiers for Alt and Num-
//     Lock keys.  (This disables the numLock resource).
//     Ps = 1 0 3 6  -> Don't send ESC  when Meta modifies a key.
//     (This disables the metaSendsEscape resource).
//     Ps = 1 0 3 7  -> Send VT220 Remove from the editing-keypad
//     Delete key.
//     Ps = 1 0 3 9  -> Don't send ESC  when Alt modifies a key.
//     (This disables the altSendsEscape resource).
//     Ps = 1 0 4 0  -> Do not keep selection when not highlighted.
//     (This disables the keepSelection resource).
//     Ps = 1 0 4 1  -> Use the PRIMARY selection.  (This disables
//     the selectToClipboard resource).
//     Ps = 1 0 4 2  -> Disable Urgency window manager hint when
//     Control-G is received.  (This disables the bellIsUrgent
//     resource).
//     Ps = 1 0 4 3  -> Disable raising of the window when Control-
//     G is received.  (This disables the popOnBell resource).
//     Ps = 1 0 4 7  -> Use Normal Screen Buffer, clearing screen
//     first if in the Alternate Screen.  (This may be disabled by
//     the titeInhibit resource).
//     Ps = 1 0 4 8  -> Restore cursor as in DECRC.  (This may be
//     disabled by the titeInhibit resource).
//     Ps = 1 0 4 9  -> Use Normal Screen Buffer and restore cursor
//     as in DECRC.  (This may be disabled by the titeInhibit
//     resource).  This combines the effects of the 1 0 4 7  and 1 0
//     4 8  modes.  Use this with terminfo-based applications rather
//     than the 4 7  mode.
//     Ps = 1 0 5 0  -> Reset terminfo/termcap function-key mode.
//     Ps = 1 0 5 1  -> Reset Sun function-key mode.
//     Ps = 1 0 5 2  -> Reset HP function-key mode.
//     Ps = 1 0 5 3  -> Reset SCO function-key mode.
//     Ps = 1 0 6 0  -> Reset legacy keyboard emulation (X11R6).
//     Ps = 1 0 6 1  -> Reset keyboard emulation to Sun/PC style.
//     Ps = 2 0 0 4  -> Reset bracketed paste mode.
Terminal.prototype.resetMode = function(params) {
  if (typeof params === 'object') {
    var l = params.length
      , i = 0;

    for (; i < l; i++) {
      this.resetMode(params[i]);
    }

    return;
  }

  if (!this.prefix) {
    switch (params) {
      case 4:
        this.insertMode = false;
        break;
      case 20:
        //this.convertEol = false;
        break;
    }
  } else if (this.prefix === '?') {
    switch (params) {
      case 1:
        this.applicationCursor = false;
        break;
      case 3:
        if (this.cols === 132 && this.savedCols) {
          this.resize(this.savedCols, this.rows);
        }
        delete this.savedCols;
        break;
      case 6:
        this.originMode = false;
        break;
      case 7:
        this.wraparoundMode = false;
        break;
      case 12:
        // this.cursorBlink = false;
        break;
      case 66:
        this.log('Switching back to normal keypad.');
        this.applicationKeypad = false;
        break;
      case 9: // X10 Mouse
      case 1000: // vt200 mouse
      case 1002: // button event mouse
      case 1003: // any event mouse
        this.x10Mouse = false;
        this.vt200Mouse = false;
        this.normalMouse = false;
        this.mouseEvents = false;
        this.element.style.cursor = '';
        break;
      case 1004: // send focusin/focusout events
        this.sendFocus = false;
        break;
      case 1005: // utf8 ext mode mouse
        this.utfMouse = false;
        break;
      case 1006: // sgr ext mode mouse
        this.sgrMouse = false;
        break;
      case 1015: // urxvt ext mode mouse
        this.urxvtMouse = false;
        break;
      case 25: // hide cursor
        this.cursorHidden = true;
        break;
      case 1049: // alt screen buffer cursor
        ; // FALL-THROUGH
      case 47: // normal screen buffer
      case 1047: // normal screen buffer - clearing it first
        if (this.normal) {
          this.lines = this.normal.lines;
          this.ybase = this.normal.ybase;
          this.ydisp = this.normal.ydisp;
          this.x = this.normal.x;
          this.y = this.normal.y;
          this.scrollTop = this.normal.scrollTop;
          this.scrollBottom = this.normal.scrollBottom;
          this.tabs = this.normal.tabs;
          this.normal = null;
          // if (params === 1049) {
          //   this.x = this.savedX;
          //   this.y = this.savedY;
          // }
          this.refresh(0, this.rows - 1);
          this.showCursor();
        }
        break;
    }
  }
};

// CSI Ps ; Ps r
//   Set Scrolling Region [top;bottom] (default = full size of win-
//   dow) (DECSTBM).
// CSI ? Pm r
Terminal.prototype.setScrollRegion = function(params) {
  if (this.prefix) return;
  this.scrollTop = (params[0] || 1) - 1;
  this.scrollBottom = (params[1] || this.rows) - 1;
  this.x = 0;
  this.y = 0;
};

// CSI s
//   Save cursor (ANSI.SYS).
Terminal.prototype.saveCursor = function(params) {
  this.savedX = this.x;
  this.savedY = this.y;
};

// CSI u
//   Restore cursor (ANSI.SYS).
Terminal.prototype.restoreCursor = function(params) {
  this.x = this.savedX || 0;
  this.y = this.savedY || 0;
};

/**
 * Lesser Used
 */

// CSI Ps I
//   Cursor Forward Tabulation Ps tab stops (default = 1) (CHT).
Terminal.prototype.cursorForwardTab = function(params) {
  var param = params[0] || 1;
  while (param--) {
    this.x = this.nextStop();
  }
};

// CSI Ps S  Scroll up Ps lines (default = 1) (SU).
Terminal.prototype.scrollUp = function(params) {
  var param = params[0] || 1;
  while (param--) {
    this.lines.splice(this.ybase + this.scrollTop, 1);
    this.lines.splice(this.ybase + this.scrollBottom, 0, this.blankLine());
  }
  // this.maxRange();
  this.updateRange(this.scrollTop);
  this.updateRange(this.scrollBottom);
};

// CSI Ps T  Scroll down Ps lines (default = 1) (SD).
Terminal.prototype.scrollDown = function(params) {
  var param = params[0] || 1;
  while (param--) {
    this.lines.splice(this.ybase + this.scrollBottom, 1);
    this.lines.splice(this.ybase + this.scrollTop, 0, this.blankLine());
  }
  // this.maxRange();
  this.updateRange(this.scrollTop);
  this.updateRange(this.scrollBottom);
};

// CSI Ps ; Ps ; Ps ; Ps ; Ps T
//   Initiate highlight mouse tracking.  Parameters are
//   [func;startx;starty;firstrow;lastrow].  See the section Mouse
//   Tracking.
Terminal.prototype.initMouseTracking = function(params) {
  // Relevant: DECSET 1001
};

// CSI > Ps; Ps T
//   Reset one or more features of the title modes to the default
//   value.  Normally, "reset" disables the feature.  It is possi-
//   ble to disable the ability to reset features by compiling a
//   different default for the title modes into xterm.
//     Ps = 0  -> Do not set window/icon labels using hexadecimal.
//     Ps = 1  -> Do not query window/icon labels using hexadeci-
//     mal.
//     Ps = 2  -> Do not set window/icon labels using UTF-8.
//     Ps = 3  -> Do not query window/icon labels using UTF-8.
//   (See discussion of "Title Modes").
Terminal.prototype.resetTitleModes = function(params) {
  ;
};

// CSI Ps Z  Cursor Backward Tabulation Ps tab stops (default = 1) (CBT).
Terminal.prototype.cursorBackwardTab = function(params) {
  var param = params[0] || 1;
  while (param--) {
    this.x = this.prevStop();
  }
};

// CSI Ps b  Repeat the preceding graphic character Ps times (REP).
Terminal.prototype.repeatPrecedingCharacter = function(params) {
  var param = params[0] || 1
    , line = this.lines[this.ybase + this.y]
    , ch = line[this.x - 1] || [this.defAttr, ' '];

  while (param--) line[this.x++] = ch;
};

// CSI Ps g  Tab Clear (TBC).
//     Ps = 0  -> Clear Current Column (default).
//     Ps = 3  -> Clear All.
// Potentially:
//   Ps = 2  -> Clear Stops on Line.
//   http://vt100.net/annarbor/aaa-ug/section6.html
Terminal.prototype.tabClear = function(params) {
  var param = params[0];
  if (param <= 0) {
    delete this.tabs[this.x];
  } else if (param === 3) {
    this.tabs = {};
  }
};

// CSI Pm i  Media Copy (MC).
//     Ps = 0  -> Print screen (default).
//     Ps = 4  -> Turn off printer controller mode.
//     Ps = 5  -> Turn on printer controller mode.
// CSI ? Pm i
//   Media Copy (MC, DEC-specific).
//     Ps = 1  -> Print line containing cursor.
//     Ps = 4  -> Turn off autoprint mode.
//     Ps = 5  -> Turn on autoprint mode.
//     Ps = 1  0  -> Print composed display, ignores DECPEX.
//     Ps = 1  1  -> Print all pages.
Terminal.prototype.mediaCopy = function(params) {
  ;
};

// CSI > Ps; Ps m
//   Set or reset resource-values used by xterm to decide whether
//   to construct escape sequences holding information about the
//   modifiers pressed with a given key.  The first parameter iden-
//   tifies the resource to set/reset.  The second parameter is the
//   value to assign to the resource.  If the second parameter is
//   omitted, the resource is reset to its initial value.
//     Ps = 1  -> modifyCursorKeys.
//     Ps = 2  -> modifyFunctionKeys.
//     Ps = 4  -> modifyOtherKeys.
//   If no parameters are given, all resources are reset to their
//   initial values.
Terminal.prototype.setResources = function(params) {
  ;
};

// CSI > Ps n
//   Disable modifiers which may be enabled via the CSI > Ps; Ps m
//   sequence.  This corresponds to a resource value of "-1", which
//   cannot be set with the other sequence.  The parameter identi-
//   fies the resource to be disabled:
//     Ps = 1  -> modifyCursorKeys.
//     Ps = 2  -> modifyFunctionKeys.
//     Ps = 4  -> modifyOtherKeys.
//   If the parameter is omitted, modifyFunctionKeys is disabled.
//   When modifyFunctionKeys is disabled, xterm uses the modifier
//   keys to make an extended sequence of functions rather than
//   adding a parameter to each function key to denote the modi-
//   fiers.
Terminal.prototype.disableModifiers = function(params) {
  ;
};

// CSI > Ps p
//   Set resource value pointerMode.  This is used by xterm to
//   decide whether to hide the pointer cursor as the user types.
//   Valid values for the parameter:
//     Ps = 0  -> never hide the pointer.
//     Ps = 1  -> hide if the mouse tracking mode is not enabled.
//     Ps = 2  -> always hide the pointer.  If no parameter is
//     given, xterm uses the default, which is 1 .
Terminal.prototype.setPointerMode = function(params) {
  ;
};

// CSI ! p   Soft terminal reset (DECSTR).
// http://vt100.net/docs/vt220-rm/table4-10.html
Terminal.prototype.softReset = function(params) {
  this.cursorHidden = false;
  this.insertMode = false;
  this.originMode = false;
  this.wraparoundMode = false; // autowrap
  this.applicationKeypad = false; // ?
  this.applicationCursor = false;
  this.scrollTop = 0;
  this.scrollBottom = this.rows - 1;
  this.curAttr = this.defAttr;
  this.x = this.y = 0; // ?
  this.charset = null;
  this.glevel = 0; // ??
  this.charsets = [null]; // ??
};

// CSI Ps$ p
//   Request ANSI mode (DECRQM).  For VT300 and up, reply is
//     CSI Ps; Pm$ y
//   where Ps is the mode number as in RM, and Pm is the mode
//   value:
//     0 - not recognized
//     1 - set
//     2 - reset
//     3 - permanently set
//     4 - permanently reset
Terminal.prototype.requestAnsiMode = function(params) {
  ;
};

// CSI ? Ps$ p
//   Request DEC private mode (DECRQM).  For VT300 and up, reply is
//     CSI ? Ps; Pm$ p
//   where Ps is the mode number as in DECSET, Pm is the mode value
//   as in the ANSI DECRQM.
Terminal.prototype.requestPrivateMode = function(params) {
  ;
};

// CSI Ps ; Ps " p
//   Set conformance level (DECSCL).  Valid values for the first
//   parameter:
//     Ps = 6 1  -> VT100.
//     Ps = 6 2  -> VT200.
//     Ps = 6 3  -> VT300.
//   Valid values for the second parameter:
//     Ps = 0  -> 8-bit controls.
//     Ps = 1  -> 7-bit controls (always set for VT100).
//     Ps = 2  -> 8-bit controls.
Terminal.prototype.setConformanceLevel = function(params) {
  ;
};

// CSI Ps q  Load LEDs (DECLL).
//     Ps = 0  -> Clear all LEDS (default).
//     Ps = 1  -> Light Num Lock.
//     Ps = 2  -> Light Caps Lock.
//     Ps = 3  -> Light Scroll Lock.
//     Ps = 2  1  -> Extinguish Num Lock.
//     Ps = 2  2  -> Extinguish Caps Lock.
//     Ps = 2  3  -> Extinguish Scroll Lock.
Terminal.prototype.loadLEDs = function(params) {
  ;
};

// CSI Ps SP q
//   Set cursor style (DECSCUSR, VT520).
//     Ps = 0  -> blinking block.
//     Ps = 1  -> blinking block (default).
//     Ps = 2  -> steady block.
//     Ps = 3  -> blinking underline.
//     Ps = 4  -> steady underline.
Terminal.prototype.setCursorStyle = function(params) {
  ;
};

// CSI Ps " q
//   Select character protection attribute (DECSCA).  Valid values
//   for the parameter:
//     Ps = 0  -> DECSED and DECSEL can erase (default).
//     Ps = 1  -> DECSED and DECSEL cannot erase.
//     Ps = 2  -> DECSED and DECSEL can erase.
Terminal.prototype.setCharProtectionAttr = function(params) {
  ;
};

// CSI ? Pm r
//   Restore DEC Private Mode Values.  The value of Ps previously
//   saved is restored.  Ps values are the same as for DECSET.
Terminal.prototype.restorePrivateValues = function(params) {
  ;
};

// CSI Pt; Pl; Pb; Pr; Ps$ r
//   Change Attributes in Rectangular Area (DECCARA), VT400 and up.
//     Pt; Pl; Pb; Pr denotes the rectangle.
//     Ps denotes the SGR attributes to change: 0, 1, 4, 5, 7.
// NOTE: xterm doesn't enable this code by default.
Terminal.prototype.setAttrInRectangle = function(params) {
  var t = params[0]
    , l = params[1]
    , b = params[2]
    , r = params[3]
    , attr = params[4];

  var line
    , i;

  for (; t < b + 1; t++) {
    line = this.lines[this.ybase + t];
    for (i = l; i < r; i++) {
      line[i] = [attr, line[i][1]];
    }
  }

  // this.maxRange();
  this.updateRange(params[0]);
  this.updateRange(params[2]);
};

// CSI ? Pm s
//   Save DEC Private Mode Values.  Ps values are the same as for
//   DECSET.
Terminal.prototype.savePrivateValues = function(params) {
  ;
};

// CSI Ps ; Ps ; Ps t
//   Window manipulation (from dtterm, as well as extensions).
//   These controls may be disabled using the allowWindowOps
//   resource.  Valid values for the first (and any additional
//   parameters) are:
//     Ps = 1  -> De-iconify window.
//     Ps = 2  -> Iconify window.
//     Ps = 3  ;  x ;  y -> Move window to [x, y].
//     Ps = 4  ;  height ;  width -> Resize the xterm window to
//     height and width in pixels.
//     Ps = 5  -> Raise the xterm window to the front of the stack-
//     ing order.
//     Ps = 6  -> Lower the xterm window to the bottom of the
//     stacking order.
//     Ps = 7  -> Refresh the xterm window.
//     Ps = 8  ;  height ;  width -> Resize the text area to
//     [height;width] in characters.
//     Ps = 9  ;  0  -> Restore maximized window.
//     Ps = 9  ;  1  -> Maximize window (i.e., resize to screen
//     size).
//     Ps = 1 0  ;  0  -> Undo full-screen mode.
//     Ps = 1 0  ;  1  -> Change to full-screen.
//     Ps = 1 1  -> Report xterm window state.  If the xterm window
//     is open (non-iconified), it returns CSI 1 t .  If the xterm
//     window is iconified, it returns CSI 2 t .
//     Ps = 1 3  -> Report xterm window position.  Result is CSI 3
//     ; x ; y t
//     Ps = 1 4  -> Report xterm window in pixels.  Result is CSI
//     4  ;  height ;  width t
//     Ps = 1 8  -> Report the size of the text area in characters.
//     Result is CSI  8  ;  height ;  width t
//     Ps = 1 9  -> Report the size of the screen in characters.
//     Result is CSI  9  ;  height ;  width t
//     Ps = 2 0  -> Report xterm window's icon label.  Result is
//     OSC  L  label ST
//     Ps = 2 1  -> Report xterm window's title.  Result is OSC  l
//     label ST
//     Ps = 2 2  ;  0  -> Save xterm icon and window title on
//     stack.
//     Ps = 2 2  ;  1  -> Save xterm icon title on stack.
//     Ps = 2 2  ;  2  -> Save xterm window title on stack.
//     Ps = 2 3  ;  0  -> Restore xterm icon and window title from
//     stack.
//     Ps = 2 3  ;  1  -> Restore xterm icon title from stack.
//     Ps = 2 3  ;  2  -> Restore xterm window title from stack.
//     Ps >= 2 4  -> Resize to Ps lines (DECSLPP).
Terminal.prototype.manipulateWindow = function(params) {
  ;
};

// CSI Pt; Pl; Pb; Pr; Ps$ t
//   Reverse Attributes in Rectangular Area (DECRARA), VT400 and
//   up.
//     Pt; Pl; Pb; Pr denotes the rectangle.
//     Ps denotes the attributes to reverse, i.e.,  1, 4, 5, 7.
// NOTE: xterm doesn't enable this code by default.
Terminal.prototype.reverseAttrInRectangle = function(params) {
  ;
};

// CSI > Ps; Ps t
//   Set one or more features of the title modes.  Each parameter
//   enables a single feature.
//     Ps = 0  -> Set window/icon labels using hexadecimal.
//     Ps = 1  -> Query window/icon labels using hexadecimal.
//     Ps = 2  -> Set window/icon labels using UTF-8.
//     Ps = 3  -> Query window/icon labels using UTF-8.  (See dis-
//     cussion of "Title Modes")
Terminal.prototype.setTitleModeFeature = function(params) {
  ;
};

// CSI Ps SP t
//   Set warning-bell volume (DECSWBV, VT520).
//     Ps = 0  or 1  -> off.
//     Ps = 2 , 3  or 4  -> low.
//     Ps = 5 , 6 , 7 , or 8  -> high.
Terminal.prototype.setWarningBellVolume = function(params) {
  ;
};

// CSI Ps SP u
//   Set margin-bell volume (DECSMBV, VT520).
//     Ps = 1  -> off.
//     Ps = 2 , 3  or 4  -> low.
//     Ps = 0 , 5 , 6 , 7 , or 8  -> high.
Terminal.prototype.setMarginBellVolume = function(params) {
  ;
};

// CSI Pt; Pl; Pb; Pr; Pp; Pt; Pl; Pp$ v
//   Copy Rectangular Area (DECCRA, VT400 and up).
//     Pt; Pl; Pb; Pr denotes the rectangle.
//     Pp denotes the source page.
//     Pt; Pl denotes the target location.
//     Pp denotes the target page.
// NOTE: xterm doesn't enable this code by default.
Terminal.prototype.copyRectangle = function(params) {
  ;
};

// CSI Pt ; Pl ; Pb ; Pr ' w
//   Enable Filter Rectangle (DECEFR), VT420 and up.
//   Parameters are [top;left;bottom;right].
//   Defines the coordinates of a filter rectangle and activates
//   it.  Anytime the locator is detected outside of the filter
//   rectangle, an outside rectangle event is generated and the
//   rectangle is disabled.  Filter rectangles are always treated
//   as "one-shot" events.  Any parameters that are omitted default
//   to the current locator position.  If all parameters are omit-
//   ted, any locator motion will be reported.  DECELR always can-
//   cels any prevous rectangle definition.
Terminal.prototype.enableFilterRectangle = function(params) {
  ;
};

// CSI Ps x  Request Terminal Parameters (DECREQTPARM).
//   if Ps is a "0" (default) or "1", and xterm is emulating VT100,
//   the control sequence elicits a response of the same form whose
//   parameters describe the terminal:
//     Ps -> the given Ps incremented by 2.
//     Pn = 1  <- no parity.
//     Pn = 1  <- eight bits.
//     Pn = 1  <- 2  8  transmit 38.4k baud.
//     Pn = 1  <- 2  8  receive 38.4k baud.
//     Pn = 1  <- clock multiplier.
//     Pn = 0  <- STP flags.
Terminal.prototype.requestParameters = function(params) {
  ;
};

// CSI Ps x  Select Attribute Change Extent (DECSACE).
//     Ps = 0  -> from start to end position, wrapped.
//     Ps = 1  -> from start to end position, wrapped.
//     Ps = 2  -> rectangle (exact).
Terminal.prototype.selectChangeExtent = function(params) {
  ;
};

// CSI Pc; Pt; Pl; Pb; Pr$ x
//   Fill Rectangular Area (DECFRA), VT420 and up.
//     Pc is the character to use.
//     Pt; Pl; Pb; Pr denotes the rectangle.
// NOTE: xterm doesn't enable this code by default.
Terminal.prototype.fillRectangle = function(params) {
  var ch = params[0]
    , t = params[1]
    , l = params[2]
    , b = params[3]
    , r = params[4];

  var line
    , i;

  for (; t < b + 1; t++) {
    line = this.lines[this.ybase + t];
    for (i = l; i < r; i++) {
      line[i] = [line[i][0], String.fromCharCode(ch)];
    }
  }

  // this.maxRange();
  this.updateRange(params[1]);
  this.updateRange(params[3]);
};

// CSI Ps ; Pu ' z
//   Enable Locator Reporting (DECELR).
//   Valid values for the first parameter:
//     Ps = 0  -> Locator disabled (default).
//     Ps = 1  -> Locator enabled.
//     Ps = 2  -> Locator enabled for one report, then disabled.
//   The second parameter specifies the coordinate unit for locator
//   reports.
//   Valid values for the second parameter:
//     Pu = 0  <- or omitted -> default to character cells.
//     Pu = 1  <- device physical pixels.
//     Pu = 2  <- character cells.
Terminal.prototype.enableLocatorReporting = function(params) {
  var val = params[0] > 0;
  //this.mouseEvents = val;
  //this.decLocator = val;
};

// CSI Pt; Pl; Pb; Pr$ z
//   Erase Rectangular Area (DECERA), VT400 and up.
//     Pt; Pl; Pb; Pr denotes the rectangle.
// NOTE: xterm doesn't enable this code by default.
Terminal.prototype.eraseRectangle = function(params) {
  var t = params[0]
    , l = params[1]
    , b = params[2]
    , r = params[3];

  var line
    , i
    , ch;

  ch = [this.eraseAttr(), ' ']; // xterm?

  for (; t < b + 1; t++) {
    line = this.lines[this.ybase + t];
    for (i = l; i < r; i++) {
      line[i] = ch;
    }
  }

  // this.maxRange();
  this.updateRange(params[0]);
  this.updateRange(params[2]);
};

// CSI Pm ' {
//   Select Locator Events (DECSLE).
//   Valid values for the first (and any additional parameters)
//   are:
//     Ps = 0  -> only respond to explicit host requests (DECRQLP).
//                (This is default).  It also cancels any filter
//   rectangle.
//     Ps = 1  -> report button down transitions.
//     Ps = 2  -> do not report button down transitions.
//     Ps = 3  -> report button up transitions.
//     Ps = 4  -> do not report button up transitions.
Terminal.prototype.setLocatorEvents = function(params) {
  ;
};

// CSI Pt; Pl; Pb; Pr$ {
//   Selective Erase Rectangular Area (DECSERA), VT400 and up.
//     Pt; Pl; Pb; Pr denotes the rectangle.
Terminal.prototype.selectiveEraseRectangle = function(params) {
  ;
};

// CSI Ps ' |
//   Request Locator Position (DECRQLP).
//   Valid values for the parameter are:
//     Ps = 0 , 1 or omitted -> transmit a single DECLRP locator
//     report.

//   If Locator Reporting has been enabled by a DECELR, xterm will
//   respond with a DECLRP Locator Report.  This report is also
//   generated on button up and down events if they have been
//   enabled with a DECSLE, or when the locator is detected outside
//   of a filter rectangle, if filter rectangles have been enabled
//   with a DECEFR.

//     -> CSI Pe ; Pb ; Pr ; Pc ; Pp &  w

//   Parameters are [event;button;row;column;page].
//   Valid values for the event:
//     Pe = 0  -> locator unavailable - no other parameters sent.
//     Pe = 1  -> request - xterm received a DECRQLP.
//     Pe = 2  -> left button down.
//     Pe = 3  -> left button up.
//     Pe = 4  -> middle button down.
//     Pe = 5  -> middle button up.
//     Pe = 6  -> right button down.
//     Pe = 7  -> right button up.
//     Pe = 8  -> M4 button down.
//     Pe = 9  -> M4 button up.
//     Pe = 1 0  -> locator outside filter rectangle.
//   ``button'' parameter is a bitmask indicating which buttons are
//     pressed:
//     Pb = 0  <- no buttons down.
//     Pb & 1  <- right button down.
//     Pb & 2  <- middle button down.
//     Pb & 4  <- left button down.
//     Pb & 8  <- M4 button down.
//   ``row'' and ``column'' parameters are the coordinates of the
//     locator position in the xterm window, encoded as ASCII deci-
//     mal.
//   The ``page'' parameter is not used by xterm, and will be omit-
//   ted.
Terminal.prototype.requestLocatorPosition = function(params) {
  ;
};

// CSI P m SP }
// Insert P s Column(s) (default = 1) (DECIC), VT420 and up.
// NOTE: xterm doesn't enable this code by default.
Terminal.prototype.insertColumns = function() {
  var param = params[0]
    , l = this.ybase + this.rows
    , ch = [this.eraseAttr(), ' '] // xterm?
    , i;

  while (param--) {
    for (i = this.ybase; i < l; i++) {
      this.lines[i].splice(this.x + 1, 0, ch);
      this.lines[i].pop();
    }
  }

  this.maxRange();
};

// CSI P m SP ~
// Delete P s Column(s) (default = 1) (DECDC), VT420 and up
// NOTE: xterm doesn't enable this code by default.
Terminal.prototype.deleteColumns = function() {
  var param = params[0]
    , l = this.ybase + this.rows
    , ch = [this.eraseAttr(), ' '] // xterm?
    , i;

  while (param--) {
    for (i = this.ybase; i < l; i++) {
      this.lines[i].splice(this.x, 1);
      this.lines[i].push(ch);
    }
  }

  this.maxRange();
};

/**
 * Prefix/Select/Visual/Search Modes
 */

Terminal.prototype.enterPrefix = function() {
  this.prefixMode = true;
};

Terminal.prototype.leavePrefix = function() {
  this.prefixMode = false;
};

Terminal.prototype.enterSelect = function() {
  this._real = {
    x: this.x,
    y: this.y,
    ydisp: this.ydisp,
    ybase: this.ybase,
    cursorHidden: this.cursorHidden,
    lines: this.copyBuffer(this.lines),
    write: this.write
  };
  this.write = function() {};
  this.selectMode = true;
  this.visualMode = false;
  this.cursorHidden = false;
  this.refresh(this.y, this.y);
};

Terminal.prototype.leaveSelect = function() {
  this.x = this._real.x;
  this.y = this._real.y;
  this.ydisp = this._real.ydisp;
  this.ybase = this._real.ybase;
  this.cursorHidden = this._real.cursorHidden;
  this.lines = this._real.lines;
  this.write = this._real.write;
  delete this._real;
  this.selectMode = false;
  this.visualMode = false;
  this.refresh(0, this.rows - 1);
};

Terminal.prototype.enterVisual = function() {
  this._real.preVisual = this.copyBuffer(this.lines);
  this.selectText(this.x, this.x, this.ydisp + this.y, this.ydisp + this.y);
  this.visualMode = true;
};

Terminal.prototype.leaveVisual = function() {
  this.lines = this._real.preVisual;
  delete this._real.preVisual;
  delete this._selected;
  this.visualMode = false;
  this.refresh(0, this.rows - 1);
};

Terminal.prototype.enterSearch = function(down) {
  this.entry = '';
  this.searchMode = true;
  this.searchDown = down;
  this._real.preSearch = this.copyBuffer(this.lines);
  this._real.preSearchX = this.x;
  this._real.preSearchY = this.y;

  var bottom = this.ydisp + this.rows - 1;
  for (var i = 0; i < this.entryPrefix.length; i++) {
    //this.lines[bottom][i][0] = (this.defAttr & ~0x1ff) | 4;
    //this.lines[bottom][i][1] = this.entryPrefix[i];
    this.lines[bottom][i] = [
      (this.defAttr & ~0x1ff) | 4,
      this.entryPrefix[i]
    ];
  }

  this.y = this.rows - 1;
  this.x = this.entryPrefix.length;

  this.refresh(this.rows - 1, this.rows - 1);
};

Terminal.prototype.leaveSearch = function() {
  this.searchMode = false;

  if (this._real.preSearch) {
    this.lines = this._real.preSearch;
    this.x = this._real.preSearchX;
    this.y = this._real.preSearchY;
    delete this._real.preSearch;
    delete this._real.preSearchX;
    delete this._real.preSearchY;
  }

  this.refresh(this.rows - 1, this.rows - 1);
};

Terminal.prototype.copyBuffer = function(lines) {
  var lines = lines || this.lines
    , out = [];

  for (var y = 0; y < lines.length; y++) {
    out[y] = [];
    for (var x = 0; x < lines[y].length; x++) {
      out[y][x] = [lines[y][x][0], lines[y][x][1]];
    }
  }

  return out;
};

Terminal.prototype.getCopyTextarea = function(text) {
  var textarea = this._copyTextarea
    , document = this.document;

  if (!textarea) {
    textarea = document.createElement('textarea');
    textarea.style.position = 'absolute';
    textarea.style.left = '-32000px';
    textarea.style.top = '-32000px';
    textarea.style.width = '0px';
    textarea.style.height = '0px';
    textarea.style.opacity = '0';
    textarea.style.backgroundColor = 'transparent';
    textarea.style.borderStyle = 'none';
    textarea.style.outlineStyle = 'none';

    document.getElementsByTagName('body')[0].appendChild(textarea);

    this._copyTextarea = textarea;
  }

  return textarea;
};

// NOTE: Only works for primary selection on X11.
// Non-X11 users should use Ctrl-C instead.
Terminal.prototype.copyText = function(text) {
  var self = this
    , textarea = this.getCopyTextarea();

  this.emit('copy', text);

  textarea.focus();
  textarea.textContent = text;
  textarea.value = text;
  textarea.setSelectionRange(0, text.length);

  setTimeout(function() {
    self.element.focus();
    self.focus();
  }, 1);
};

Terminal.prototype.selectText = function(x1, x2, y1, y2) {
  var ox1
    , ox2
    , oy1
    , oy2
    , tmp
    , x
    , y
    , xl
    , attr;

  if (this._selected) {
    ox1 = this._selected.x1;
    ox2 = this._selected.x2;
    oy1 = this._selected.y1;
    oy2 = this._selected.y2;

    if (oy2 < oy1) {
      tmp = ox2;
      ox2 = ox1;
      ox1 = tmp;
      tmp = oy2;
      oy2 = oy1;
      oy1 = tmp;
    }

    if (ox2 < ox1 && oy1 === oy2) {
      tmp = ox2;
      ox2 = ox1;
      ox1 = tmp;
    }

    for (y = oy1; y <= oy2; y++) {
      x = 0;
      xl = this.cols - 1;
      if (y === oy1) {
        x = ox1;
      }
      if (y === oy2) {
        xl = ox2;
      }
      for (; x <= xl; x++) {
        if (this.lines[y][x].old != null) {
          //this.lines[y][x][0] = this.lines[y][x].old;
          //delete this.lines[y][x].old;
          attr = this.lines[y][x].old;
          delete this.lines[y][x].old;
          this.lines[y][x] = [attr, this.lines[y][x][1]];
        }
      }
    }

    y1 = this._selected.y1;
    x1 = this._selected.x1;
  }

  y1 = Math.max(y1, 0);
  y1 = Math.min(y1, this.ydisp + this.rows - 1);

  y2 = Math.max(y2, 0);
  y2 = Math.min(y2, this.ydisp + this.rows - 1);

  this._selected = { x1: x1, x2: x2, y1: y1, y2: y2 };

  if (y2 < y1) {
    tmp = x2;
    x2 = x1;
    x1 = tmp;
    tmp = y2;
    y2 = y1;
    y1 = tmp;
  }

  if (x2 < x1 && y1 === y2) {
    tmp = x2;
    x2 = x1;
    x1 = tmp;
  }

  for (y = y1; y <= y2; y++) {
    x = 0;
    xl = this.cols - 1;
    if (y === y1) {
      x = x1;
    }
    if (y === y2) {
      xl = x2;
    }
    for (; x <= xl; x++) {
      //this.lines[y][x].old = this.lines[y][x][0];
      //this.lines[y][x][0] &= ~0x1ff;
      //this.lines[y][x][0] |= (0x1ff << 9) | 4;
      attr = this.lines[y][x][0];
      this.lines[y][x] = [
        (attr & ~0x1ff) | ((0x1ff << 9) | 4),
        this.lines[y][x][1]
      ];
      this.lines[y][x].old = attr;
    }
  }

  y1 = y1 - this.ydisp;
  y2 = y2 - this.ydisp;

  y1 = Math.max(y1, 0);
  y1 = Math.min(y1, this.rows - 1);

  y2 = Math.max(y2, 0);
  y2 = Math.min(y2, this.rows - 1);

  //this.refresh(y1, y2);
  this.refresh(0, this.rows - 1);
};

Terminal.prototype.grabText = function(x1, x2, y1, y2) {
  var out = ''
    , buf = ''
    , ch
    , x
    , y
    , xl
    , tmp;

  if (y2 < y1) {
    tmp = x2;
    x2 = x1;
    x1 = tmp;
    tmp = y2;
    y2 = y1;
    y1 = tmp;
  }

  if (x2 < x1 && y1 === y2) {
    tmp = x2;
    x2 = x1;
    x1 = tmp;
  }

  for (y = y1; y <= y2; y++) {
    x = 0;
    xl = this.cols - 1;
    if (y === y1) {
      x = x1;
    }
    if (y === y2) {
      xl = x2;
    }
    for (; x <= xl; x++) {
      ch = this.lines[y][x][1];
      if (ch === ' ') {
        buf += ch;
        continue;
      }
      if (buf) {
        out += buf;
        buf = '';
      }
      out += ch;
      if (isWide(ch)) x++;
    }
    buf = '';
    out += '\n';
  }

  // If we're not at the end of the
  // line, don't add a newline.
  for (x = x2, y = y2; x < this.cols; x++) {
    if (this.lines[y][x][1] !== ' ') {
      out = out.slice(0, -1);
      break;
    }
  }

  return out;
};

Terminal.prototype.keyPrefix = function(ev, key) {
  if (key === 'k' || key === '&') {
    this.destroy();
  } else if (key === 'p' || key === ']') {
    this.emit('request paste');
  } else if (key === 'c') {
    this.emit('request create');
  } else if (key >= '0' && key <= '9') {
    key = +key - 1;
    if (!~key) key = 9;
    this.emit('request term', key);
  } else if (key === 'n') {
    this.emit('request term next');
  } else if (key === 'P') {
    this.emit('request term previous');
  } else if (key === ':') {
    this.emit('request command mode');
  } else if (key === '[') {
    this.enterSelect();
  }
};

Terminal.prototype.keySelect = function(ev, key) {
  this.showCursor();

  if (this.searchMode || key === 'n' || key === 'N') {
    return this.keySearch(ev, key);
  }

  if (key === '\x04') { // ctrl-d
    var y = this.ydisp + this.y;
    if (this.ydisp === this.ybase) {
      // Mimic vim behavior
      this.y = Math.min(this.y + (this.rows - 1) / 2 | 0, this.rows - 1);
      this.refresh(0, this.rows - 1);
    } else {
      this.scrollDisp((this.rows - 1) / 2 | 0);
    }
    if (this.visualMode) {
      this.selectText(this.x, this.x, y, this.ydisp + this.y);
    }
    return;
  }

  if (key === '\x15') { // ctrl-u
    var y = this.ydisp + this.y;
    if (this.ydisp === 0) {
      // Mimic vim behavior
      this.y = Math.max(this.y - (this.rows - 1) / 2 | 0, 0);
      this.refresh(0, this.rows - 1);
    } else {
      this.scrollDisp(-(this.rows - 1) / 2 | 0);
    }
    if (this.visualMode) {
      this.selectText(this.x, this.x, y, this.ydisp + this.y);
    }
    return;
  }

  if (key === '\x06') { // ctrl-f
    var y = this.ydisp + this.y;
    this.scrollDisp(this.rows - 1);
    if (this.visualMode) {
      this.selectText(this.x, this.x, y, this.ydisp + this.y);
    }
    return;
  }

  if (key === '\x02') { // ctrl-b
    var y = this.ydisp + this.y;
    this.scrollDisp(-(this.rows - 1));
    if (this.visualMode) {
      this.selectText(this.x, this.x, y, this.ydisp + this.y);
    }
    return;
  }

  if (key === 'k' || key === '\x1b[A') {
    var y = this.ydisp + this.y;
    this.y--;
    if (this.y < 0) {
      this.y = 0;
      this.scrollDisp(-1);
    }
    if (this.visualMode) {
      this.selectText(this.x, this.x, y, this.ydisp + this.y);
    } else {
      this.refresh(this.y, this.y + 1);
    }
    return;
  }

  if (key === 'j' || key === '\x1b[B') {
    var y = this.ydisp + this.y;
    this.y++;
    if (this.y >= this.rows) {
      this.y = this.rows - 1;
      this.scrollDisp(1);
    }
    if (this.visualMode) {
      this.selectText(this.x, this.x, y, this.ydisp + this.y);
    } else {
      this.refresh(this.y - 1, this.y);
    }
    return;
  }

  if (key === 'h' || key === '\x1b[D') {
    var x = this.x;
    this.x--;
    if (this.x < 0) {
      this.x = 0;
    }
    if (this.visualMode) {
      this.selectText(x, this.x, this.ydisp + this.y, this.ydisp + this.y);
    } else {
      this.refresh(this.y, this.y);
    }
    return;
  }

  if (key === 'l' || key === '\x1b[C') {
    var x = this.x;
    this.x++;
    if (this.x >= this.cols) {
      this.x = this.cols - 1;
    }
    if (this.visualMode) {
      this.selectText(x, this.x, this.ydisp + this.y, this.ydisp + this.y);
    } else {
      this.refresh(this.y, this.y);
    }
    return;
  }

  if (key === 'v' || key === ' ') {
    if (!this.visualMode) {
      this.enterVisual();
    } else {
      this.leaveVisual();
    }
    return;
  }

  if (key === 'y') {
    if (this.visualMode) {
      var text = this.grabText(
        this._selected.x1, this._selected.x2,
        this._selected.y1, this._selected.y2);
      this.copyText(text);
      this.leaveVisual();
      // this.leaveSelect();
    }
    return;
  }

  if (key === 'q' || key === '\x1b') {
    if (this.visualMode) {
      this.leaveVisual();
    } else {
      this.leaveSelect();
    }
    return;
  }

  if (key === 'w' || key === 'W') {
    var ox = this.x;
    var oy = this.y;
    var oyd = this.ydisp;

    var x = this.x;
    var y = this.y;
    var yb = this.ydisp;
    var saw_space = false;

    for (;;) {
      var line = this.lines[yb + y];
      while (x < this.cols) {
        if (line[x][1] <= ' ') {
          saw_space = true;
        } else if (saw_space) {
          break;
        }
        x++;
      }
      if (x >= this.cols) x = this.cols - 1;
      if (x === this.cols - 1 && line[x][1] <= ' ') {
        x = 0;
        if (++y >= this.rows) {
          y--;
          if (++yb > this.ybase) {
            yb = this.ybase;
            x = this.x;
            break;
          }
        }
        continue;
      }
      break;
    }

    this.x = x, this.y = y;
    this.scrollDisp(-this.ydisp + yb);

    if (this.visualMode) {
      this.selectText(ox, this.x, oy + oyd, this.ydisp + this.y);
    }
    return;
  }

  if (key === 'b' || key === 'B') {
    var ox = this.x;
    var oy = this.y;
    var oyd = this.ydisp;

    var x = this.x;
    var y = this.y;
    var yb = this.ydisp;

    for (;;) {
      var line = this.lines[yb + y];
      var saw_space = x > 0 && line[x][1] > ' ' && line[x - 1][1] > ' ';
      while (x >= 0) {
        if (line[x][1] <= ' ') {
          if (saw_space && (x + 1 < this.cols && line[x + 1][1] > ' ')) {
            x++;
            break;
          } else {
            saw_space = true;
          }
        }
        x--;
      }
      if (x < 0) x = 0;
      if (x === 0 && (line[x][1] <= ' ' || !saw_space)) {
        x = this.cols - 1;
        if (--y < 0) {
          y++;
          if (--yb < 0) {
            yb++;
            x = 0;
            break;
          }
        }
        continue;
      }
      break;
    }

    this.x = x, this.y = y;
    this.scrollDisp(-this.ydisp + yb);

    if (this.visualMode) {
      this.selectText(ox, this.x, oy + oyd, this.ydisp + this.y);
    }
    return;
  }

  if (key === 'e' || key === 'E') {
    var x = this.x + 1;
    var y = this.y;
    var yb = this.ydisp;
    if (x >= this.cols) x--;

    for (;;) {
      var line = this.lines[yb + y];
      while (x < this.cols) {
        if (line[x][1] <= ' ') {
          x++;
        } else {
          break;
        }
      }
      while (x < this.cols) {
        if (line[x][1] <= ' ') {
          if (x - 1 >= 0 && line[x - 1][1] > ' ') {
            x--;
            break;
          }
        }
        x++;
      }
      if (x >= this.cols) x = this.cols - 1;
      if (x === this.cols - 1 && line[x][1] <= ' ') {
        x = 0;
        if (++y >= this.rows) {
          y--;
          if (++yb > this.ybase) {
            yb = this.ybase;
            break;
          }
        }
        continue;
      }
      break;
    }

    this.x = x, this.y = y;
    this.scrollDisp(-this.ydisp + yb);

    if (this.visualMode) {
      this.selectText(ox, this.x, oy + oyd, this.ydisp + this.y);
    }
    return;
  }

  if (key === '^' || key === '0') {
    var ox = this.x;

    if (key === '0') {
      this.x = 0;
    } else if (key === '^') {
      var line = this.lines[this.ydisp + this.y];
      var x = 0;
      while (x < this.cols) {
        if (line[x][1] > ' ') {
          break;
        }
        x++;
      }
      if (x >= this.cols) x = this.cols - 1;
      this.x = x;
    }

    if (this.visualMode) {
      this.selectText(ox, this.x, this.ydisp + this.y, this.ydisp + this.y);
    } else {
      this.refresh(this.y, this.y);
    }
    return;
  }

  if (key === '$') {
    var ox = this.x;
    var line = this.lines[this.ydisp + this.y];
    var x = this.cols - 1;
    while (x >= 0) {
      if (line[x][1] > ' ') {
        if (this.visualMode && x < this.cols - 1) x++;
        break;
      }
      x--;
    }
    if (x < 0) x = 0;
    this.x = x;
    if (this.visualMode) {
      this.selectText(ox, this.x, this.ydisp + this.y, this.ydisp + this.y);
    } else {
      this.refresh(this.y, this.y);
    }
    return;
  }

  if (key === 'g' || key === 'G') {
    var ox = this.x;
    var oy = this.y;
    var oyd = this.ydisp;
    if (key === 'g') {
      this.x = 0, this.y = 0;
      this.scrollDisp(-this.ydisp);
    } else if (key === 'G') {
      this.x = 0, this.y = this.rows - 1;
      this.scrollDisp(this.ybase);
    }
    if (this.visualMode) {
      this.selectText(ox, this.x, oy + oyd, this.ydisp + this.y);
    }
    return;
  }

  if (key === 'H' || key === 'M' || key === 'L') {
    var ox = this.x;
    var oy = this.y;
    if (key === 'H') {
      this.x = 0, this.y = 0;
    } else if (key === 'M') {
      this.x = 0, this.y = this.rows / 2 | 0;
    } else if (key === 'L') {
      this.x = 0, this.y = this.rows - 1;
    }
    if (this.visualMode) {
      this.selectText(ox, this.x, this.ydisp + oy, this.ydisp + this.y);
    } else {
      this.refresh(oy, oy);
      this.refresh(this.y, this.y);
    }
    return;
  }

  if (key === '{' || key === '}') {
    var ox = this.x;
    var oy = this.y;
    var oyd = this.ydisp;

    var line;
    var saw_full = false;
    var found = false;
    var first_is_space = -1;
    var y = this.y + (key === '{' ? -1 : 1);
    var yb = this.ydisp;
    var i;

    if (key === '{') {
      if (y < 0) {
        y++;
        if (yb > 0) yb--;
      }
    } else if (key === '}') {
      if (y >= this.rows) {
        y--;
        if (yb < this.ybase) yb++;
      }
    }

    for (;;) {
      line = this.lines[yb + y];

      for (i = 0; i < this.cols; i++) {
        if (line[i][1] > ' ') {
          if (first_is_space === -1) {
            first_is_space = 0;
          }
          saw_full = true;
          break;
        } else if (i === this.cols - 1) {
          if (first_is_space === -1) {
            first_is_space = 1;
          } else if (first_is_space === 0) {
            found = true;
          } else if (first_is_space === 1) {
            if (saw_full) found = true;
          }
          break;
        }
      }

      if (found) break;

      if (key === '{') {
        y--;
        if (y < 0) {
          y++;
          if (yb > 0) yb--;
          else break;
        }
      } else if (key === '}') {
        y++;
        if (y >= this.rows) {
          y--;
          if (yb < this.ybase) yb++;
          else break;
        }
      }
    }

    if (!found) {
      if (key === '{') {
        y = 0;
        yb = 0;
      } else if (key === '}') {
        y = this.rows - 1;
        yb = this.ybase;
      }
    }

    this.x = 0, this.y = y;
    this.scrollDisp(-this.ydisp + yb);

    if (this.visualMode) {
      this.selectText(ox, this.x, oy + oyd, this.ydisp + this.y);
    }
    return;
  }

  if (key === '/' || key === '?') {
    if (!this.visualMode) {
      this.enterSearch(key === '/');
    }
    return;
  }

  return false;
};

Terminal.prototype.keySearch = function(ev, key) {
  if (key === '\x1b') {
    this.leaveSearch();
    return;
  }

  if (key === '\r' || (!this.searchMode && (key === 'n' || key === 'N'))) {
    this.leaveSearch();

    var entry = this.entry;

    if (!entry) {
      this.refresh(0, this.rows - 1);
      return;
    }

    var ox = this.x;
    var oy = this.y;
    var oyd = this.ydisp;

    var line;
    var found = false;
    var wrapped = false;
    var x = this.x + 1;
    var y = this.ydisp + this.y;
    var yb, i;
    var up = key === 'N'
      ? this.searchDown
      : !this.searchDown;

    for (;;) {
      line = this.lines[y];

      while (x < this.cols) {
        for (i = 0; i < entry.length; i++) {
          if (x + i >= this.cols) break;
          if (line[x + i][1] !== entry[i]) {
            break;
          } else if (line[x + i][1] === entry[i] && i === entry.length - 1) {
            found = true;
            break;
          }
        }
        if (found) break;
        x += i + 1;
      }
      if (found) break;

      x = 0;

      if (!up) {
        y++;
        if (y > this.ybase + this.rows - 1) {
          if (wrapped) break;
          // this.setMessage('Search wrapped. Continuing at TOP.');
          wrapped = true;
          y = 0;
        }
      } else {
        y--;
        if (y < 0) {
          if (wrapped) break;
          // this.setMessage('Search wrapped. Continuing at BOTTOM.');
          wrapped = true;
          y = this.ybase + this.rows - 1;
        }
      }
    }

    if (found) {
      if (y - this.ybase < 0) {
        yb = y;
        y = 0;
        if (yb > this.ybase) {
          y = yb - this.ybase;
          yb = this.ybase;
        }
      } else {
        yb = this.ybase;
        y -= this.ybase;
      }

      this.x = x, this.y = y;
      this.scrollDisp(-this.ydisp + yb);

      if (this.visualMode) {
        this.selectText(ox, this.x, oy + oyd, this.ydisp + this.y);
      }
      return;
    }

    // this.setMessage("No matches found.");
    this.refresh(0, this.rows - 1);

    return;
  }

  if (key === '\b' || key === '\x7f') {
    if (this.entry.length === 0) return;
    var bottom = this.ydisp + this.rows - 1;
    this.entry = this.entry.slice(0, -1);
    var i = this.entryPrefix.length + this.entry.length;
    //this.lines[bottom][i][1] = ' ';
    this.lines[bottom][i] = [
      this.lines[bottom][i][0],
      ' '
    ];
    this.x--;
    this.refresh(this.rows - 1, this.rows - 1);
    this.refresh(this.y, this.y);
    return;
  }

  if (key.length === 1 && key >= ' ' && key <= '~') {
    var bottom = this.ydisp + this.rows - 1;
    this.entry += key;
    var i = this.entryPrefix.length + this.entry.length - 1;
    //this.lines[bottom][i][0] = (this.defAttr & ~0x1ff) | 4;
    //this.lines[bottom][i][1] = key;
    this.lines[bottom][i] = [
      (this.defAttr & ~0x1ff) | 4,
      key
    ];
    this.x++;
    this.refresh(this.rows - 1, this.rows - 1);
    this.refresh(this.y, this.y);
    return;
  }

  return false;
};

/**
 * Character Sets
 */

Terminal.charsets = {};

// DEC Special Character and Line Drawing Set.
// http://vt100.net/docs/vt102-ug/table5-13.html
// A lot of curses apps use this if they see TERM=xterm.
// testing: echo -e '\e(0a\e(B'
// The xterm output sometimes seems to conflict with the
// reference above. xterm seems in line with the reference
// when running vttest however.
// The table below now uses xterm's output from vttest.
Terminal.charsets.SCLD = { // (0
  '`': '\u25c6', // '◆'
  'a': '\u2592', // '▒'
  'b': '\u0009', // '\t'
  'c': '\u000c', // '\f'
  'd': '\u000d', // '\r'
  'e': '\u000a', // '\n'
  'f': '\u00b0', // '°'
  'g': '\u00b1', // '±'
  'h': '\u2424', // '\u2424' (NL)
  'i': '\u000b', // '\v'
  'j': '\u2518', // '┘'
  'k': '\u2510', // '┐'
  'l': '\u250c', // '┌'
  'm': '\u2514', // '└'
  'n': '\u253c', // '┼'
  'o': '\u23ba', // '⎺'
  'p': '\u23bb', // '⎻'
  'q': '\u2500', // '─'
  'r': '\u23bc', // '⎼'
  's': '\u23bd', // '⎽'
  't': '\u251c', // '├'
  'u': '\u2524', // '┤'
  'v': '\u2534', // '┴'
  'w': '\u252c', // '┬'
  'x': '\u2502', // '│'
  'y': '\u2264', // '≤'
  'z': '\u2265', // '≥'
  '{': '\u03c0', // 'π'
  '|': '\u2260', // '≠'
  '}': '\u00a3', // '£'
  '~': '\u00b7'  // '·'
};

Terminal.charsets.UK = null; // (A
Terminal.charsets.US = null; // (B (USASCII)
Terminal.charsets.Dutch = null; // (4
Terminal.charsets.Finnish = null; // (C or (5
Terminal.charsets.French = null; // (R
Terminal.charsets.FrenchCanadian = null; // (Q
Terminal.charsets.German = null; // (K
Terminal.charsets.Italian = null; // (Y
Terminal.charsets.NorwegianDanish = null; // (E or (6
Terminal.charsets.Spanish = null; // (Z
Terminal.charsets.Swedish = null; // (H or (7
Terminal.charsets.Swiss = null; // (=
Terminal.charsets.ISOLatin = null; // /A

/**
 * Helpers
 */

function on(el, type, handler, capture) {
  el.addEventListener(type, handler, capture || false);
}

function off(el, type, handler, capture) {
  el.removeEventListener(type, handler, capture || false);
}

function cancel(ev) {
  if (ev.preventDefault) ev.preventDefault();
  ev.returnValue = false;
  if (ev.stopPropagation) ev.stopPropagation();
  ev.cancelBubble = true;
  return false;
}

function inherits(child, parent) {
  function f() {
    this.constructor = child;
  }
  f.prototype = parent.prototype;
  child.prototype = new f;
}

// if bold is broken, we can't
// use it in the terminal.
function isBoldBroken(document) {
  var body = document.getElementsByTagName('body')[0];
  var el = document.createElement('span');
  el.innerHTML = 'hello world';
  body.appendChild(el);
  var w1 = el.scrollWidth;
  el.style.fontWeight = 'bold';
  var w2 = el.scrollWidth;
  body.removeChild(el);
  return w1 !== w2;
}

var String = this.String;
var setTimeout = this.setTimeout;
var setInterval = this.setInterval;

function indexOf(obj, el) {
  var i = obj.length;
  while (i--) {
    if (obj[i] === el) return i;
  }
  return -1;
}

function isWide(ch) {
  if (ch <= '\uff00') return false;
  return (ch >= '\uff01' && ch <= '\uffbe')
      || (ch >= '\uffc2' && ch <= '\uffc7')
      || (ch >= '\uffca' && ch <= '\uffcf')
      || (ch >= '\uffd2' && ch <= '\uffd7')
      || (ch >= '\uffda' && ch <= '\uffdc')
      || (ch >= '\uffe0' && ch <= '\uffe6')
      || (ch >= '\uffe8' && ch <= '\uffee');
}

function matchColor(r1, g1, b1) {
  var hash = (r1 << 16) | (g1 << 8) | b1;

  if (matchColor._cache[hash] != null) {
    return matchColor._cache[hash];
  }

  var ldiff = Infinity
    , li = -1
    , i = 0
    , c
    , r2
    , g2
    , b2
    , diff;

  for (; i < Terminal.vcolors.length; i++) {
    c = Terminal.vcolors[i];
    r2 = c[0];
    g2 = c[1];
    b2 = c[2];

    diff = matchColor.distance(r1, g1, b1, r2, g2, b2);

    if (diff === 0) {
      li = i;
      break;
    }

    if (diff < ldiff) {
      ldiff = diff;
      li = i;
    }
  }

  return matchColor._cache[hash] = li;
}

matchColor._cache = {};

// http://stackoverflow.com/questions/1633828
matchColor.distance = function(r1, g1, b1, r2, g2, b2) {
  return Math.pow(30 * (r1 - r2), 2)
    + Math.pow(59 * (g1 - g2), 2)
    + Math.pow(11 * (b1 - b2), 2);
};

function each(obj, iter, con) {
  if (obj.forEach) return obj.forEach(iter, con);
  for (var i = 0; i < obj.length; i++) {
    iter.call(con, obj[i], i, obj);
  }
}

function keys(obj) {
  if (Object.keys) return Object.keys(obj);
  var key, keys = [];
  for (key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Expose
 */

Terminal.EventEmitter = EventEmitter;
Terminal.inherits = inherits;
Terminal.on = on;
Terminal.off = off;
Terminal.cancel = cancel;

if (typeof module !== 'undefined') {
  module.exports = Terminal;
} else {
  this.Terminal = Terminal;
}

}).call(function() {
  return this || (typeof window !== 'undefined' ? window : global);
}());

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],2:[function(require,module,exports){
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

},{"./ext/term.js":1,"./lib/editor.js":4,"./lib/parser.js":5,"./lib/player.js":6}],3:[function(require,module,exports){
function el(name, attrs, children) {
    var e = document.createElement(name);
    Object.keys(attrs).forEach(function (key) {
        e.setAttribute(key, attrs[key]);
    });
    children.forEach(function (child) {
        e.appendChild(child);
    });
    return e;
}

function txt(str) {
    return document.createTextNode(str);
}

function qsa(root, selector) {
    return Array.prototype.slice.call(root.querySelectorAll(selector), 0);
}

function qs(root, selector) {
    return root.querySelector(selector);
}

function on(root, eventSelectorHandlers) {
    Object.keys(eventSelectorHandlers).forEach(function (eventName) {
        root.addEventListener(eventName, function (event) {
            Object.keys(eventSelectorHandlers[eventName]).forEach(function (selector) {
                var possible = qsa(root, selector);
                var hit;
                for (var i = 0; i < possible.length; ++i) {
                    if (possible[i].contains(event.currentTarget)) {
                        hit = possible[i];
                        break;
                    }
                } 
                if (hit) {
                    var wrappedEvent = Object.create(event);
                    wrappedEvent.currentTarget = hit;
                    eventSelectorHandlers[eventName][selector](wrappedEvent);
                }
            });
        });
    });
}

function css(node, attrs) {
    Object.keys(attrs).forEach(function (attr) {
        node.style[attr] = attrs[attr];
    });
}

module.exports = {
    el: el,
    txt: txt,
    qsa: qsa,
    qs: qs,
    on: on,
    css: css
};

},{}],4:[function(require,module,exports){
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

},{"./dom.js":3}],5:[function(require,module,exports){
// Tradeoff: the browser allows for UTF-8 decoding of binary data through the
// Blob and FileReader interface, but this is an asynchronous API.
// This synchronous UTF-8 decoder is the most reasonable path forward.
function decodeUtf8(arr) {
    var result = '';
    for (var i = 0; i < arr.length; ++i) {
        var code = arr[i];
        var n;
        if (code & 0x80) {
            n = 0;
            if      ((arr[i] & 0x40) === 0) { throw new Error('Bad UTF-8 Sequence: mismatch'); }
            else if ((arr[i] & 0x20) === 0) { n = 1; code = arr[i] & 0x1F; }
            else if ((arr[i] & 0x10) === 0) { n = 2; code = arr[i] & 0x0F; }
            else if ((arr[i] & 0x08) === 0) { n = 3; code = arr[i] & 0x07; }
            else throw new Error('Bad UTF-8 Sequence: more than 6 additional chars');
            for (var j = 0; j < n; ++j) {
                i++;
                if (i >= arr.length) throw new Error('Bad UTF-8 Sequence: need more data');
                code = (code << 6) | arr[i] & 0x3F;
            }
            if (code > 0x10FFFF) throw new Error('Bad UTF-8 Sequence: code point too large');
            if (code > 0xFFFF) {
                var surrogate = code - 0x010000;
                var high = 0xD800 + ((surrogate & 0xFFC00) >> 10);
                var low  = 0xDC00 + (surrogate & 0x003FF);
                result += String.fromCharCode(high) + String.fromCharCode(low);
            } else {
                result += String.fromCharCode(code);
            }
        } else {
            result += String.fromCharCode(code);
        }
    }
    return result;
}

function Parser() {
}
Parser.prototype.parse = function (buffer) {
    // buffer is a list of header chunks followed by data chunks. 
    // A header chunk is two 32-byte little-endian unsigned integers:
    // - seconds
    // - microseconds
    // A data chunk is one 32-byte little-endian unsigned integer:
    // - length
    // followed by `length` bytes of terminal input data.
    // We assume this data is UTF-8 encoded.
    var chunks = [];
    var startTime = null;
    for (var offset = 0; offset < buffer.byteLength; ) {
        var header = new Uint32Array(buffer.slice(offset + 0, offset + 12));
        var sec = header[0];
        var usec = header[1];
        var len = header[2];
        var ms;
        if (startTime === null) {
            startTime = (sec * 1000) + (usec / 1000);
            ms = 0;
        } else {
            ms = (sec * 1000) + (usec / 1000) - startTime;
        }
        offset += 12;
        var data = decodeUtf8(new Uint8Array(buffer.slice(offset + 0, offset + len)));
        offset += len;
        chunks.push({
            ms: ms,
            data: data
        });
    }
    return chunks;
};
module.exports = Parser;

},{}],6:[function(require,module,exports){
function Player() {
    this._chunks = null;
    this._frame = 0;
    this._tickHandle = null;
    this.listeners = [];
}
Player.prototype.load = function (chunks) {
    this.rewind();
    this._chunks = chunks;
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

},{}]},{},[2])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJleHQvdGVybS5qcyIsImluZGV4LmpzIiwibGliL2RvbS5qcyIsImxpYi9lZGl0b3IuanMiLCJsaWIvcGFyc2VyLmpzIiwibGliL3BsYXllci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDbnBMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKipcbiAqIHRlcm0uanMgLSBhbiB4dGVybSBlbXVsYXRvclxuICogQ29weXJpZ2h0IChjKSAyMDEyLTIwMTMsIENocmlzdG9waGVyIEplZmZyZXkgKE1JVCBMaWNlbnNlKVxuICogaHR0cHM6Ly9naXRodWIuY29tL2NoamovdGVybS5qc1xuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbiAqIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiAqIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbiAqIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuICogZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpblxuICogYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOXG4gKiBUSEUgU09GVFdBUkUuXG4gKlxuICogT3JpZ2luYWxseSBmb3JrZWQgZnJvbSAod2l0aCB0aGUgYXV0aG9yJ3MgcGVybWlzc2lvbik6XG4gKiAgIEZhYnJpY2UgQmVsbGFyZCdzIGphdmFzY3JpcHQgdnQxMDAgZm9yIGpzbGludXg6XG4gKiAgIGh0dHA6Ly9iZWxsYXJkLm9yZy9qc2xpbnV4L1xuICogICBDb3B5cmlnaHQgKGMpIDIwMTEgRmFicmljZSBCZWxsYXJkXG4gKiAgIFRoZSBvcmlnaW5hbCBkZXNpZ24gcmVtYWlucy4gVGhlIHRlcm1pbmFsIGl0c2VsZlxuICogICBoYXMgYmVlbiBleHRlbmRlZCB0byBpbmNsdWRlIHh0ZXJtIENTSSBjb2RlcywgYW1vbmdcbiAqICAgb3RoZXIgZmVhdHVyZXMuXG4gKi9cblxuOyhmdW5jdGlvbigpIHtcblxuLyoqXG4gKiBUZXJtaW5hbCBFbXVsYXRpb24gUmVmZXJlbmNlczpcbiAqICAgaHR0cDovL3Z0MTAwLm5ldC9cbiAqICAgaHR0cDovL2ludmlzaWJsZS1pc2xhbmQubmV0L3h0ZXJtL2N0bHNlcXMvY3Rsc2Vxcy50eHRcbiAqICAgaHR0cDovL2ludmlzaWJsZS1pc2xhbmQubmV0L3h0ZXJtL2N0bHNlcXMvY3Rsc2Vxcy5odG1sXG4gKiAgIGh0dHA6Ly9pbnZpc2libGUtaXNsYW5kLm5ldC92dHRlc3QvXG4gKiAgIGh0dHA6Ly93d3cuaW53YXAuY29tL3BkcDEwL2Fuc2ljb2RlLnR4dFxuICogICBodHRwOi8vbGludXguZGllLm5ldC9tYW4vNC9jb25zb2xlX2NvZGVzXG4gKiAgIGh0dHA6Ly9saW51eC5kaWUubmV0L21hbi83L3VyeHZ0XG4gKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIFNoYXJlZFxuICovXG5cbnZhciB3aW5kb3cgPSB0aGlzXG4gICwgZG9jdW1lbnQgPSB0aGlzLmRvY3VtZW50O1xuXG4vKipcbiAqIEV2ZW50RW1pdHRlclxuICovXG5cbmZ1bmN0aW9uIEV2ZW50RW1pdHRlcigpIHtcbiAgdGhpcy5fZXZlbnRzID0gdGhpcy5fZXZlbnRzIHx8IHt9O1xufVxuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmFkZExpc3RlbmVyID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgdGhpcy5fZXZlbnRzW3R5cGVdID0gdGhpcy5fZXZlbnRzW3R5cGVdIHx8IFtdO1xuICB0aGlzLl9ldmVudHNbdHlwZV0ucHVzaChsaXN0ZW5lcik7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uID0gRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5hZGRMaXN0ZW5lcjtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVMaXN0ZW5lciA9IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyKSB7XG4gIGlmICghdGhpcy5fZXZlbnRzW3R5cGVdKSByZXR1cm47XG5cbiAgdmFyIG9iaiA9IHRoaXMuX2V2ZW50c1t0eXBlXVxuICAgICwgaSA9IG9iai5sZW5ndGg7XG5cbiAgd2hpbGUgKGktLSkge1xuICAgIGlmIChvYmpbaV0gPT09IGxpc3RlbmVyIHx8IG9ialtpXS5saXN0ZW5lciA9PT0gbGlzdGVuZXIpIHtcbiAgICAgIG9iai5zcGxpY2UoaSwgMSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICB9XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLm9mZiA9IEV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlTGlzdGVuZXI7XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlQWxsTGlzdGVuZXJzID0gZnVuY3Rpb24odHlwZSkge1xuICBpZiAodGhpcy5fZXZlbnRzW3R5cGVdKSBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbmNlID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgZnVuY3Rpb24gb24oKSB7XG4gICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIodHlwZSwgb24pO1xuICAgIHJldHVybiBsaXN0ZW5lci5hcHBseSh0aGlzLCBhcmdzKTtcbiAgfVxuICBvbi5saXN0ZW5lciA9IGxpc3RlbmVyO1xuICByZXR1cm4gdGhpcy5vbih0eXBlLCBvbik7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmVtaXQgPSBmdW5jdGlvbih0eXBlKSB7XG4gIGlmICghdGhpcy5fZXZlbnRzW3R5cGVdKSByZXR1cm47XG5cbiAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpXG4gICAgLCBvYmogPSB0aGlzLl9ldmVudHNbdHlwZV1cbiAgICAsIGwgPSBvYmoubGVuZ3RoXG4gICAgLCBpID0gMDtcblxuICBmb3IgKDsgaSA8IGw7IGkrKykge1xuICAgIG9ialtpXS5hcHBseSh0aGlzLCBhcmdzKTtcbiAgfVxufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5saXN0ZW5lcnMgPSBmdW5jdGlvbih0eXBlKSB7XG4gIHJldHVybiB0aGlzLl9ldmVudHNbdHlwZV0gPSB0aGlzLl9ldmVudHNbdHlwZV0gfHwgW107XG59O1xuXG4vKipcbiAqIFN0YXRlc1xuICovXG5cbnZhciBub3JtYWwgPSAwXG4gICwgZXNjYXBlZCA9IDFcbiAgLCBjc2kgPSAyXG4gICwgb3NjID0gM1xuICAsIGNoYXJzZXQgPSA0XG4gICwgZGNzID0gNVxuICAsIGlnbm9yZSA9IDY7XG5cbi8qKlxuICogVGVybWluYWxcbiAqL1xuXG5mdW5jdGlvbiBUZXJtaW5hbChvcHRpb25zKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgVGVybWluYWwpKSB7XG4gICAgcmV0dXJuIG5ldyBUZXJtaW5hbChhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSwgYXJndW1lbnRzWzJdKTtcbiAgfVxuXG4gIEV2ZW50RW1pdHRlci5jYWxsKHRoaXMpO1xuXG4gIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ251bWJlcicpIHtcbiAgICBvcHRpb25zID0ge1xuICAgICAgY29sczogYXJndW1lbnRzWzBdLFxuICAgICAgcm93czogYXJndW1lbnRzWzFdLFxuICAgICAgaGFuZGxlcjogYXJndW1lbnRzWzJdXG4gICAgfTtcbiAgfVxuXG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gIGVhY2goa2V5cyhUZXJtaW5hbC5kZWZhdWx0cyksIGZ1bmN0aW9uKGtleSkge1xuICAgIGlmIChvcHRpb25zW2tleV0gPT0gbnVsbCkge1xuICAgICAgb3B0aW9uc1trZXldID0gVGVybWluYWwub3B0aW9uc1trZXldO1xuICAgICAgLy8gTGVnYWN5OlxuICAgICAgaWYgKFRlcm1pbmFsW2tleV0gIT09IFRlcm1pbmFsLmRlZmF1bHRzW2tleV0pIHtcbiAgICAgICAgb3B0aW9uc1trZXldID0gVGVybWluYWxba2V5XTtcbiAgICAgIH1cbiAgICB9XG4gICAgc2VsZltrZXldID0gb3B0aW9uc1trZXldO1xuICB9KTtcblxuICBpZiAob3B0aW9ucy5jb2xvcnMubGVuZ3RoID09PSA4KSB7XG4gICAgb3B0aW9ucy5jb2xvcnMgPSBvcHRpb25zLmNvbG9ycy5jb25jYXQoVGVybWluYWwuX2NvbG9ycy5zbGljZSg4KSk7XG4gIH0gZWxzZSBpZiAob3B0aW9ucy5jb2xvcnMubGVuZ3RoID09PSAxNikge1xuICAgIG9wdGlvbnMuY29sb3JzID0gb3B0aW9ucy5jb2xvcnMuY29uY2F0KFRlcm1pbmFsLl9jb2xvcnMuc2xpY2UoMTYpKTtcbiAgfSBlbHNlIGlmIChvcHRpb25zLmNvbG9ycy5sZW5ndGggPT09IDEwKSB7XG4gICAgb3B0aW9ucy5jb2xvcnMgPSBvcHRpb25zLmNvbG9ycy5zbGljZSgwLCAtMikuY29uY2F0KFxuICAgICAgVGVybWluYWwuX2NvbG9ycy5zbGljZSg4LCAtMiksIG9wdGlvbnMuY29sb3JzLnNsaWNlKC0yKSk7XG4gIH0gZWxzZSBpZiAob3B0aW9ucy5jb2xvcnMubGVuZ3RoID09PSAxOCkge1xuICAgIG9wdGlvbnMuY29sb3JzID0gb3B0aW9ucy5jb2xvcnMuc2xpY2UoMCwgLTIpLmNvbmNhdChcbiAgICAgIFRlcm1pbmFsLl9jb2xvcnMuc2xpY2UoMTYsIC0yKSwgb3B0aW9ucy5jb2xvcnMuc2xpY2UoLTIpKTtcbiAgfVxuICB0aGlzLmNvbG9ycyA9IG9wdGlvbnMuY29sb3JzO1xuXG4gIHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG5cbiAgLy8gdGhpcy5jb250ZXh0ID0gb3B0aW9ucy5jb250ZXh0IHx8IHdpbmRvdztcbiAgLy8gdGhpcy5kb2N1bWVudCA9IG9wdGlvbnMuZG9jdW1lbnQgfHwgZG9jdW1lbnQ7XG4gIHRoaXMucGFyZW50ID0gb3B0aW9ucy5ib2R5IHx8IG9wdGlvbnMucGFyZW50XG4gICAgfHwgKGRvY3VtZW50ID8gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2JvZHknKVswXSA6IG51bGwpO1xuXG4gIHRoaXMuY29scyA9IG9wdGlvbnMuY29scyB8fCBvcHRpb25zLmdlb21ldHJ5WzBdO1xuICB0aGlzLnJvd3MgPSBvcHRpb25zLnJvd3MgfHwgb3B0aW9ucy5nZW9tZXRyeVsxXTtcblxuICBpZiAob3B0aW9ucy5oYW5kbGVyKSB7XG4gICAgdGhpcy5vbignZGF0YScsIG9wdGlvbnMuaGFuZGxlcik7XG4gIH1cblxuICB0aGlzLnliYXNlID0gMDtcbiAgdGhpcy55ZGlzcCA9IDA7XG4gIHRoaXMueCA9IDA7XG4gIHRoaXMueSA9IDA7XG4gIHRoaXMuY3Vyc29yU3RhdGUgPSAwO1xuICB0aGlzLmN1cnNvckhpZGRlbiA9IGZhbHNlO1xuICB0aGlzLmNvbnZlcnRFb2w7XG4gIHRoaXMuc3RhdGUgPSAwO1xuICB0aGlzLnF1ZXVlID0gJyc7XG4gIHRoaXMuc2Nyb2xsVG9wID0gMDtcbiAgdGhpcy5zY3JvbGxCb3R0b20gPSB0aGlzLnJvd3MgLSAxO1xuXG4gIC8vIG1vZGVzXG4gIHRoaXMuYXBwbGljYXRpb25LZXlwYWQgPSBmYWxzZTtcbiAgdGhpcy5hcHBsaWNhdGlvbkN1cnNvciA9IGZhbHNlO1xuICB0aGlzLm9yaWdpbk1vZGUgPSBmYWxzZTtcbiAgdGhpcy5pbnNlcnRNb2RlID0gZmFsc2U7XG4gIHRoaXMud3JhcGFyb3VuZE1vZGUgPSBmYWxzZTtcbiAgdGhpcy5ub3JtYWwgPSBudWxsO1xuXG4gIC8vIHNlbGVjdCBtb2Rlc1xuICB0aGlzLnByZWZpeE1vZGUgPSBmYWxzZTtcbiAgdGhpcy5zZWxlY3RNb2RlID0gZmFsc2U7XG4gIHRoaXMudmlzdWFsTW9kZSA9IGZhbHNlO1xuICB0aGlzLnNlYXJjaE1vZGUgPSBmYWxzZTtcbiAgdGhpcy5zZWFyY2hEb3duO1xuICB0aGlzLmVudHJ5ID0gJyc7XG4gIHRoaXMuZW50cnlQcmVmaXggPSAnU2VhcmNoOiAnO1xuICB0aGlzLl9yZWFsO1xuICB0aGlzLl9zZWxlY3RlZDtcbiAgdGhpcy5fdGV4dGFyZWE7XG5cbiAgLy8gY2hhcnNldFxuICB0aGlzLmNoYXJzZXQgPSBudWxsO1xuICB0aGlzLmdjaGFyc2V0ID0gbnVsbDtcbiAgdGhpcy5nbGV2ZWwgPSAwO1xuICB0aGlzLmNoYXJzZXRzID0gW251bGxdO1xuXG4gIC8vIG1vdXNlIHByb3BlcnRpZXNcbiAgdGhpcy5kZWNMb2NhdG9yO1xuICB0aGlzLngxME1vdXNlO1xuICB0aGlzLnZ0MjAwTW91c2U7XG4gIHRoaXMudnQzMDBNb3VzZTtcbiAgdGhpcy5ub3JtYWxNb3VzZTtcbiAgdGhpcy5tb3VzZUV2ZW50cztcbiAgdGhpcy5zZW5kRm9jdXM7XG4gIHRoaXMudXRmTW91c2U7XG4gIHRoaXMuc2dyTW91c2U7XG4gIHRoaXMudXJ4dnRNb3VzZTtcblxuICAvLyBtaXNjXG4gIHRoaXMuZWxlbWVudDtcbiAgdGhpcy5jaGlsZHJlbjtcbiAgdGhpcy5yZWZyZXNoU3RhcnQ7XG4gIHRoaXMucmVmcmVzaEVuZDtcbiAgdGhpcy5zYXZlZFg7XG4gIHRoaXMuc2F2ZWRZO1xuICB0aGlzLnNhdmVkQ29scztcblxuICAvLyBzdHJlYW1cbiAgdGhpcy5yZWFkYWJsZSA9IHRydWU7XG4gIHRoaXMud3JpdGFibGUgPSB0cnVlO1xuXG4gIHRoaXMuZGVmQXR0ciA9ICgwIDw8IDE4KSB8ICgyNTcgPDwgOSkgfCAoMjU2IDw8IDApO1xuICB0aGlzLmN1ckF0dHIgPSB0aGlzLmRlZkF0dHI7XG5cbiAgdGhpcy5wYXJhbXMgPSBbXTtcbiAgdGhpcy5jdXJyZW50UGFyYW0gPSAwO1xuICB0aGlzLnByZWZpeCA9ICcnO1xuICB0aGlzLnBvc3RmaXggPSAnJztcblxuICB0aGlzLmxpbmVzID0gW107XG4gIHZhciBpID0gdGhpcy5yb3dzO1xuICB3aGlsZSAoaS0tKSB7XG4gICAgdGhpcy5saW5lcy5wdXNoKHRoaXMuYmxhbmtMaW5lKCkpO1xuICB9XG5cbiAgdGhpcy50YWJzO1xuICB0aGlzLnNldHVwU3RvcHMoKTtcbn1cblxuaW5oZXJpdHMoVGVybWluYWwsIEV2ZW50RW1pdHRlcik7XG5cbi8vIGJhY2tfY29sb3JfZXJhc2UgZmVhdHVyZSBmb3IgeHRlcm0uXG5UZXJtaW5hbC5wcm90b3R5cGUuZXJhc2VBdHRyID0gZnVuY3Rpb24oKSB7XG4gIC8vIGlmICh0aGlzLmlzKCdzY3JlZW4nKSkgcmV0dXJuIHRoaXMuZGVmQXR0cjtcbiAgcmV0dXJuICh0aGlzLmRlZkF0dHIgJiB+MHgxZmYpIHwgKHRoaXMuY3VyQXR0ciAmIDB4MWZmKTtcbn07XG5cbi8qKlxuICogQ29sb3JzXG4gKi9cblxuLy8gQ29sb3JzIDAtMTVcblRlcm1pbmFsLnRhbmdvQ29sb3JzID0gW1xuICAvLyBkYXJrOlxuICAnIzJlMzQzNicsXG4gICcjY2MwMDAwJyxcbiAgJyM0ZTlhMDYnLFxuICAnI2M0YTAwMCcsXG4gICcjMzQ2NWE0JyxcbiAgJyM3NTUwN2InLFxuICAnIzA2OTg5YScsXG4gICcjZDNkN2NmJyxcbiAgLy8gYnJpZ2h0OlxuICAnIzU1NTc1MycsXG4gICcjZWYyOTI5JyxcbiAgJyM4YWUyMzQnLFxuICAnI2ZjZTk0ZicsXG4gICcjNzI5ZmNmJyxcbiAgJyNhZDdmYTgnLFxuICAnIzM0ZTJlMicsXG4gICcjZWVlZWVjJ1xuXTtcblxuVGVybWluYWwueHRlcm1Db2xvcnMgPSBbXG4gIC8vIGRhcms6XG4gICcjMDAwMDAwJywgLy8gYmxhY2tcbiAgJyNjZDAwMDAnLCAvLyByZWQzXG4gICcjMDBjZDAwJywgLy8gZ3JlZW4zXG4gICcjY2RjZDAwJywgLy8geWVsbG93M1xuICAnIzAwMDBlZScsIC8vIGJsdWUyXG4gICcjY2QwMGNkJywgLy8gbWFnZW50YTNcbiAgJyMwMGNkY2QnLCAvLyBjeWFuM1xuICAnI2U1ZTVlNScsIC8vIGdyYXk5MFxuICAvLyBicmlnaHQ6XG4gICcjN2Y3ZjdmJywgLy8gZ3JheTUwXG4gICcjZmYwMDAwJywgLy8gcmVkXG4gICcjMDBmZjAwJywgLy8gZ3JlZW5cbiAgJyNmZmZmMDAnLCAvLyB5ZWxsb3dcbiAgJyM1YzVjZmYnLCAvLyByZ2I6NWMvNWMvZmZcbiAgJyNmZjAwZmYnLCAvLyBtYWdlbnRhXG4gICcjMDBmZmZmJywgLy8gY3lhblxuICAnI2ZmZmZmZicgIC8vIHdoaXRlXG5dO1xuXG4vLyBDb2xvcnMgMC0xNSArIDE2LTI1NVxuLy8gTXVjaCB0aGFua3MgdG8gVG9vVGFsbE5hdGUgZm9yIHdyaXRpbmcgdGhpcy5cblRlcm1pbmFsLmNvbG9ycyA9IChmdW5jdGlvbigpIHtcbiAgdmFyIGNvbG9ycyA9IFRlcm1pbmFsLnRhbmdvQ29sb3JzLnNsaWNlKClcbiAgICAsIHIgPSBbMHgwMCwgMHg1ZiwgMHg4NywgMHhhZiwgMHhkNywgMHhmZl1cbiAgICAsIGk7XG5cbiAgLy8gMTYtMjMxXG4gIGkgPSAwO1xuICBmb3IgKDsgaSA8IDIxNjsgaSsrKSB7XG4gICAgb3V0KHJbKGkgLyAzNikgJSA2IHwgMF0sIHJbKGkgLyA2KSAlIDYgfCAwXSwgcltpICUgNl0pO1xuICB9XG5cbiAgLy8gMjMyLTI1NSAoZ3JleSlcbiAgaSA9IDA7XG4gIGZvciAoOyBpIDwgMjQ7IGkrKykge1xuICAgIHIgPSA4ICsgaSAqIDEwO1xuICAgIG91dChyLCByLCByKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG91dChyLCBnLCBiKSB7XG4gICAgY29sb3JzLnB1c2goJyMnICsgaGV4KHIpICsgaGV4KGcpICsgaGV4KGIpKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGhleChjKSB7XG4gICAgYyA9IGMudG9TdHJpbmcoMTYpO1xuICAgIHJldHVybiBjLmxlbmd0aCA8IDIgPyAnMCcgKyBjIDogYztcbiAgfVxuXG4gIHJldHVybiBjb2xvcnM7XG59KSgpO1xuXG4vLyBEZWZhdWx0IEJHL0ZHXG5UZXJtaW5hbC5jb2xvcnNbMjU2XSA9ICcjMDAwMDAwJztcblRlcm1pbmFsLmNvbG9yc1syNTddID0gJyNmMGYwZjAnO1xuXG5UZXJtaW5hbC5fY29sb3JzID0gVGVybWluYWwuY29sb3JzLnNsaWNlKCk7XG5cblRlcm1pbmFsLnZjb2xvcnMgPSAoZnVuY3Rpb24oKSB7XG4gIHZhciBvdXQgPSBbXVxuICAgICwgY29sb3JzID0gVGVybWluYWwuY29sb3JzXG4gICAgLCBpID0gMFxuICAgICwgY29sb3I7XG5cbiAgZm9yICg7IGkgPCAyNTY7IGkrKykge1xuICAgIGNvbG9yID0gcGFyc2VJbnQoY29sb3JzW2ldLnN1YnN0cmluZygxKSwgMTYpO1xuICAgIG91dC5wdXNoKFtcbiAgICAgIChjb2xvciA+PiAxNikgJiAweGZmLFxuICAgICAgKGNvbG9yID4+IDgpICYgMHhmZixcbiAgICAgIGNvbG9yICYgMHhmZlxuICAgIF0pO1xuICB9XG5cbiAgcmV0dXJuIG91dDtcbn0pKCk7XG5cbi8qKlxuICogT3B0aW9uc1xuICovXG5cblRlcm1pbmFsLmRlZmF1bHRzID0ge1xuICBjb2xvcnM6IFRlcm1pbmFsLmNvbG9ycyxcbiAgY29udmVydEVvbDogZmFsc2UsXG4gIHRlcm1OYW1lOiAneHRlcm0nLFxuICBnZW9tZXRyeTogWzgwLCAyNF0sXG4gIGN1cnNvckJsaW5rOiB0cnVlLFxuICB2aXN1YWxCZWxsOiBmYWxzZSxcbiAgcG9wT25CZWxsOiBmYWxzZSxcbiAgc2Nyb2xsYmFjazogMTAwMCxcbiAgc2NyZWVuS2V5czogZmFsc2UsXG4gIGRlYnVnOiBmYWxzZSxcbiAgdXNlU3R5bGU6IGZhbHNlXG4gIC8vIHByb2dyYW1GZWF0dXJlczogZmFsc2UsXG4gIC8vIGZvY3VzS2V5czogZmFsc2UsXG59O1xuXG5UZXJtaW5hbC5vcHRpb25zID0ge307XG5cbmVhY2goa2V5cyhUZXJtaW5hbC5kZWZhdWx0cyksIGZ1bmN0aW9uKGtleSkge1xuICBUZXJtaW5hbFtrZXldID0gVGVybWluYWwuZGVmYXVsdHNba2V5XTtcbiAgVGVybWluYWwub3B0aW9uc1trZXldID0gVGVybWluYWwuZGVmYXVsdHNba2V5XTtcbn0pO1xuXG4vKipcbiAqIEZvY3VzZWQgVGVybWluYWxcbiAqL1xuXG5UZXJtaW5hbC5mb2N1cyA9IG51bGw7XG5cblRlcm1pbmFsLnByb3RvdHlwZS5mb2N1cyA9IGZ1bmN0aW9uKCkge1xuICBpZiAoVGVybWluYWwuZm9jdXMgPT09IHRoaXMpIHJldHVybjtcblxuICBpZiAoVGVybWluYWwuZm9jdXMpIHtcbiAgICBUZXJtaW5hbC5mb2N1cy5ibHVyKCk7XG4gIH1cblxuICBpZiAodGhpcy5zZW5kRm9jdXMpIHRoaXMuc2VuZCgnXFx4MWJbSScpO1xuICB0aGlzLnNob3dDdXJzb3IoKTtcblxuICAvLyB0cnkge1xuICAvLyAgIHRoaXMuZWxlbWVudC5mb2N1cygpO1xuICAvLyB9IGNhdGNoIChlKSB7XG4gIC8vICAgO1xuICAvLyB9XG5cbiAgLy8gdGhpcy5lbWl0KCdmb2N1cycpO1xuXG4gIFRlcm1pbmFsLmZvY3VzID0gdGhpcztcbn07XG5cblRlcm1pbmFsLnByb3RvdHlwZS5ibHVyID0gZnVuY3Rpb24oKSB7XG4gIGlmIChUZXJtaW5hbC5mb2N1cyAhPT0gdGhpcykgcmV0dXJuO1xuXG4gIHRoaXMuY3Vyc29yU3RhdGUgPSAwO1xuICB0aGlzLnJlZnJlc2godGhpcy55LCB0aGlzLnkpO1xuICBpZiAodGhpcy5zZW5kRm9jdXMpIHRoaXMuc2VuZCgnXFx4MWJbTycpO1xuXG4gIC8vIHRyeSB7XG4gIC8vICAgdGhpcy5lbGVtZW50LmJsdXIoKTtcbiAgLy8gfSBjYXRjaCAoZSkge1xuICAvLyAgIDtcbiAgLy8gfVxuXG4gIC8vIHRoaXMuZW1pdCgnYmx1cicpO1xuXG4gIFRlcm1pbmFsLmZvY3VzID0gbnVsbDtcbn07XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBnbG9iYWwgYmVoYXZpb3JcbiAqL1xuXG5UZXJtaW5hbC5wcm90b3R5cGUuaW5pdEdsb2JhbCA9IGZ1bmN0aW9uKCkge1xuICB2YXIgZG9jdW1lbnQgPSB0aGlzLmRvY3VtZW50O1xuXG4gIFRlcm1pbmFsLl9ib3VuZERvY3MgPSBUZXJtaW5hbC5fYm91bmREb2NzIHx8IFtdO1xuICBpZiAofmluZGV4T2YoVGVybWluYWwuX2JvdW5kRG9jcywgZG9jdW1lbnQpKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIFRlcm1pbmFsLl9ib3VuZERvY3MucHVzaChkb2N1bWVudCk7XG5cbiAgVGVybWluYWwuYmluZFBhc3RlKGRvY3VtZW50KTtcblxuICBUZXJtaW5hbC5iaW5kS2V5cyhkb2N1bWVudCk7XG5cbiAgVGVybWluYWwuYmluZENvcHkoZG9jdW1lbnQpO1xuXG4gIGlmICh0aGlzLmlzTW9iaWxlKSB7XG4gICAgdGhpcy5maXhNb2JpbGUoZG9jdW1lbnQpO1xuICB9XG5cbiAgaWYgKHRoaXMudXNlU3R5bGUpIHtcbiAgICBUZXJtaW5hbC5pbnNlcnRTdHlsZShkb2N1bWVudCwgdGhpcy5jb2xvcnNbMjU2XSwgdGhpcy5jb2xvcnNbMjU3XSk7XG4gIH1cbn07XG5cbi8qKlxuICogQmluZCB0byBwYXN0ZSBldmVudFxuICovXG5cblRlcm1pbmFsLmJpbmRQYXN0ZSA9IGZ1bmN0aW9uKGRvY3VtZW50KSB7XG4gIC8vIFRoaXMgc2VlbXMgdG8gd29yayB3ZWxsIGZvciBjdHJsLVYgYW5kIG1pZGRsZS1jbGljayxcbiAgLy8gZXZlbiB3aXRob3V0IHRoZSBjb250ZW50RWRpdGFibGUgd29ya2Fyb3VuZC5cbiAgdmFyIHdpbmRvdyA9IGRvY3VtZW50LmRlZmF1bHRWaWV3O1xuICBvbih3aW5kb3csICdwYXN0ZScsIGZ1bmN0aW9uKGV2KSB7XG4gICAgdmFyIHRlcm0gPSBUZXJtaW5hbC5mb2N1cztcbiAgICBpZiAoIXRlcm0pIHJldHVybjtcbiAgICBpZiAoZXYuY2xpcGJvYXJkRGF0YSkge1xuICAgICAgdGVybS5zZW5kKGV2LmNsaXBib2FyZERhdGEuZ2V0RGF0YSgndGV4dC9wbGFpbicpKTtcbiAgICB9IGVsc2UgaWYgKHRlcm0uY29udGV4dC5jbGlwYm9hcmREYXRhKSB7XG4gICAgICB0ZXJtLnNlbmQodGVybS5jb250ZXh0LmNsaXBib2FyZERhdGEuZ2V0RGF0YSgnVGV4dCcpKTtcbiAgICB9XG4gICAgLy8gTm90IG5lY2Vzc2FyeS4gRG8gaXQgYW55d2F5IGZvciBnb29kIG1lYXN1cmUuXG4gICAgdGVybS5lbGVtZW50LmNvbnRlbnRFZGl0YWJsZSA9ICdpbmhlcml0JztcbiAgICByZXR1cm4gY2FuY2VsKGV2KTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIEdsb2JhbCBFdmVudHMgZm9yIGtleSBoYW5kbGluZ1xuICovXG5cblRlcm1pbmFsLmJpbmRLZXlzID0gZnVuY3Rpb24oZG9jdW1lbnQpIHtcbiAgLy8gV2Ugc2hvdWxkIG9ubHkgbmVlZCB0byBjaGVjayBgdGFyZ2V0ID09PSBib2R5YCBiZWxvdyxcbiAgLy8gYnV0IHdlIGNhbiBjaGVjayBldmVyeXRoaW5nIGZvciBnb29kIG1lYXN1cmUuXG4gIG9uKGRvY3VtZW50LCAna2V5ZG93bicsIGZ1bmN0aW9uKGV2KSB7XG4gICAgaWYgKCFUZXJtaW5hbC5mb2N1cykgcmV0dXJuO1xuICAgIHZhciB0YXJnZXQgPSBldi50YXJnZXQgfHwgZXYuc3JjRWxlbWVudDtcbiAgICBpZiAoIXRhcmdldCkgcmV0dXJuO1xuICAgIGlmICh0YXJnZXQgPT09IFRlcm1pbmFsLmZvY3VzLmVsZW1lbnRcbiAgICAgICAgfHwgdGFyZ2V0ID09PSBUZXJtaW5hbC5mb2N1cy5jb250ZXh0XG4gICAgICAgIHx8IHRhcmdldCA9PT0gVGVybWluYWwuZm9jdXMuZG9jdW1lbnRcbiAgICAgICAgfHwgdGFyZ2V0ID09PSBUZXJtaW5hbC5mb2N1cy5ib2R5XG4gICAgICAgIHx8IHRhcmdldCA9PT0gVGVybWluYWwuX3RleHRhcmVhXG4gICAgICAgIHx8IHRhcmdldCA9PT0gVGVybWluYWwuZm9jdXMucGFyZW50KSB7XG4gICAgICByZXR1cm4gVGVybWluYWwuZm9jdXMua2V5RG93bihldik7XG4gICAgfVxuICB9LCB0cnVlKTtcblxuICBvbihkb2N1bWVudCwgJ2tleXByZXNzJywgZnVuY3Rpb24oZXYpIHtcbiAgICBpZiAoIVRlcm1pbmFsLmZvY3VzKSByZXR1cm47XG4gICAgdmFyIHRhcmdldCA9IGV2LnRhcmdldCB8fCBldi5zcmNFbGVtZW50O1xuICAgIGlmICghdGFyZ2V0KSByZXR1cm47XG4gICAgaWYgKHRhcmdldCA9PT0gVGVybWluYWwuZm9jdXMuZWxlbWVudFxuICAgICAgICB8fCB0YXJnZXQgPT09IFRlcm1pbmFsLmZvY3VzLmNvbnRleHRcbiAgICAgICAgfHwgdGFyZ2V0ID09PSBUZXJtaW5hbC5mb2N1cy5kb2N1bWVudFxuICAgICAgICB8fCB0YXJnZXQgPT09IFRlcm1pbmFsLmZvY3VzLmJvZHlcbiAgICAgICAgfHwgdGFyZ2V0ID09PSBUZXJtaW5hbC5fdGV4dGFyZWFcbiAgICAgICAgfHwgdGFyZ2V0ID09PSBUZXJtaW5hbC5mb2N1cy5wYXJlbnQpIHtcbiAgICAgIHJldHVybiBUZXJtaW5hbC5mb2N1cy5rZXlQcmVzcyhldik7XG4gICAgfVxuICB9LCB0cnVlKTtcblxuICAvLyBJZiB3ZSBjbGljayBzb21ld2hlcmUgb3RoZXIgdGhhbiBhXG4gIC8vIHRlcm1pbmFsLCB1bmZvY3VzIHRoZSB0ZXJtaW5hbC5cbiAgb24oZG9jdW1lbnQsICdtb3VzZWRvd24nLCBmdW5jdGlvbihldikge1xuICAgIGlmICghVGVybWluYWwuZm9jdXMpIHJldHVybjtcblxuICAgIHZhciBlbCA9IGV2LnRhcmdldCB8fCBldi5zcmNFbGVtZW50O1xuICAgIGlmICghZWwpIHJldHVybjtcblxuICAgIGRvIHtcbiAgICAgIGlmIChlbCA9PT0gVGVybWluYWwuZm9jdXMuZWxlbWVudCkgcmV0dXJuO1xuICAgIH0gd2hpbGUgKGVsID0gZWwucGFyZW50Tm9kZSk7XG5cbiAgICBUZXJtaW5hbC5mb2N1cy5ibHVyKCk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBDb3B5IFNlbGVjdGlvbiB3LyBDdHJsLUMgKFNlbGVjdCBNb2RlKVxuICovXG5cblRlcm1pbmFsLmJpbmRDb3B5ID0gZnVuY3Rpb24oZG9jdW1lbnQpIHtcbiAgdmFyIHdpbmRvdyA9IGRvY3VtZW50LmRlZmF1bHRWaWV3O1xuXG4gIC8vIGlmICghKCdvbmJlZm9yZWNvcHknIGluIGRvY3VtZW50KSkge1xuICAvLyAgIC8vIENvcGllcyB0byAqb25seSogdGhlIGNsaXBib2FyZC5cbiAgLy8gICBvbih3aW5kb3csICdjb3B5JywgZnVuY3Rpb24gZm4oZXYpIHtcbiAgLy8gICAgIHZhciB0ZXJtID0gVGVybWluYWwuZm9jdXM7XG4gIC8vICAgICBpZiAoIXRlcm0pIHJldHVybjtcbiAgLy8gICAgIGlmICghdGVybS5fc2VsZWN0ZWQpIHJldHVybjtcbiAgLy8gICAgIHZhciB0ZXh0ID0gdGVybS5ncmFiVGV4dChcbiAgLy8gICAgICAgdGVybS5fc2VsZWN0ZWQueDEsIHRlcm0uX3NlbGVjdGVkLngyLFxuICAvLyAgICAgICB0ZXJtLl9zZWxlY3RlZC55MSwgdGVybS5fc2VsZWN0ZWQueTIpO1xuICAvLyAgICAgdGVybS5lbWl0KCdjb3B5JywgdGV4dCk7XG4gIC8vICAgICBldi5jbGlwYm9hcmREYXRhLnNldERhdGEoJ3RleHQvcGxhaW4nLCB0ZXh0KTtcbiAgLy8gICB9KTtcbiAgLy8gICByZXR1cm47XG4gIC8vIH1cblxuICAvLyBDb3BpZXMgdG8gcHJpbWFyeSBzZWxlY3Rpb24gKmFuZCogY2xpcGJvYXJkLlxuICAvLyBOT1RFOiBUaGlzIG1heSB3b3JrIGJldHRlciBvbiBjYXB0dXJlIHBoYXNlLFxuICAvLyBvciB1c2luZyB0aGUgYGJlZm9yZWNvcHlgIGV2ZW50LlxuICBvbih3aW5kb3csICdjb3B5JywgZnVuY3Rpb24oZXYpIHtcbiAgICB2YXIgdGVybSA9IFRlcm1pbmFsLmZvY3VzO1xuICAgIGlmICghdGVybSkgcmV0dXJuO1xuICAgIGlmICghdGVybS5fc2VsZWN0ZWQpIHJldHVybjtcbiAgICB2YXIgdGV4dGFyZWEgPSB0ZXJtLmdldENvcHlUZXh0YXJlYSgpO1xuICAgIHZhciB0ZXh0ID0gdGVybS5ncmFiVGV4dChcbiAgICAgIHRlcm0uX3NlbGVjdGVkLngxLCB0ZXJtLl9zZWxlY3RlZC54MixcbiAgICAgIHRlcm0uX3NlbGVjdGVkLnkxLCB0ZXJtLl9zZWxlY3RlZC55Mik7XG4gICAgdGVybS5lbWl0KCdjb3B5JywgdGV4dCk7XG4gICAgdGV4dGFyZWEuZm9jdXMoKTtcbiAgICB0ZXh0YXJlYS50ZXh0Q29udGVudCA9IHRleHQ7XG4gICAgdGV4dGFyZWEudmFsdWUgPSB0ZXh0O1xuICAgIHRleHRhcmVhLnNldFNlbGVjdGlvblJhbmdlKDAsIHRleHQubGVuZ3RoKTtcbiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgdGVybS5lbGVtZW50LmZvY3VzKCk7XG4gICAgICB0ZXJtLmZvY3VzKCk7XG4gICAgfSwgMSk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBGaXggTW9iaWxlXG4gKi9cblxuVGVybWluYWwucHJvdG90eXBlLmZpeE1vYmlsZSA9IGZ1bmN0aW9uKGRvY3VtZW50KSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICB2YXIgdGV4dGFyZWEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0ZXh0YXJlYScpO1xuICB0ZXh0YXJlYS5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG4gIHRleHRhcmVhLnN0eWxlLmxlZnQgPSAnLTMyMDAwcHgnO1xuICB0ZXh0YXJlYS5zdHlsZS50b3AgPSAnLTMyMDAwcHgnO1xuICB0ZXh0YXJlYS5zdHlsZS53aWR0aCA9ICcwcHgnO1xuICB0ZXh0YXJlYS5zdHlsZS5oZWlnaHQgPSAnMHB4JztcbiAgdGV4dGFyZWEuc3R5bGUub3BhY2l0eSA9ICcwJztcbiAgdGV4dGFyZWEuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gJ3RyYW5zcGFyZW50JztcbiAgdGV4dGFyZWEuc3R5bGUuYm9yZGVyU3R5bGUgPSAnbm9uZSc7XG4gIHRleHRhcmVhLnN0eWxlLm91dGxpbmVTdHlsZSA9ICdub25lJztcbiAgdGV4dGFyZWEuYXV0b2NhcGl0YWxpemUgPSAnbm9uZSc7XG4gIHRleHRhcmVhLmF1dG9jb3JyZWN0ID0gJ29mZic7XG5cbiAgZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2JvZHknKVswXS5hcHBlbmRDaGlsZCh0ZXh0YXJlYSk7XG5cbiAgVGVybWluYWwuX3RleHRhcmVhID0gdGV4dGFyZWE7XG5cbiAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICB0ZXh0YXJlYS5mb2N1cygpO1xuICB9LCAxMDAwKTtcblxuICBpZiAodGhpcy5pc0FuZHJvaWQpIHtcbiAgICBvbih0ZXh0YXJlYSwgJ2NoYW5nZScsIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIHZhbHVlID0gdGV4dGFyZWEudGV4dENvbnRlbnQgfHwgdGV4dGFyZWEudmFsdWU7XG4gICAgICB0ZXh0YXJlYS52YWx1ZSA9ICcnO1xuICAgICAgdGV4dGFyZWEudGV4dENvbnRlbnQgPSAnJztcbiAgICAgIHNlbGYuc2VuZCh2YWx1ZSArICdcXHInKTtcbiAgICB9KTtcbiAgfVxufTtcblxuLyoqXG4gKiBJbnNlcnQgYSBkZWZhdWx0IHN0eWxlXG4gKi9cblxuVGVybWluYWwuaW5zZXJ0U3R5bGUgPSBmdW5jdGlvbihkb2N1bWVudCwgYmcsIGZnKSB7XG4gIHZhciBzdHlsZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd0ZXJtLXN0eWxlJyk7XG4gIGlmIChzdHlsZSkgcmV0dXJuO1xuXG4gIHZhciBoZWFkID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2hlYWQnKVswXTtcbiAgaWYgKCFoZWFkKSByZXR1cm47XG5cbiAgdmFyIHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcbiAgc3R5bGUuaWQgPSAndGVybS1zdHlsZSc7XG5cbiAgLy8gdGV4dENvbnRlbnQgZG9lc24ndCB3b3JrIHdlbGwgd2l0aCBJRSBmb3IgPHN0eWxlPiBlbGVtZW50cy5cbiAgc3R5bGUuaW5uZXJIVE1MID0gJydcbiAgICArICcudGVybWluYWwge1xcbidcbiAgICArICcgIGZsb2F0OiBsZWZ0O1xcbidcbiAgICArICcgIGJvcmRlcjogJyArIGJnICsgJyBzb2xpZCA1cHg7XFxuJ1xuICAgICsgJyAgZm9udC1mYW1pbHk6IFwiRGVqYVZ1IFNhbnMgTW9ub1wiLCBcIkxpYmVyYXRpb24gTW9ub1wiLCBtb25vc3BhY2U7XFxuJ1xuICAgICsgJyAgZm9udC1zaXplOiAxMXB4O1xcbidcbiAgICArICcgIGNvbG9yOiAnICsgZmcgKyAnO1xcbidcbiAgICArICcgIGJhY2tncm91bmQ6ICcgKyBiZyArICc7XFxuJ1xuICAgICsgJ31cXG4nXG4gICAgKyAnXFxuJ1xuICAgICsgJy50ZXJtaW5hbC1jdXJzb3Ige1xcbidcbiAgICArICcgIGNvbG9yOiAnICsgYmcgKyAnO1xcbidcbiAgICArICcgIGJhY2tncm91bmQ6ICcgKyBmZyArICc7XFxuJ1xuICAgICsgJ31cXG4nO1xuXG4gIC8vIHZhciBvdXQgPSAnJztcbiAgLy8gZWFjaChUZXJtaW5hbC5jb2xvcnMsIGZ1bmN0aW9uKGNvbG9yLCBpKSB7XG4gIC8vICAgaWYgKGkgPT09IDI1Nikge1xuICAvLyAgICAgb3V0ICs9ICdcXG4udGVybS1iZy1jb2xvci1kZWZhdWx0IHsgYmFja2dyb3VuZC1jb2xvcjogJyArIGNvbG9yICsgJzsgfSc7XG4gIC8vICAgfVxuICAvLyAgIGlmIChpID09PSAyNTcpIHtcbiAgLy8gICAgIG91dCArPSAnXFxuLnRlcm0tZmctY29sb3ItZGVmYXVsdCB7IGNvbG9yOiAnICsgY29sb3IgKyAnOyB9JztcbiAgLy8gICB9XG4gIC8vICAgb3V0ICs9ICdcXG4udGVybS1iZy1jb2xvci0nICsgaSArICcgeyBiYWNrZ3JvdW5kLWNvbG9yOiAnICsgY29sb3IgKyAnOyB9JztcbiAgLy8gICBvdXQgKz0gJ1xcbi50ZXJtLWZnLWNvbG9yLScgKyBpICsgJyB7IGNvbG9yOiAnICsgY29sb3IgKyAnOyB9JztcbiAgLy8gfSk7XG4gIC8vIHN0eWxlLmlubmVySFRNTCArPSBvdXQgKyAnXFxuJztcblxuICBoZWFkLmluc2VydEJlZm9yZShzdHlsZSwgaGVhZC5maXJzdENoaWxkKTtcbn07XG5cbi8qKlxuICogT3BlbiBUZXJtaW5hbFxuICovXG5cblRlcm1pbmFsLnByb3RvdHlwZS5vcGVuID0gZnVuY3Rpb24ocGFyZW50KSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICAgICwgaSA9IDBcbiAgICAsIGRpdjtcblxuICB0aGlzLnBhcmVudCA9IHBhcmVudCB8fCB0aGlzLnBhcmVudDtcblxuICBpZiAoIXRoaXMucGFyZW50KSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdUZXJtaW5hbCByZXF1aXJlcyBhIHBhcmVudCBlbGVtZW50LicpO1xuICB9XG5cbiAgLy8gR3JhYiBnbG9iYWwgZWxlbWVudHMuXG4gIHRoaXMuY29udGV4dCA9IHRoaXMucGFyZW50Lm93bmVyRG9jdW1lbnQuZGVmYXVsdFZpZXc7XG4gIHRoaXMuZG9jdW1lbnQgPSB0aGlzLnBhcmVudC5vd25lckRvY3VtZW50O1xuICB0aGlzLmJvZHkgPSB0aGlzLmRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdib2R5JylbMF07XG5cbiAgLy8gUGFyc2UgdXNlci1hZ2VudCBzdHJpbmdzLlxuICBpZiAodGhpcy5jb250ZXh0Lm5hdmlnYXRvciAmJiB0aGlzLmNvbnRleHQubmF2aWdhdG9yLnVzZXJBZ2VudCkge1xuICAgIHRoaXMuaXNNYWMgPSAhIX50aGlzLmNvbnRleHQubmF2aWdhdG9yLnVzZXJBZ2VudC5pbmRleE9mKCdNYWMnKTtcbiAgICB0aGlzLmlzSXBhZCA9ICEhfnRoaXMuY29udGV4dC5uYXZpZ2F0b3IudXNlckFnZW50LmluZGV4T2YoJ2lQYWQnKTtcbiAgICB0aGlzLmlzSXBob25lID0gISF+dGhpcy5jb250ZXh0Lm5hdmlnYXRvci51c2VyQWdlbnQuaW5kZXhPZignaVBob25lJyk7XG4gICAgdGhpcy5pc0FuZHJvaWQgPSAhIX50aGlzLmNvbnRleHQubmF2aWdhdG9yLnVzZXJBZ2VudC5pbmRleE9mKCdBbmRyb2lkJyk7XG4gICAgdGhpcy5pc01vYmlsZSA9IHRoaXMuaXNJcGFkIHx8IHRoaXMuaXNJcGhvbmUgfHwgdGhpcy5pc0FuZHJvaWQ7XG4gICAgdGhpcy5pc01TSUUgPSAhIX50aGlzLmNvbnRleHQubmF2aWdhdG9yLnVzZXJBZ2VudC5pbmRleE9mKCdNU0lFJyk7XG4gIH1cblxuICAvLyBDcmVhdGUgb3VyIG1haW4gdGVybWluYWwgZWxlbWVudC5cbiAgdGhpcy5lbGVtZW50ID0gdGhpcy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgdGhpcy5lbGVtZW50LmNsYXNzTmFtZSA9ICd0ZXJtaW5hbCc7XG4gIHRoaXMuZWxlbWVudC5zdHlsZS5vdXRsaW5lID0gJ25vbmUnO1xuICB0aGlzLmVsZW1lbnQuc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsIDApO1xuICB0aGlzLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdzcGVsbGNoZWNrJywgJ2ZhbHNlJyk7XG4gIHRoaXMuZWxlbWVudC5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSB0aGlzLmNvbG9yc1syNTZdO1xuICB0aGlzLmVsZW1lbnQuc3R5bGUuY29sb3IgPSB0aGlzLmNvbG9yc1syNTddO1xuXG4gIC8vIENyZWF0ZSB0aGUgbGluZXMgZm9yIG91ciB0ZXJtaW5hbC5cbiAgdGhpcy5jaGlsZHJlbiA9IFtdO1xuICBmb3IgKDsgaSA8IHRoaXMucm93czsgaSsrKSB7XG4gICAgZGl2ID0gdGhpcy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICB0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQoZGl2KTtcbiAgICB0aGlzLmNoaWxkcmVuLnB1c2goZGl2KTtcbiAgfVxuICB0aGlzLnBhcmVudC5hcHBlbmRDaGlsZCh0aGlzLmVsZW1lbnQpO1xuXG4gIC8vIERyYXcgdGhlIHNjcmVlbi5cbiAgdGhpcy5yZWZyZXNoKDAsIHRoaXMucm93cyAtIDEpO1xuXG4gIGlmICh0aGlzLm9wdGlvbnMubm9FdmVudHMpIHtcbiAgICAvLyBJbml0aWFsaXplIGdsb2JhbCBhY3Rpb25zIHRoYXRcbiAgICAvLyBuZWVkIHRvIGJlIHRha2VuIG9uIHRoZSBkb2N1bWVudC5cbiAgICB0aGlzLmluaXRHbG9iYWwoKTtcbiAgfVxuXG4gIGlmICghdGhpcy5vcHRpb25zLm5vRm9jdXMpIHtcbiAgICAvLyBFbnN1cmUgdGhlcmUgaXMgYSBUZXJtaW5hbC5mb2N1cy5cbiAgICB0aGlzLmZvY3VzKCk7XG5cbiAgICAvLyBTdGFydCBibGlua2luZyB0aGUgY3Vyc29yLlxuICAgIHRoaXMuc3RhcnRCbGluaygpO1xuXG4gICAgLy8gQmluZCB0byBET00gZXZlbnRzIHJlbGF0ZWRcbiAgICAvLyB0byBmb2N1cyBhbmQgcGFzdGUgYmVoYXZpb3IuXG4gICAgb24odGhpcy5lbGVtZW50LCAnZm9jdXMnLCBmdW5jdGlvbigpIHtcbiAgICAgIHNlbGYuZm9jdXMoKTtcbiAgICAgIGlmIChzZWxmLmlzTW9iaWxlKSB7XG4gICAgICAgIFRlcm1pbmFsLl90ZXh0YXJlYS5mb2N1cygpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gVGhpcyBjYXVzZXMgc2xpZ2h0bHkgZnVua3kgYmVoYXZpb3IuXG4gICAgLy8gb24odGhpcy5lbGVtZW50LCAnYmx1cicsIGZ1bmN0aW9uKCkge1xuICAgIC8vICAgc2VsZi5ibHVyKCk7XG4gICAgLy8gfSk7XG5cbiAgICBvbih0aGlzLmVsZW1lbnQsICdtb3VzZWRvd24nLCBmdW5jdGlvbigpIHtcbiAgICAgIHNlbGYuZm9jdXMoKTtcbiAgICB9KTtcblxuICAgIC8vIENsaWNrYWJsZSBwYXN0ZSB3b3JrYXJvdW5kLCB1c2luZyBjb250ZW50RWRpdGFibGUuXG4gICAgLy8gVGhpcyBwcm9iYWJseSBzaG91bGRuJ3Qgd29yayxcbiAgICAvLyAuLi4gYnV0IGl0IGRvZXMuIEZpcmVmb3gncyBwYXN0ZVxuICAgIC8vIGV2ZW50IHNlZW1zIHRvIG9ubHkgd29yayBmb3IgdGV4dGFyZWFzP1xuICAgIG9uKHRoaXMuZWxlbWVudCwgJ21vdXNlZG93bicsIGZ1bmN0aW9uKGV2KSB7XG4gICAgICB2YXIgYnV0dG9uID0gZXYuYnV0dG9uICE9IG51bGxcbiAgICAgICAgPyArZXYuYnV0dG9uXG4gICAgICAgIDogZXYud2hpY2ggIT0gbnVsbFxuICAgICAgICAgID8gZXYud2hpY2ggLSAxXG4gICAgICAgICAgOiBudWxsO1xuXG4gICAgICAvLyBEb2VzIElFOSBkbyB0aGlzP1xuICAgICAgaWYgKHNlbGYuaXNNU0lFKSB7XG4gICAgICAgIGJ1dHRvbiA9IGJ1dHRvbiA9PT0gMSA/IDAgOiBidXR0b24gPT09IDQgPyAxIDogYnV0dG9uO1xuICAgICAgfVxuXG4gICAgICBpZiAoYnV0dG9uICE9PSAyKSByZXR1cm47XG5cbiAgICAgIHNlbGYuZWxlbWVudC5jb250ZW50RWRpdGFibGUgPSAndHJ1ZSc7XG4gICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICBzZWxmLmVsZW1lbnQuY29udGVudEVkaXRhYmxlID0gJ2luaGVyaXQnOyAvLyAnZmFsc2UnO1xuICAgICAgfSwgMSk7XG4gICAgfSwgdHJ1ZSk7XG4gIH1cblxuICBpZiAodGhpcy5vcHRpb25zLm5vTW91c2UpIHtcbiAgICAvLyBMaXN0ZW4gZm9yIG1vdXNlIGV2ZW50cyBhbmQgdHJhbnNsYXRlXG4gICAgLy8gdGhlbSBpbnRvIHRlcm1pbmFsIG1vdXNlIHByb3RvY29scy5cbiAgICB0aGlzLmJpbmRNb3VzZSgpO1xuICB9XG5cbiAgLy8gdGhpcy5lbWl0KCdvcGVuJyk7XG5cbiAgaWYgKCF0aGlzLm9wdGlvbnMubm9Gb2N1cykge1xuICAgICAgLy8gVGhpcyBjYW4gYmUgdXNlZnVsIGZvciBwYXN0aW5nLFxuICAgICAgLy8gYXMgd2VsbCBhcyB0aGUgaVBhZCBmaXguXG4gICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICBzZWxmLmVsZW1lbnQuZm9jdXMoKTtcbiAgICAgIH0sIDEwMCk7XG4gIH1cblxuICAvLyBGaWd1cmUgb3V0IHdoZXRoZXIgYm9sZG5lc3MgYWZmZWN0c1xuICAvLyB0aGUgY2hhcmFjdGVyIHdpZHRoIG9mIG1vbm9zcGFjZSBmb250cy5cbiAgaWYgKFRlcm1pbmFsLmJyb2tlbkJvbGQgPT0gbnVsbCkge1xuICAgIFRlcm1pbmFsLmJyb2tlbkJvbGQgPSBpc0JvbGRCcm9rZW4odGhpcy5kb2N1bWVudCk7XG4gIH1cbn07XG5cbi8vIFhUZXJtIG1vdXNlIGV2ZW50c1xuLy8gaHR0cDovL2ludmlzaWJsZS1pc2xhbmQubmV0L3h0ZXJtL2N0bHNlcXMvY3Rsc2Vxcy5odG1sI01vdXNlJTIwVHJhY2tpbmdcbi8vIFRvIGJldHRlciB1bmRlcnN0YW5kIHRoZXNlXG4vLyB0aGUgeHRlcm0gY29kZSBpcyB2ZXJ5IGhlbHBmdWw6XG4vLyBSZWxldmFudCBmaWxlczpcbi8vICAgYnV0dG9uLmMsIGNoYXJwcm9jLmMsIG1pc2MuY1xuLy8gUmVsZXZhbnQgZnVuY3Rpb25zIGluIHh0ZXJtL2J1dHRvbi5jOlxuLy8gICBCdG5Db2RlLCBFbWl0QnV0dG9uQ29kZSwgRWRpdG9yQnV0dG9uLCBTZW5kTW91c2VQb3NpdGlvblxuVGVybWluYWwucHJvdG90eXBlLmJpbmRNb3VzZSA9IGZ1bmN0aW9uKCkge1xuICB2YXIgZWwgPSB0aGlzLmVsZW1lbnRcbiAgICAsIHNlbGYgPSB0aGlzXG4gICAgLCBwcmVzc2VkID0gMzI7XG5cbiAgdmFyIHdoZWVsRXZlbnQgPSAnb25tb3VzZXdoZWVsJyBpbiB0aGlzLmNvbnRleHRcbiAgICA/ICdtb3VzZXdoZWVsJ1xuICAgIDogJ0RPTU1vdXNlU2Nyb2xsJztcblxuICAvLyBtb3VzZXVwLCBtb3VzZWRvd24sIG1vdXNld2hlZWxcbiAgLy8gbGVmdCBjbGljazogXltbTSAzPF5bW00jMzxcbiAgLy8gbW91c2V3aGVlbCB1cDogXltbTWAzPlxuICBmdW5jdGlvbiBzZW5kQnV0dG9uKGV2KSB7XG4gICAgdmFyIGJ1dHRvblxuICAgICAgLCBwb3M7XG5cbiAgICAvLyBnZXQgdGhlIHh0ZXJtLXN0eWxlIGJ1dHRvblxuICAgIGJ1dHRvbiA9IGdldEJ1dHRvbihldik7XG5cbiAgICAvLyBnZXQgbW91c2UgY29vcmRpbmF0ZXNcbiAgICBwb3MgPSBnZXRDb29yZHMoZXYpO1xuICAgIGlmICghcG9zKSByZXR1cm47XG5cbiAgICBzZW5kRXZlbnQoYnV0dG9uLCBwb3MpO1xuXG4gICAgc3dpdGNoIChldi50eXBlKSB7XG4gICAgICBjYXNlICdtb3VzZWRvd24nOlxuICAgICAgICBwcmVzc2VkID0gYnV0dG9uO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ21vdXNldXAnOlxuICAgICAgICAvLyBrZWVwIGl0IGF0IHRoZSBsZWZ0XG4gICAgICAgIC8vIGJ1dHRvbiwganVzdCBpbiBjYXNlLlxuICAgICAgICBwcmVzc2VkID0gMzI7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSB3aGVlbEV2ZW50OlxuICAgICAgICAvLyBub3RoaW5nLiBkb24ndFxuICAgICAgICAvLyBpbnRlcmZlcmUgd2l0aFxuICAgICAgICAvLyBgcHJlc3NlZGAuXG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIC8vIG1vdGlvbiBleGFtcGxlIG9mIGEgbGVmdCBjbGljazpcbiAgLy8gXltbTSAzPF5bW01ANDxeW1tNQDU8XltbTUA2PF5bW01ANzxeW1tNIzc8XG4gIGZ1bmN0aW9uIHNlbmRNb3ZlKGV2KSB7XG4gICAgdmFyIGJ1dHRvbiA9IHByZXNzZWRcbiAgICAgICwgcG9zO1xuXG4gICAgcG9zID0gZ2V0Q29vcmRzKGV2KTtcbiAgICBpZiAoIXBvcykgcmV0dXJuO1xuXG4gICAgLy8gYnV0dG9ucyBtYXJrZWQgYXMgbW90aW9uc1xuICAgIC8vIGFyZSBpbmNyZW1lbnRlZCBieSAzMlxuICAgIGJ1dHRvbiArPSAzMjtcblxuICAgIHNlbmRFdmVudChidXR0b24sIHBvcyk7XG4gIH1cblxuICAvLyBlbmNvZGUgYnV0dG9uIGFuZFxuICAvLyBwb3NpdGlvbiB0byBjaGFyYWN0ZXJzXG4gIGZ1bmN0aW9uIGVuY29kZShkYXRhLCBjaCkge1xuICAgIGlmICghc2VsZi51dGZNb3VzZSkge1xuICAgICAgaWYgKGNoID09PSAyNTUpIHJldHVybiBkYXRhLnB1c2goMCk7XG4gICAgICBpZiAoY2ggPiAxMjcpIGNoID0gMTI3O1xuICAgICAgZGF0YS5wdXNoKGNoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKGNoID09PSAyMDQ3KSByZXR1cm4gZGF0YS5wdXNoKDApO1xuICAgICAgaWYgKGNoIDwgMTI3KSB7XG4gICAgICAgIGRhdGEucHVzaChjaCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoY2ggPiAyMDQ3KSBjaCA9IDIwNDc7XG4gICAgICAgIGRhdGEucHVzaCgweEMwIHwgKGNoID4+IDYpKTtcbiAgICAgICAgZGF0YS5wdXNoKDB4ODAgfCAoY2ggJiAweDNGKSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gc2VuZCBhIG1vdXNlIGV2ZW50OlxuICAvLyByZWd1bGFyL3V0Zjg6IF5bW00gQ2IgQ3ggQ3lcbiAgLy8gdXJ4dnQ6IF5bWyBDYiA7IEN4IDsgQ3kgTVxuICAvLyBzZ3I6IF5bWyBDYiA7IEN4IDsgQ3kgTS9tXG4gIC8vIHZ0MzAwOiBeW1sgMjQoMS8zLzUpfiBbIEN4ICwgQ3kgXSBcXHJcbiAgLy8gbG9jYXRvcjogQ1NJIFAgZSA7IFAgYiA7IFAgciA7IFAgYyA7IFAgcCAmIHdcbiAgZnVuY3Rpb24gc2VuZEV2ZW50KGJ1dHRvbiwgcG9zKSB7XG4gICAgLy8gc2VsZi5lbWl0KCdtb3VzZScsIHtcbiAgICAvLyAgIHg6IHBvcy54IC0gMzIsXG4gICAgLy8gICB5OiBwb3MueCAtIDMyLFxuICAgIC8vICAgYnV0dG9uOiBidXR0b25cbiAgICAvLyB9KTtcblxuICAgIGlmIChzZWxmLnZ0MzAwTW91c2UpIHtcbiAgICAgIC8vIE5PVEU6IFVuc3RhYmxlLlxuICAgICAgLy8gaHR0cDovL3d3dy52dDEwMC5uZXQvZG9jcy92dDN4eC1ncC9jaGFwdGVyMTUuaHRtbFxuICAgICAgYnV0dG9uICY9IDM7XG4gICAgICBwb3MueCAtPSAzMjtcbiAgICAgIHBvcy55IC09IDMyO1xuICAgICAgdmFyIGRhdGEgPSAnXFx4MWJbMjQnO1xuICAgICAgaWYgKGJ1dHRvbiA9PT0gMCkgZGF0YSArPSAnMSc7XG4gICAgICBlbHNlIGlmIChidXR0b24gPT09IDEpIGRhdGEgKz0gJzMnO1xuICAgICAgZWxzZSBpZiAoYnV0dG9uID09PSAyKSBkYXRhICs9ICc1JztcbiAgICAgIGVsc2UgaWYgKGJ1dHRvbiA9PT0gMykgcmV0dXJuO1xuICAgICAgZWxzZSBkYXRhICs9ICcwJztcbiAgICAgIGRhdGEgKz0gJ35bJyArIHBvcy54ICsgJywnICsgcG9zLnkgKyAnXVxccic7XG4gICAgICBzZWxmLnNlbmQoZGF0YSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHNlbGYuZGVjTG9jYXRvcikge1xuICAgICAgLy8gTk9URTogVW5zdGFibGUuXG4gICAgICBidXR0b24gJj0gMztcbiAgICAgIHBvcy54IC09IDMyO1xuICAgICAgcG9zLnkgLT0gMzI7XG4gICAgICBpZiAoYnV0dG9uID09PSAwKSBidXR0b24gPSAyO1xuICAgICAgZWxzZSBpZiAoYnV0dG9uID09PSAxKSBidXR0b24gPSA0O1xuICAgICAgZWxzZSBpZiAoYnV0dG9uID09PSAyKSBidXR0b24gPSA2O1xuICAgICAgZWxzZSBpZiAoYnV0dG9uID09PSAzKSBidXR0b24gPSAzO1xuICAgICAgc2VsZi5zZW5kKCdcXHgxYlsnXG4gICAgICAgICsgYnV0dG9uXG4gICAgICAgICsgJzsnXG4gICAgICAgICsgKGJ1dHRvbiA9PT0gMyA/IDQgOiAwKVxuICAgICAgICArICc7J1xuICAgICAgICArIHBvcy55XG4gICAgICAgICsgJzsnXG4gICAgICAgICsgcG9zLnhcbiAgICAgICAgKyAnOydcbiAgICAgICAgKyAocG9zLnBhZ2UgfHwgMClcbiAgICAgICAgKyAnJncnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoc2VsZi51cnh2dE1vdXNlKSB7XG4gICAgICBwb3MueCAtPSAzMjtcbiAgICAgIHBvcy55IC09IDMyO1xuICAgICAgcG9zLngrKztcbiAgICAgIHBvcy55Kys7XG4gICAgICBzZWxmLnNlbmQoJ1xceDFiWycgKyBidXR0b24gKyAnOycgKyBwb3MueCArICc7JyArIHBvcy55ICsgJ00nKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoc2VsZi5zZ3JNb3VzZSkge1xuICAgICAgcG9zLnggLT0gMzI7XG4gICAgICBwb3MueSAtPSAzMjtcbiAgICAgIHNlbGYuc2VuZCgnXFx4MWJbPCdcbiAgICAgICAgKyAoKGJ1dHRvbiAmIDMpID09PSAzID8gYnV0dG9uICYgfjMgOiBidXR0b24pXG4gICAgICAgICsgJzsnXG4gICAgICAgICsgcG9zLnhcbiAgICAgICAgKyAnOydcbiAgICAgICAgKyBwb3MueVxuICAgICAgICArICgoYnV0dG9uICYgMykgPT09IDMgPyAnbScgOiAnTScpKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgZGF0YSA9IFtdO1xuXG4gICAgZW5jb2RlKGRhdGEsIGJ1dHRvbik7XG4gICAgZW5jb2RlKGRhdGEsIHBvcy54KTtcbiAgICBlbmNvZGUoZGF0YSwgcG9zLnkpO1xuXG4gICAgc2VsZi5zZW5kKCdcXHgxYltNJyArIFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkoU3RyaW5nLCBkYXRhKSk7XG4gIH1cblxuICBmdW5jdGlvbiBnZXRCdXR0b24oZXYpIHtcbiAgICB2YXIgYnV0dG9uXG4gICAgICAsIHNoaWZ0XG4gICAgICAsIG1ldGFcbiAgICAgICwgY3RybFxuICAgICAgLCBtb2Q7XG5cbiAgICAvLyB0d28gbG93IGJpdHM6XG4gICAgLy8gMCA9IGxlZnRcbiAgICAvLyAxID0gbWlkZGxlXG4gICAgLy8gMiA9IHJpZ2h0XG4gICAgLy8gMyA9IHJlbGVhc2VcbiAgICAvLyB3aGVlbCB1cC9kb3duOlxuICAgIC8vIDEsIGFuZCAyIC0gd2l0aCA2NCBhZGRlZFxuICAgIHN3aXRjaCAoZXYudHlwZSkge1xuICAgICAgY2FzZSAnbW91c2Vkb3duJzpcbiAgICAgICAgYnV0dG9uID0gZXYuYnV0dG9uICE9IG51bGxcbiAgICAgICAgICA/ICtldi5idXR0b25cbiAgICAgICAgICA6IGV2LndoaWNoICE9IG51bGxcbiAgICAgICAgICAgID8gZXYud2hpY2ggLSAxXG4gICAgICAgICAgICA6IG51bGw7XG5cbiAgICAgICAgaWYgKHNlbGYuaXNNU0lFKSB7XG4gICAgICAgICAgYnV0dG9uID0gYnV0dG9uID09PSAxID8gMCA6IGJ1dHRvbiA9PT0gNCA/IDEgOiBidXR0b247XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdtb3VzZXVwJzpcbiAgICAgICAgYnV0dG9uID0gMztcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdET01Nb3VzZVNjcm9sbCc6XG4gICAgICAgIGJ1dHRvbiA9IGV2LmRldGFpbCA8IDBcbiAgICAgICAgICA/IDY0XG4gICAgICAgICAgOiA2NTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdtb3VzZXdoZWVsJzpcbiAgICAgICAgYnV0dG9uID0gZXYud2hlZWxEZWx0YVkgPiAwXG4gICAgICAgICAgPyA2NFxuICAgICAgICAgIDogNjU7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIC8vIG5leHQgdGhyZWUgYml0cyBhcmUgdGhlIG1vZGlmaWVyczpcbiAgICAvLyA0ID0gc2hpZnQsIDggPSBtZXRhLCAxNiA9IGNvbnRyb2xcbiAgICBzaGlmdCA9IGV2LnNoaWZ0S2V5ID8gNCA6IDA7XG4gICAgbWV0YSA9IGV2Lm1ldGFLZXkgPyA4IDogMDtcbiAgICBjdHJsID0gZXYuY3RybEtleSA/IDE2IDogMDtcbiAgICBtb2QgPSBzaGlmdCB8IG1ldGEgfCBjdHJsO1xuXG4gICAgLy8gbm8gbW9kc1xuICAgIGlmIChzZWxmLnZ0MjAwTW91c2UpIHtcbiAgICAgIC8vIGN0cmwgb25seVxuICAgICAgbW9kICY9IGN0cmw7XG4gICAgfSBlbHNlIGlmICghc2VsZi5ub3JtYWxNb3VzZSkge1xuICAgICAgbW9kID0gMDtcbiAgICB9XG5cbiAgICAvLyBpbmNyZW1lbnQgdG8gU1BcbiAgICBidXR0b24gPSAoMzIgKyAobW9kIDw8IDIpKSArIGJ1dHRvbjtcblxuICAgIHJldHVybiBidXR0b247XG4gIH1cblxuICAvLyBtb3VzZSBjb29yZGluYXRlcyBtZWFzdXJlZCBpbiBjb2xzL3Jvd3NcbiAgZnVuY3Rpb24gZ2V0Q29vcmRzKGV2KSB7XG4gICAgdmFyIHgsIHksIHcsIGgsIGVsO1xuXG4gICAgLy8gaWdub3JlIGJyb3dzZXJzIHdpdGhvdXQgcGFnZVggZm9yIG5vd1xuICAgIGlmIChldi5wYWdlWCA9PSBudWxsKSByZXR1cm47XG5cbiAgICB4ID0gZXYucGFnZVg7XG4gICAgeSA9IGV2LnBhZ2VZO1xuICAgIGVsID0gc2VsZi5lbGVtZW50O1xuXG4gICAgLy8gc2hvdWxkIHByb2JhYmx5IGNoZWNrIG9mZnNldFBhcmVudFxuICAgIC8vIGJ1dCB0aGlzIGlzIG1vcmUgcG9ydGFibGVcbiAgICB3aGlsZSAoZWwgJiYgZWwgIT09IHNlbGYuZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50KSB7XG4gICAgICB4IC09IGVsLm9mZnNldExlZnQ7XG4gICAgICB5IC09IGVsLm9mZnNldFRvcDtcbiAgICAgIGVsID0gJ29mZnNldFBhcmVudCcgaW4gZWxcbiAgICAgICAgPyBlbC5vZmZzZXRQYXJlbnRcbiAgICAgICAgOiBlbC5wYXJlbnROb2RlO1xuICAgIH1cblxuICAgIC8vIGNvbnZlcnQgdG8gY29scy9yb3dzXG4gICAgdyA9IHNlbGYuZWxlbWVudC5jbGllbnRXaWR0aDtcbiAgICBoID0gc2VsZi5lbGVtZW50LmNsaWVudEhlaWdodDtcbiAgICB4ID0gTWF0aC5yb3VuZCgoeCAvIHcpICogc2VsZi5jb2xzKTtcbiAgICB5ID0gTWF0aC5yb3VuZCgoeSAvIGgpICogc2VsZi5yb3dzKTtcblxuICAgIC8vIGJlIHN1cmUgdG8gYXZvaWQgc2VuZGluZ1xuICAgIC8vIGJhZCBwb3NpdGlvbnMgdG8gdGhlIHByb2dyYW1cbiAgICBpZiAoeCA8IDApIHggPSAwO1xuICAgIGlmICh4ID4gc2VsZi5jb2xzKSB4ID0gc2VsZi5jb2xzO1xuICAgIGlmICh5IDwgMCkgeSA9IDA7XG4gICAgaWYgKHkgPiBzZWxmLnJvd3MpIHkgPSBzZWxmLnJvd3M7XG5cbiAgICAvLyB4dGVybSBzZW5kcyByYXcgYnl0ZXMgYW5kXG4gICAgLy8gc3RhcnRzIGF0IDMyIChTUCkgZm9yIGVhY2guXG4gICAgeCArPSAzMjtcbiAgICB5ICs9IDMyO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHg6IHgsXG4gICAgICB5OiB5LFxuICAgICAgdHlwZTogZXYudHlwZSA9PT0gd2hlZWxFdmVudFxuICAgICAgICA/ICdtb3VzZXdoZWVsJ1xuICAgICAgICA6IGV2LnR5cGVcbiAgICB9O1xuICB9XG5cbiAgb24oZWwsICdtb3VzZWRvd24nLCBmdW5jdGlvbihldikge1xuICAgIGlmICghc2VsZi5tb3VzZUV2ZW50cykgcmV0dXJuO1xuXG4gICAgLy8gc2VuZCB0aGUgYnV0dG9uXG4gICAgc2VuZEJ1dHRvbihldik7XG5cbiAgICAvLyBlbnN1cmUgZm9jdXNcbiAgICBzZWxmLmZvY3VzKCk7XG5cbiAgICAvLyBmaXggZm9yIG9kZCBidWdcbiAgICAvL2lmIChzZWxmLnZ0MjAwTW91c2UgJiYgIXNlbGYubm9ybWFsTW91c2UpIHtcbiAgICBpZiAoc2VsZi52dDIwME1vdXNlKSB7XG4gICAgICBzZW5kQnV0dG9uKHsgX19wcm90b19fOiBldiwgdHlwZTogJ21vdXNldXAnIH0pO1xuICAgICAgcmV0dXJuIGNhbmNlbChldik7XG4gICAgfVxuXG4gICAgLy8gYmluZCBldmVudHNcbiAgICBpZiAoc2VsZi5ub3JtYWxNb3VzZSkgb24oc2VsZi5kb2N1bWVudCwgJ21vdXNlbW92ZScsIHNlbmRNb3ZlKTtcblxuICAgIC8vIHgxMCBjb21wYXRpYmlsaXR5IG1vZGUgY2FuJ3Qgc2VuZCBidXR0b24gcmVsZWFzZXNcbiAgICBpZiAoIXNlbGYueDEwTW91c2UpIHtcbiAgICAgIG9uKHNlbGYuZG9jdW1lbnQsICdtb3VzZXVwJywgZnVuY3Rpb24gdXAoZXYpIHtcbiAgICAgICAgc2VuZEJ1dHRvbihldik7XG4gICAgICAgIGlmIChzZWxmLm5vcm1hbE1vdXNlKSBvZmYoc2VsZi5kb2N1bWVudCwgJ21vdXNlbW92ZScsIHNlbmRNb3ZlKTtcbiAgICAgICAgb2ZmKHNlbGYuZG9jdW1lbnQsICdtb3VzZXVwJywgdXApO1xuICAgICAgICByZXR1cm4gY2FuY2VsKGV2KTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBjYW5jZWwoZXYpO1xuICB9KTtcblxuICAvL2lmIChzZWxmLm5vcm1hbE1vdXNlKSB7XG4gIC8vICBvbihzZWxmLmRvY3VtZW50LCAnbW91c2Vtb3ZlJywgc2VuZE1vdmUpO1xuICAvL31cblxuICBvbihlbCwgd2hlZWxFdmVudCwgZnVuY3Rpb24oZXYpIHtcbiAgICBpZiAoIXNlbGYubW91c2VFdmVudHMpIHJldHVybjtcbiAgICBpZiAoc2VsZi54MTBNb3VzZVxuICAgICAgICB8fCBzZWxmLnZ0MzAwTW91c2VcbiAgICAgICAgfHwgc2VsZi5kZWNMb2NhdG9yKSByZXR1cm47XG4gICAgc2VuZEJ1dHRvbihldik7XG4gICAgcmV0dXJuIGNhbmNlbChldik7XG4gIH0pO1xuXG4gIC8vIGFsbG93IG1vdXNld2hlZWwgc2Nyb2xsaW5nIGluXG4gIC8vIHRoZSBzaGVsbCBmb3IgZXhhbXBsZVxuICBvbihlbCwgd2hlZWxFdmVudCwgZnVuY3Rpb24oZXYpIHtcbiAgICBpZiAoc2VsZi5tb3VzZUV2ZW50cykgcmV0dXJuO1xuICAgIGlmIChzZWxmLmFwcGxpY2F0aW9uS2V5cGFkKSByZXR1cm47XG4gICAgaWYgKGV2LnR5cGUgPT09ICdET01Nb3VzZVNjcm9sbCcpIHtcbiAgICAgIHNlbGYuc2Nyb2xsRGlzcChldi5kZXRhaWwgPCAwID8gLTUgOiA1KTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2VsZi5zY3JvbGxEaXNwKGV2LndoZWVsRGVsdGFZID4gMCA/IC01IDogNSk7XG4gICAgfVxuICAgIHJldHVybiBjYW5jZWwoZXYpO1xuICB9KTtcbn07XG5cbi8qKlxuICogRGVzdHJveSBUZXJtaW5hbFxuICovXG5cblRlcm1pbmFsLnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMucmVhZGFibGUgPSBmYWxzZTtcbiAgdGhpcy53cml0YWJsZSA9IGZhbHNlO1xuICB0aGlzLl9ldmVudHMgPSB7fTtcbiAgdGhpcy5oYW5kbGVyID0gZnVuY3Rpb24oKSB7fTtcbiAgdGhpcy53cml0ZSA9IGZ1bmN0aW9uKCkge307XG4gIGlmICh0aGlzLmVsZW1lbnQucGFyZW50Tm9kZSkge1xuICAgIHRoaXMuZWxlbWVudC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMuZWxlbWVudCk7XG4gIH1cbiAgLy90aGlzLmVtaXQoJ2Nsb3NlJyk7XG59O1xuXG4vKipcbiAqIFJlbmRlcmluZyBFbmdpbmVcbiAqL1xuXG4vLyBJbiB0aGUgc2NyZWVuIGJ1ZmZlciwgZWFjaCBjaGFyYWN0ZXJcbi8vIGlzIHN0b3JlZCBhcyBhIGFuIGFycmF5IHdpdGggYSBjaGFyYWN0ZXJcbi8vIGFuZCBhIDMyLWJpdCBpbnRlZ2VyLlxuLy8gRmlyc3QgdmFsdWU6IGEgdXRmLTE2IGNoYXJhY3Rlci5cbi8vIFNlY29uZCB2YWx1ZTpcbi8vIE5leHQgOSBiaXRzOiBiYWNrZ3JvdW5kIGNvbG9yICgwLTUxMSkuXG4vLyBOZXh0IDkgYml0czogZm9yZWdyb3VuZCBjb2xvciAoMC01MTEpLlxuLy8gTmV4dCAxNCBiaXRzOiBhIG1hc2sgZm9yIG1pc2MuIGZsYWdzOlxuLy8gICAxPWJvbGQsIDI9dW5kZXJsaW5lLCA0PWJsaW5rLCA4PWludmVyc2UsIDE2PWludmlzaWJsZVxuXG5UZXJtaW5hbC5wcm90b3R5cGUucmVmcmVzaCA9IGZ1bmN0aW9uKHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHhcbiAgICAsIHlcbiAgICAsIGlcbiAgICAsIGxpbmVcbiAgICAsIG91dFxuICAgICwgY2hcbiAgICAsIHdpZHRoXG4gICAgLCBkYXRhXG4gICAgLCBhdHRyXG4gICAgLCBiZ1xuICAgICwgZmdcbiAgICAsIGZsYWdzXG4gICAgLCByb3dcbiAgICAsIHBhcmVudDtcblxuICBpZiAoZW5kIC0gc3RhcnQgPj0gdGhpcy5yb3dzIC8gMikge1xuICAgIHBhcmVudCA9IHRoaXMuZWxlbWVudC5wYXJlbnROb2RlO1xuICAgIGlmIChwYXJlbnQpIHBhcmVudC5yZW1vdmVDaGlsZCh0aGlzLmVsZW1lbnQpO1xuICB9XG5cbiAgd2lkdGggPSB0aGlzLmNvbHM7XG4gIHkgPSBzdGFydDtcblxuICBpZiAoZW5kID49IHRoaXMubGluZXMubGVuZ3RoKSB7XG4gICAgdGhpcy5sb2coJ2BlbmRgIGlzIHRvbyBsYXJnZS4gTW9zdCBsaWtlbHkgYSBiYWQgQ1NSLicpO1xuICAgIGVuZCA9IHRoaXMubGluZXMubGVuZ3RoIC0gMTtcbiAgfVxuXG4gIGZvciAoOyB5IDw9IGVuZDsgeSsrKSB7XG4gICAgcm93ID0geSArIHRoaXMueWRpc3A7XG5cbiAgICBsaW5lID0gdGhpcy5saW5lc1tyb3ddO1xuICAgIG91dCA9ICcnO1xuXG4gICAgaWYgKHkgPT09IHRoaXMueVxuICAgICAgICAmJiB0aGlzLmN1cnNvclN0YXRlXG4gICAgICAgICYmICh0aGlzLnlkaXNwID09PSB0aGlzLnliYXNlIHx8IHRoaXMuc2VsZWN0TW9kZSlcbiAgICAgICAgJiYgIXRoaXMuY3Vyc29ySGlkZGVuKSB7XG4gICAgICB4ID0gdGhpcy54O1xuICAgIH0gZWxzZSB7XG4gICAgICB4ID0gLTE7XG4gICAgfVxuXG4gICAgYXR0ciA9IHRoaXMuZGVmQXR0cjtcbiAgICBpID0gMDtcblxuICAgIGZvciAoOyBpIDwgd2lkdGg7IGkrKykge1xuICAgICAgZGF0YSA9IGxpbmVbaV1bMF07XG4gICAgICBjaCA9IGxpbmVbaV1bMV07XG5cbiAgICAgIGlmIChpID09PSB4KSBkYXRhID0gLTE7XG5cbiAgICAgIGlmIChkYXRhICE9PSBhdHRyKSB7XG4gICAgICAgIGlmIChhdHRyICE9PSB0aGlzLmRlZkF0dHIpIHtcbiAgICAgICAgICBvdXQgKz0gJzwvc3Bhbj4nO1xuICAgICAgICB9XG4gICAgICAgIGlmIChkYXRhICE9PSB0aGlzLmRlZkF0dHIpIHtcbiAgICAgICAgICBpZiAoZGF0YSA9PT0gLTEpIHtcbiAgICAgICAgICAgIG91dCArPSAnPHNwYW4gY2xhc3M9XCJyZXZlcnNlLXZpZGVvIHRlcm1pbmFsLWN1cnNvclwiPic7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG91dCArPSAnPHNwYW4gc3R5bGU9XCInO1xuXG4gICAgICAgICAgICBiZyA9IGRhdGEgJiAweDFmZjtcbiAgICAgICAgICAgIGZnID0gKGRhdGEgPj4gOSkgJiAweDFmZjtcbiAgICAgICAgICAgIGZsYWdzID0gZGF0YSA+PiAxODtcblxuICAgICAgICAgICAgLy8gYm9sZFxuICAgICAgICAgICAgaWYgKGZsYWdzICYgMSkge1xuICAgICAgICAgICAgICBpZiAoIVRlcm1pbmFsLmJyb2tlbkJvbGQpIHtcbiAgICAgICAgICAgICAgICBvdXQgKz0gJ2ZvbnQtd2VpZ2h0OmJvbGQ7JztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAvLyBTZWU6IFhUZXJtKmJvbGRDb2xvcnNcbiAgICAgICAgICAgICAgaWYgKGZnIDwgOCkgZmcgKz0gODtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gdW5kZXJsaW5lXG4gICAgICAgICAgICBpZiAoZmxhZ3MgJiAyKSB7XG4gICAgICAgICAgICAgIG91dCArPSAndGV4dC1kZWNvcmF0aW9uOnVuZGVybGluZTsnO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBibGlua1xuICAgICAgICAgICAgaWYgKGZsYWdzICYgNCkge1xuICAgICAgICAgICAgICBpZiAoZmxhZ3MgJiAyKSB7XG4gICAgICAgICAgICAgICAgb3V0ID0gb3V0LnNsaWNlKDAsIC0xKTtcbiAgICAgICAgICAgICAgICBvdXQgKz0gJyBibGluazsnO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG91dCArPSAndGV4dC1kZWNvcmF0aW9uOmJsaW5rOyc7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gaW52ZXJzZVxuICAgICAgICAgICAgaWYgKGZsYWdzICYgOCkge1xuICAgICAgICAgICAgICBiZyA9IChkYXRhID4+IDkpICYgMHgxZmY7XG4gICAgICAgICAgICAgIGZnID0gZGF0YSAmIDB4MWZmO1xuICAgICAgICAgICAgICAvLyBTaG91bGQgaW52ZXJzZSBqdXN0IGJlIGJlZm9yZSB0aGVcbiAgICAgICAgICAgICAgLy8gYWJvdmUgYm9sZENvbG9ycyBlZmZlY3QgaW5zdGVhZD9cbiAgICAgICAgICAgICAgaWYgKChmbGFncyAmIDEpICYmIGZnIDwgOCkgZmcgKz0gODtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gaW52aXNpYmxlXG4gICAgICAgICAgICBpZiAoZmxhZ3MgJiAxNikge1xuICAgICAgICAgICAgICBvdXQgKz0gJ3Zpc2liaWxpdHk6aGlkZGVuOyc7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIG91dCArPSAnXCIgY2xhc3M9XCInXG4gICAgICAgICAgICAvLyAgICsgJ3Rlcm0tYmctY29sb3ItJyArIGJnXG4gICAgICAgICAgICAvLyAgICsgJyAnXG4gICAgICAgICAgICAvLyAgICsgJ3Rlcm0tZmctY29sb3ItJyArIGZnXG4gICAgICAgICAgICAvLyAgICsgJ1wiPic7XG5cbiAgICAgICAgICAgIGlmIChiZyAhPT0gMjU2KSB7XG4gICAgICAgICAgICAgIG91dCArPSAnYmFja2dyb3VuZC1jb2xvcjonXG4gICAgICAgICAgICAgICAgKyB0aGlzLmNvbG9yc1tiZ11cbiAgICAgICAgICAgICAgICArICc7JztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGZnICE9PSAyNTcpIHtcbiAgICAgICAgICAgICAgb3V0ICs9ICdjb2xvcjonXG4gICAgICAgICAgICAgICAgKyB0aGlzLmNvbG9yc1tmZ11cbiAgICAgICAgICAgICAgICArICc7JztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgb3V0ICs9ICdcIj4nO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBzd2l0Y2ggKGNoKSB7XG4gICAgICAgIGNhc2UgJyYnOlxuICAgICAgICAgIG91dCArPSAnJmFtcDsnO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICc8JzpcbiAgICAgICAgICBvdXQgKz0gJyZsdDsnO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICc+JzpcbiAgICAgICAgICBvdXQgKz0gJyZndDsnO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIGlmIChjaCA8PSAnICcpIHtcbiAgICAgICAgICAgIG91dCArPSAnJm5ic3A7JztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKGlzV2lkZShjaCkpIGkrKztcbiAgICAgICAgICAgIG91dCArPSBjaDtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIGF0dHIgPSBkYXRhO1xuICAgIH1cblxuICAgIGlmIChhdHRyICE9PSB0aGlzLmRlZkF0dHIpIHtcbiAgICAgIG91dCArPSAnPC9zcGFuPic7XG4gICAgfVxuXG4gICAgdGhpcy5jaGlsZHJlblt5XS5pbm5lckhUTUwgPSBvdXQ7XG4gIH1cblxuICBpZiAocGFyZW50KSBwYXJlbnQuYXBwZW5kQ2hpbGQodGhpcy5lbGVtZW50KTtcbn07XG5cblRlcm1pbmFsLnByb3RvdHlwZS5fY3Vyc29yQmxpbmsgPSBmdW5jdGlvbigpIHtcbiAgaWYgKFRlcm1pbmFsLmZvY3VzICE9PSB0aGlzKSByZXR1cm47XG4gIHRoaXMuY3Vyc29yU3RhdGUgXj0gMTtcbiAgdGhpcy5yZWZyZXNoKHRoaXMueSwgdGhpcy55KTtcbn07XG5cblRlcm1pbmFsLnByb3RvdHlwZS5zaG93Q3Vyc29yID0gZnVuY3Rpb24oKSB7XG4gIGlmICghdGhpcy5jdXJzb3JTdGF0ZSkge1xuICAgIHRoaXMuY3Vyc29yU3RhdGUgPSAxO1xuICAgIHRoaXMucmVmcmVzaCh0aGlzLnksIHRoaXMueSk7XG4gIH0gZWxzZSB7XG4gICAgLy8gVGVtcG9yYXJpbHkgZGlzYWJsZWQ6XG4gICAgLy8gdGhpcy5yZWZyZXNoQmxpbmsoKTtcbiAgfVxufTtcblxuVGVybWluYWwucHJvdG90eXBlLnN0YXJ0QmxpbmsgPSBmdW5jdGlvbigpIHtcbiAgaWYgKCF0aGlzLmN1cnNvckJsaW5rKSByZXR1cm47XG4gIHZhciBzZWxmID0gdGhpcztcbiAgdGhpcy5fYmxpbmtlciA9IGZ1bmN0aW9uKCkge1xuICAgIHNlbGYuX2N1cnNvckJsaW5rKCk7XG4gIH07XG4gIHRoaXMuX2JsaW5rID0gc2V0SW50ZXJ2YWwodGhpcy5fYmxpbmtlciwgNTAwKTtcbn07XG5cblRlcm1pbmFsLnByb3RvdHlwZS5yZWZyZXNoQmxpbmsgPSBmdW5jdGlvbigpIHtcbiAgaWYgKCF0aGlzLmN1cnNvckJsaW5rKSByZXR1cm47XG4gIGNsZWFySW50ZXJ2YWwodGhpcy5fYmxpbmspO1xuICB0aGlzLl9ibGluayA9IHNldEludGVydmFsKHRoaXMuX2JsaW5rZXIsIDUwMCk7XG59O1xuXG5UZXJtaW5hbC5wcm90b3R5cGUuc2Nyb2xsID0gZnVuY3Rpb24oKSB7XG4gIHZhciByb3c7XG5cbiAgaWYgKCsrdGhpcy55YmFzZSA9PT0gdGhpcy5zY3JvbGxiYWNrKSB7XG4gICAgdGhpcy55YmFzZSA9IHRoaXMueWJhc2UgLyAyIHwgMDtcbiAgICB0aGlzLmxpbmVzID0gdGhpcy5saW5lcy5zbGljZSgtKHRoaXMueWJhc2UgKyB0aGlzLnJvd3MpICsgMSk7XG4gIH1cblxuICB0aGlzLnlkaXNwID0gdGhpcy55YmFzZTtcblxuICAvLyBsYXN0IGxpbmVcbiAgcm93ID0gdGhpcy55YmFzZSArIHRoaXMucm93cyAtIDE7XG5cbiAgLy8gc3VidHJhY3QgdGhlIGJvdHRvbSBzY3JvbGwgcmVnaW9uXG4gIHJvdyAtPSB0aGlzLnJvd3MgLSAxIC0gdGhpcy5zY3JvbGxCb3R0b207XG5cbiAgaWYgKHJvdyA9PT0gdGhpcy5saW5lcy5sZW5ndGgpIHtcbiAgICAvLyBwb3RlbnRpYWwgb3B0aW1pemF0aW9uOlxuICAgIC8vIHB1c2hpbmcgaXMgZmFzdGVyIHRoYW4gc3BsaWNpbmdcbiAgICAvLyB3aGVuIHRoZXkgYW1vdW50IHRvIHRoZSBzYW1lXG4gICAgLy8gYmVoYXZpb3IuXG4gICAgdGhpcy5saW5lcy5wdXNoKHRoaXMuYmxhbmtMaW5lKCkpO1xuICB9IGVsc2Uge1xuICAgIC8vIGFkZCBvdXIgbmV3IGxpbmVcbiAgICB0aGlzLmxpbmVzLnNwbGljZShyb3csIDAsIHRoaXMuYmxhbmtMaW5lKCkpO1xuICB9XG5cbiAgaWYgKHRoaXMuc2Nyb2xsVG9wICE9PSAwKSB7XG4gICAgaWYgKHRoaXMueWJhc2UgIT09IDApIHtcbiAgICAgIHRoaXMueWJhc2UtLTtcbiAgICAgIHRoaXMueWRpc3AgPSB0aGlzLnliYXNlO1xuICAgIH1cbiAgICB0aGlzLmxpbmVzLnNwbGljZSh0aGlzLnliYXNlICsgdGhpcy5zY3JvbGxUb3AsIDEpO1xuICB9XG5cbiAgLy8gdGhpcy5tYXhSYW5nZSgpO1xuICB0aGlzLnVwZGF0ZVJhbmdlKHRoaXMuc2Nyb2xsVG9wKTtcbiAgdGhpcy51cGRhdGVSYW5nZSh0aGlzLnNjcm9sbEJvdHRvbSk7XG59O1xuXG5UZXJtaW5hbC5wcm90b3R5cGUuc2Nyb2xsRGlzcCA9IGZ1bmN0aW9uKGRpc3ApIHtcbiAgdGhpcy55ZGlzcCArPSBkaXNwO1xuXG4gIGlmICh0aGlzLnlkaXNwID4gdGhpcy55YmFzZSkge1xuICAgIHRoaXMueWRpc3AgPSB0aGlzLnliYXNlO1xuICB9IGVsc2UgaWYgKHRoaXMueWRpc3AgPCAwKSB7XG4gICAgdGhpcy55ZGlzcCA9IDA7XG4gIH1cblxuICB0aGlzLnJlZnJlc2goMCwgdGhpcy5yb3dzIC0gMSk7XG59O1xuXG5UZXJtaW5hbC5wcm90b3R5cGUud3JpdGUgPSBmdW5jdGlvbihkYXRhKSB7XG4gIHZhciBsID0gZGF0YS5sZW5ndGhcbiAgICAsIGkgPSAwXG4gICAgLCBqXG4gICAgLCBjc1xuICAgICwgY2g7XG5cbiAgdGhpcy5yZWZyZXNoU3RhcnQgPSB0aGlzLnk7XG4gIHRoaXMucmVmcmVzaEVuZCA9IHRoaXMueTtcblxuICBpZiAodGhpcy55YmFzZSAhPT0gdGhpcy55ZGlzcCkge1xuICAgIHRoaXMueWRpc3AgPSB0aGlzLnliYXNlO1xuICAgIHRoaXMubWF4UmFuZ2UoKTtcbiAgfVxuXG4gIC8vIHRoaXMubG9nKEpTT04uc3RyaW5naWZ5KGRhdGEucmVwbGFjZSgvXFx4MWIvZywgJ15bJykpKTtcblxuICBmb3IgKDsgaSA8IGw7IGkrKykge1xuICAgIGNoID0gZGF0YVtpXTtcbiAgICBzd2l0Y2ggKHRoaXMuc3RhdGUpIHtcbiAgICAgIGNhc2Ugbm9ybWFsOlxuICAgICAgICBzd2l0Y2ggKGNoKSB7XG4gICAgICAgICAgLy8gJ1xcMCdcbiAgICAgICAgICAvLyBjYXNlICdcXDAnOlxuICAgICAgICAgIC8vIGNhc2UgJ1xcMjAwJzpcbiAgICAgICAgICAvLyAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gJ1xcYSdcbiAgICAgICAgICBjYXNlICdcXHgwNyc6XG4gICAgICAgICAgICB0aGlzLmJlbGwoKTtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gJ1xcbicsICdcXHYnLCAnXFxmJ1xuICAgICAgICAgIGNhc2UgJ1xcbic6XG4gICAgICAgICAgY2FzZSAnXFx4MGInOlxuICAgICAgICAgIGNhc2UgJ1xceDBjJzpcbiAgICAgICAgICAgIGlmICh0aGlzLmNvbnZlcnRFb2wpIHtcbiAgICAgICAgICAgICAgdGhpcy54ID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIFRPRE86IEltcGxlbWVudCBlYXRfbmV3bGluZV9nbGl0Y2guXG4gICAgICAgICAgICAvLyBpZiAodGhpcy5yZWFsWCA+PSB0aGlzLmNvbHMpIGJyZWFrO1xuICAgICAgICAgICAgLy8gdGhpcy5yZWFsWCA9IDA7XG4gICAgICAgICAgICB0aGlzLnkrKztcbiAgICAgICAgICAgIGlmICh0aGlzLnkgPiB0aGlzLnNjcm9sbEJvdHRvbSkge1xuICAgICAgICAgICAgICB0aGlzLnktLTtcbiAgICAgICAgICAgICAgdGhpcy5zY3JvbGwoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gJ1xccidcbiAgICAgICAgICBjYXNlICdcXHInOlxuICAgICAgICAgICAgdGhpcy54ID0gMDtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gJ1xcYidcbiAgICAgICAgICBjYXNlICdcXHgwOCc6XG4gICAgICAgICAgICBpZiAodGhpcy54ID4gMCkge1xuICAgICAgICAgICAgICB0aGlzLngtLTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gJ1xcdCdcbiAgICAgICAgICBjYXNlICdcXHQnOlxuICAgICAgICAgICAgdGhpcy54ID0gdGhpcy5uZXh0U3RvcCgpO1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAvLyBzaGlmdCBvdXRcbiAgICAgICAgICBjYXNlICdcXHgwZSc6XG4gICAgICAgICAgICB0aGlzLnNldGdMZXZlbCgxKTtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gc2hpZnQgaW5cbiAgICAgICAgICBjYXNlICdcXHgwZic6XG4gICAgICAgICAgICB0aGlzLnNldGdMZXZlbCgwKTtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gJ1xcZSdcbiAgICAgICAgICBjYXNlICdcXHgxYic6XG4gICAgICAgICAgICB0aGlzLnN0YXRlID0gZXNjYXBlZDtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIC8vICcgJ1xuICAgICAgICAgICAgaWYgKGNoID49ICcgJykge1xuICAgICAgICAgICAgICBpZiAodGhpcy5jaGFyc2V0ICYmIHRoaXMuY2hhcnNldFtjaF0pIHtcbiAgICAgICAgICAgICAgICBjaCA9IHRoaXMuY2hhcnNldFtjaF07XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBpZiAodGhpcy54ID49IHRoaXMuY29scykge1xuICAgICAgICAgICAgICAgIHRoaXMueCA9IDA7XG4gICAgICAgICAgICAgICAgdGhpcy55Kys7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMueSA+IHRoaXMuc2Nyb2xsQm90dG9tKSB7XG4gICAgICAgICAgICAgICAgICB0aGlzLnktLTtcbiAgICAgICAgICAgICAgICAgIHRoaXMuc2Nyb2xsKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgdGhpcy5saW5lc1t0aGlzLnkgKyB0aGlzLnliYXNlXVt0aGlzLnhdID0gW3RoaXMuY3VyQXR0ciwgY2hdO1xuICAgICAgICAgICAgICB0aGlzLngrKztcbiAgICAgICAgICAgICAgdGhpcy51cGRhdGVSYW5nZSh0aGlzLnkpO1xuXG4gICAgICAgICAgICAgIGlmIChpc1dpZGUoY2gpKSB7XG4gICAgICAgICAgICAgICAgaiA9IHRoaXMueSArIHRoaXMueWJhc2U7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuY29scyA8IDIgfHwgdGhpcy54ID49IHRoaXMuY29scykge1xuICAgICAgICAgICAgICAgICAgdGhpcy5saW5lc1tqXVt0aGlzLnggLSAxXSA9IFt0aGlzLmN1ckF0dHIsICcgJ107XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy5saW5lc1tqXVt0aGlzLnhdID0gW3RoaXMuY3VyQXR0ciwgJyAnXTtcbiAgICAgICAgICAgICAgICB0aGlzLngrKztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIGVzY2FwZWQ6XG4gICAgICAgIHN3aXRjaCAoY2gpIHtcbiAgICAgICAgICAvLyBFU0MgWyBDb250cm9sIFNlcXVlbmNlIEludHJvZHVjZXIgKCBDU0kgaXMgMHg5YikuXG4gICAgICAgICAgY2FzZSAnWyc6XG4gICAgICAgICAgICB0aGlzLnBhcmFtcyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGFyYW0gPSAwO1xuICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IGNzaTtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gRVNDIF0gT3BlcmF0aW5nIFN5c3RlbSBDb21tYW5kICggT1NDIGlzIDB4OWQpLlxuICAgICAgICAgIGNhc2UgJ10nOlxuICAgICAgICAgICAgdGhpcy5wYXJhbXMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFBhcmFtID0gMDtcbiAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBvc2M7XG4gICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgIC8vIEVTQyBQIERldmljZSBDb250cm9sIFN0cmluZyAoIERDUyBpcyAweDkwKS5cbiAgICAgICAgICBjYXNlICdQJzpcbiAgICAgICAgICAgIHRoaXMucGFyYW1zID0gW107XG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRQYXJhbSA9IDA7XG4gICAgICAgICAgICB0aGlzLnN0YXRlID0gZGNzO1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAvLyBFU0MgXyBBcHBsaWNhdGlvbiBQcm9ncmFtIENvbW1hbmQgKCBBUEMgaXMgMHg5ZikuXG4gICAgICAgICAgY2FzZSAnXyc6XG4gICAgICAgICAgICB0aGlzLnN0YXRlID0gaWdub3JlO1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAvLyBFU0MgXiBQcml2YWN5IE1lc3NhZ2UgKCBQTSBpcyAweDllKS5cbiAgICAgICAgICBjYXNlICdeJzpcbiAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBpZ25vcmU7XG4gICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgIC8vIEVTQyBjIEZ1bGwgUmVzZXQgKFJJUykuXG4gICAgICAgICAgY2FzZSAnYyc6XG4gICAgICAgICAgICB0aGlzLnJlc2V0KCk7XG4gICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgIC8vIEVTQyBFIE5leHQgTGluZSAoIE5FTCBpcyAweDg1KS5cbiAgICAgICAgICAvLyBFU0MgRCBJbmRleCAoIElORCBpcyAweDg0KS5cbiAgICAgICAgICBjYXNlICdFJzpcbiAgICAgICAgICAgIHRoaXMueCA9IDA7XG4gICAgICAgICAgICA7XG4gICAgICAgICAgY2FzZSAnRCc6XG4gICAgICAgICAgICB0aGlzLmluZGV4KCk7XG4gICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgIC8vIEVTQyBNIFJldmVyc2UgSW5kZXggKCBSSSBpcyAweDhkKS5cbiAgICAgICAgICBjYXNlICdNJzpcbiAgICAgICAgICAgIHRoaXMucmV2ZXJzZUluZGV4KCk7XG4gICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgIC8vIEVTQyAlIFNlbGVjdCBkZWZhdWx0L3V0Zi04IGNoYXJhY3RlciBzZXQuXG4gICAgICAgICAgLy8gQCA9IGRlZmF1bHQsIEcgPSB1dGYtOFxuICAgICAgICAgIGNhc2UgJyUnOlxuICAgICAgICAgICAgLy90aGlzLmNoYXJzZXQgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy5zZXRnTGV2ZWwoMCk7XG4gICAgICAgICAgICB0aGlzLnNldGdDaGFyc2V0KDAsIFRlcm1pbmFsLmNoYXJzZXRzLlVTKTtcbiAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBub3JtYWw7XG4gICAgICAgICAgICBpKys7XG4gICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgIC8vIEVTQyAoLCksKiwrLC0sLiBEZXNpZ25hdGUgRzAtRzIgQ2hhcmFjdGVyIFNldC5cbiAgICAgICAgICBjYXNlICcoJzogLy8gPC0tIHRoaXMgc2VlbXMgdG8gZ2V0IGFsbCB0aGUgYXR0ZW50aW9uXG4gICAgICAgICAgY2FzZSAnKSc6XG4gICAgICAgICAgY2FzZSAnKic6XG4gICAgICAgICAgY2FzZSAnKyc6XG4gICAgICAgICAgY2FzZSAnLSc6XG4gICAgICAgICAgY2FzZSAnLic6XG4gICAgICAgICAgICBzd2l0Y2ggKGNoKSB7XG4gICAgICAgICAgICAgIGNhc2UgJygnOlxuICAgICAgICAgICAgICAgIHRoaXMuZ2NoYXJzZXQgPSAwO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICBjYXNlICcpJzpcbiAgICAgICAgICAgICAgICB0aGlzLmdjaGFyc2V0ID0gMTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgY2FzZSAnKic6XG4gICAgICAgICAgICAgICAgdGhpcy5nY2hhcnNldCA9IDI7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIGNhc2UgJysnOlxuICAgICAgICAgICAgICAgIHRoaXMuZ2NoYXJzZXQgPSAzO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICBjYXNlICctJzpcbiAgICAgICAgICAgICAgICB0aGlzLmdjaGFyc2V0ID0gMTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgY2FzZSAnLic6XG4gICAgICAgICAgICAgICAgdGhpcy5nY2hhcnNldCA9IDI7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnN0YXRlID0gY2hhcnNldDtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gRGVzaWduYXRlIEczIENoYXJhY3RlciBTZXQgKFZUMzAwKS5cbiAgICAgICAgICAvLyBBID0gSVNPIExhdGluLTEgU3VwcGxlbWVudGFsLlxuICAgICAgICAgIC8vIE5vdCBpbXBsZW1lbnRlZC5cbiAgICAgICAgICBjYXNlICcvJzpcbiAgICAgICAgICAgIHRoaXMuZ2NoYXJzZXQgPSAzO1xuICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IGNoYXJzZXQ7XG4gICAgICAgICAgICBpLS07XG4gICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgIC8vIEVTQyBOXG4gICAgICAgICAgLy8gU2luZ2xlIFNoaWZ0IFNlbGVjdCBvZiBHMiBDaGFyYWN0ZXIgU2V0XG4gICAgICAgICAgLy8gKCBTUzIgaXMgMHg4ZSkuIFRoaXMgYWZmZWN0cyBuZXh0IGNoYXJhY3RlciBvbmx5LlxuICAgICAgICAgIGNhc2UgJ04nOlxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgLy8gRVNDIE9cbiAgICAgICAgICAvLyBTaW5nbGUgU2hpZnQgU2VsZWN0IG9mIEczIENoYXJhY3RlciBTZXRcbiAgICAgICAgICAvLyAoIFNTMyBpcyAweDhmKS4gVGhpcyBhZmZlY3RzIG5leHQgY2hhcmFjdGVyIG9ubHkuXG4gICAgICAgICAgY2FzZSAnTyc6XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAvLyBFU0MgblxuICAgICAgICAgIC8vIEludm9rZSB0aGUgRzIgQ2hhcmFjdGVyIFNldCBhcyBHTCAoTFMyKS5cbiAgICAgICAgICBjYXNlICduJzpcbiAgICAgICAgICAgIHRoaXMuc2V0Z0xldmVsKDIpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgLy8gRVNDIG9cbiAgICAgICAgICAvLyBJbnZva2UgdGhlIEczIENoYXJhY3RlciBTZXQgYXMgR0wgKExTMykuXG4gICAgICAgICAgY2FzZSAnbyc6XG4gICAgICAgICAgICB0aGlzLnNldGdMZXZlbCgzKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIC8vIEVTQyB8XG4gICAgICAgICAgLy8gSW52b2tlIHRoZSBHMyBDaGFyYWN0ZXIgU2V0IGFzIEdSIChMUzNSKS5cbiAgICAgICAgICBjYXNlICd8JzpcbiAgICAgICAgICAgIHRoaXMuc2V0Z0xldmVsKDMpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgLy8gRVNDIH1cbiAgICAgICAgICAvLyBJbnZva2UgdGhlIEcyIENoYXJhY3RlciBTZXQgYXMgR1IgKExTMlIpLlxuICAgICAgICAgIGNhc2UgJ30nOlxuICAgICAgICAgICAgdGhpcy5zZXRnTGV2ZWwoMik7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAvLyBFU0MgflxuICAgICAgICAgIC8vIEludm9rZSB0aGUgRzEgQ2hhcmFjdGVyIFNldCBhcyBHUiAoTFMxUikuXG4gICAgICAgICAgY2FzZSAnfic6XG4gICAgICAgICAgICB0aGlzLnNldGdMZXZlbCgxKTtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gRVNDIDcgU2F2ZSBDdXJzb3IgKERFQ1NDKS5cbiAgICAgICAgICBjYXNlICc3JzpcbiAgICAgICAgICAgIHRoaXMuc2F2ZUN1cnNvcigpO1xuICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IG5vcm1hbDtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gRVNDIDggUmVzdG9yZSBDdXJzb3IgKERFQ1JDKS5cbiAgICAgICAgICBjYXNlICc4JzpcbiAgICAgICAgICAgIHRoaXMucmVzdG9yZUN1cnNvcigpO1xuICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IG5vcm1hbDtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gRVNDICMgMyBERUMgbGluZSBoZWlnaHQvd2lkdGhcbiAgICAgICAgICBjYXNlICcjJzpcbiAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBub3JtYWw7XG4gICAgICAgICAgICBpKys7XG4gICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgIC8vIEVTQyBIIFRhYiBTZXQgKEhUUyBpcyAweDg4KS5cbiAgICAgICAgICBjYXNlICdIJzpcbiAgICAgICAgICAgIHRoaXMudGFiU2V0KCk7XG4gICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgIC8vIEVTQyA9IEFwcGxpY2F0aW9uIEtleXBhZCAoREVDUEFNKS5cbiAgICAgICAgICBjYXNlICc9JzpcbiAgICAgICAgICAgIHRoaXMubG9nKCdTZXJpYWwgcG9ydCByZXF1ZXN0ZWQgYXBwbGljYXRpb24ga2V5cGFkLicpO1xuICAgICAgICAgICAgdGhpcy5hcHBsaWNhdGlvbktleXBhZCA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLnN0YXRlID0gbm9ybWFsO1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAvLyBFU0MgPiBOb3JtYWwgS2V5cGFkIChERUNQTk0pLlxuICAgICAgICAgIGNhc2UgJz4nOlxuICAgICAgICAgICAgdGhpcy5sb2coJ1N3aXRjaGluZyBiYWNrIHRvIG5vcm1hbCBrZXlwYWQuJyk7XG4gICAgICAgICAgICB0aGlzLmFwcGxpY2F0aW9uS2V5cGFkID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnN0YXRlID0gbm9ybWFsO1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IG5vcm1hbDtcbiAgICAgICAgICAgIHRoaXMuZXJyb3IoJ1Vua25vd24gRVNDIGNvbnRyb2w6ICVzLicsIGNoKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlIGNoYXJzZXQ6XG4gICAgICAgIHN3aXRjaCAoY2gpIHtcbiAgICAgICAgICBjYXNlICcwJzogLy8gREVDIFNwZWNpYWwgQ2hhcmFjdGVyIGFuZCBMaW5lIERyYXdpbmcgU2V0LlxuICAgICAgICAgICAgY3MgPSBUZXJtaW5hbC5jaGFyc2V0cy5TQ0xEO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnQSc6IC8vIFVLXG4gICAgICAgICAgICBjcyA9IFRlcm1pbmFsLmNoYXJzZXRzLlVLO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnQic6IC8vIFVuaXRlZCBTdGF0ZXMgKFVTQVNDSUkpLlxuICAgICAgICAgICAgY3MgPSBUZXJtaW5hbC5jaGFyc2V0cy5VUztcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJzQnOiAvLyBEdXRjaFxuICAgICAgICAgICAgY3MgPSBUZXJtaW5hbC5jaGFyc2V0cy5EdXRjaDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ0MnOiAvLyBGaW5uaXNoXG4gICAgICAgICAgY2FzZSAnNSc6XG4gICAgICAgICAgICBjcyA9IFRlcm1pbmFsLmNoYXJzZXRzLkZpbm5pc2g7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdSJzogLy8gRnJlbmNoXG4gICAgICAgICAgICBjcyA9IFRlcm1pbmFsLmNoYXJzZXRzLkZyZW5jaDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ1EnOiAvLyBGcmVuY2hDYW5hZGlhblxuICAgICAgICAgICAgY3MgPSBUZXJtaW5hbC5jaGFyc2V0cy5GcmVuY2hDYW5hZGlhbjtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ0snOiAvLyBHZXJtYW5cbiAgICAgICAgICAgIGNzID0gVGVybWluYWwuY2hhcnNldHMuR2VybWFuO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnWSc6IC8vIEl0YWxpYW5cbiAgICAgICAgICAgIGNzID0gVGVybWluYWwuY2hhcnNldHMuSXRhbGlhbjtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ0UnOiAvLyBOb3J3ZWdpYW5EYW5pc2hcbiAgICAgICAgICBjYXNlICc2JzpcbiAgICAgICAgICAgIGNzID0gVGVybWluYWwuY2hhcnNldHMuTm9yd2VnaWFuRGFuaXNoO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnWic6IC8vIFNwYW5pc2hcbiAgICAgICAgICAgIGNzID0gVGVybWluYWwuY2hhcnNldHMuU3BhbmlzaDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ0gnOiAvLyBTd2VkaXNoXG4gICAgICAgICAgY2FzZSAnNyc6XG4gICAgICAgICAgICBjcyA9IFRlcm1pbmFsLmNoYXJzZXRzLlN3ZWRpc2g7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICc9JzogLy8gU3dpc3NcbiAgICAgICAgICAgIGNzID0gVGVybWluYWwuY2hhcnNldHMuU3dpc3M7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICcvJzogLy8gSVNPTGF0aW4gKGFjdHVhbGx5IC9BKVxuICAgICAgICAgICAgY3MgPSBUZXJtaW5hbC5jaGFyc2V0cy5JU09MYXRpbjtcbiAgICAgICAgICAgIGkrKztcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGRlZmF1bHQ6IC8vIERlZmF1bHRcbiAgICAgICAgICAgIGNzID0gVGVybWluYWwuY2hhcnNldHMuVVM7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNldGdDaGFyc2V0KHRoaXMuZ2NoYXJzZXQsIGNzKTtcbiAgICAgICAgdGhpcy5nY2hhcnNldCA9IG51bGw7XG4gICAgICAgIHRoaXMuc3RhdGUgPSBub3JtYWw7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlIG9zYzpcbiAgICAgICAgLy8gT1NDIFBzIDsgUHQgU1RcbiAgICAgICAgLy8gT1NDIFBzIDsgUHQgQkVMXG4gICAgICAgIC8vICAgU2V0IFRleHQgUGFyYW1ldGVycy5cbiAgICAgICAgaWYgKGNoID09PSAnXFx4MWInIHx8IGNoID09PSAnXFx4MDcnKSB7XG4gICAgICAgICAgaWYgKGNoID09PSAnXFx4MWInKSBpKys7XG5cbiAgICAgICAgICB0aGlzLnBhcmFtcy5wdXNoKHRoaXMuY3VycmVudFBhcmFtKTtcblxuICAgICAgICAgIHN3aXRjaCAodGhpcy5wYXJhbXNbMF0pIHtcbiAgICAgICAgICAgIGNhc2UgMDpcbiAgICAgICAgICAgIGNhc2UgMTpcbiAgICAgICAgICAgIGNhc2UgMjpcbiAgICAgICAgICAgICAgaWYgKHRoaXMucGFyYW1zWzFdKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50aXRsZSA9IHRoaXMucGFyYW1zWzFdO1xuICAgICAgICAgICAgICAgIHRoaXMuaGFuZGxlVGl0bGUodGhpcy50aXRsZSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDM6XG4gICAgICAgICAgICAgIC8vIHNldCBYIHByb3BlcnR5XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSA0OlxuICAgICAgICAgICAgY2FzZSA1OlxuICAgICAgICAgICAgICAvLyBjaGFuZ2UgZHluYW1pYyBjb2xvcnNcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDEwOlxuICAgICAgICAgICAgY2FzZSAxMTpcbiAgICAgICAgICAgIGNhc2UgMTI6XG4gICAgICAgICAgICBjYXNlIDEzOlxuICAgICAgICAgICAgY2FzZSAxNDpcbiAgICAgICAgICAgIGNhc2UgMTU6XG4gICAgICAgICAgICBjYXNlIDE2OlxuICAgICAgICAgICAgY2FzZSAxNzpcbiAgICAgICAgICAgIGNhc2UgMTg6XG4gICAgICAgICAgICBjYXNlIDE5OlxuICAgICAgICAgICAgICAvLyBjaGFuZ2UgZHluYW1pYyB1aSBjb2xvcnNcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDQ2OlxuICAgICAgICAgICAgICAvLyBjaGFuZ2UgbG9nIGZpbGVcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDUwOlxuICAgICAgICAgICAgICAvLyBkeW5hbWljIGZvbnRcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDUxOlxuICAgICAgICAgICAgICAvLyBlbWFjcyBzaGVsbFxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgNTI6XG4gICAgICAgICAgICAgIC8vIG1hbmlwdWxhdGUgc2VsZWN0aW9uIGRhdGFcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDEwNDpcbiAgICAgICAgICAgIGNhc2UgMTA1OlxuICAgICAgICAgICAgY2FzZSAxMTA6XG4gICAgICAgICAgICBjYXNlIDExMTpcbiAgICAgICAgICAgIGNhc2UgMTEyOlxuICAgICAgICAgICAgY2FzZSAxMTM6XG4gICAgICAgICAgICBjYXNlIDExNDpcbiAgICAgICAgICAgIGNhc2UgMTE1OlxuICAgICAgICAgICAgY2FzZSAxMTY6XG4gICAgICAgICAgICBjYXNlIDExNzpcbiAgICAgICAgICAgIGNhc2UgMTE4OlxuICAgICAgICAgICAgICAvLyByZXNldCBjb2xvcnNcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdGhpcy5wYXJhbXMgPSBbXTtcbiAgICAgICAgICB0aGlzLmN1cnJlbnRQYXJhbSA9IDA7XG4gICAgICAgICAgdGhpcy5zdGF0ZSA9IG5vcm1hbDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoIXRoaXMucGFyYW1zLmxlbmd0aCkge1xuICAgICAgICAgICAgaWYgKGNoID49ICcwJyAmJiBjaCA8PSAnOScpIHtcbiAgICAgICAgICAgICAgdGhpcy5jdXJyZW50UGFyYW0gPVxuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudFBhcmFtICogMTAgKyBjaC5jaGFyQ29kZUF0KDApIC0gNDg7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNoID09PSAnOycpIHtcbiAgICAgICAgICAgICAgdGhpcy5wYXJhbXMucHVzaCh0aGlzLmN1cnJlbnRQYXJhbSk7XG4gICAgICAgICAgICAgIHRoaXMuY3VycmVudFBhcmFtID0gJyc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFBhcmFtICs9IGNoO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSBjc2k6XG4gICAgICAgIC8vICc/JywgJz4nLCAnISdcbiAgICAgICAgaWYgKGNoID09PSAnPycgfHwgY2ggPT09ICc+JyB8fCBjaCA9PT0gJyEnKSB7XG4gICAgICAgICAgdGhpcy5wcmVmaXggPSBjaDtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIDAgLSA5XG4gICAgICAgIGlmIChjaCA+PSAnMCcgJiYgY2ggPD0gJzknKSB7XG4gICAgICAgICAgdGhpcy5jdXJyZW50UGFyYW0gPSB0aGlzLmN1cnJlbnRQYXJhbSAqIDEwICsgY2guY2hhckNvZGVBdCgwKSAtIDQ4O1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gJyQnLCAnXCInLCAnICcsICdcXCcnXG4gICAgICAgIGlmIChjaCA9PT0gJyQnIHx8IGNoID09PSAnXCInIHx8IGNoID09PSAnICcgfHwgY2ggPT09ICdcXCcnKSB7XG4gICAgICAgICAgdGhpcy5wb3N0Zml4ID0gY2g7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnBhcmFtcy5wdXNoKHRoaXMuY3VycmVudFBhcmFtKTtcbiAgICAgICAgdGhpcy5jdXJyZW50UGFyYW0gPSAwO1xuXG4gICAgICAgIC8vICc7J1xuICAgICAgICBpZiAoY2ggPT09ICc7JykgYnJlYWs7XG5cbiAgICAgICAgdGhpcy5zdGF0ZSA9IG5vcm1hbDtcblxuICAgICAgICBzd2l0Y2ggKGNoKSB7XG4gICAgICAgICAgLy8gQ1NJIFBzIEFcbiAgICAgICAgICAvLyBDdXJzb3IgVXAgUHMgVGltZXMgKGRlZmF1bHQgPSAxKSAoQ1VVKS5cbiAgICAgICAgICBjYXNlICdBJzpcbiAgICAgICAgICAgIHRoaXMuY3Vyc29yVXAodGhpcy5wYXJhbXMpO1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAvLyBDU0kgUHMgQlxuICAgICAgICAgIC8vIEN1cnNvciBEb3duIFBzIFRpbWVzIChkZWZhdWx0ID0gMSkgKENVRCkuXG4gICAgICAgICAgY2FzZSAnQic6XG4gICAgICAgICAgICB0aGlzLmN1cnNvckRvd24odGhpcy5wYXJhbXMpO1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAvLyBDU0kgUHMgQ1xuICAgICAgICAgIC8vIEN1cnNvciBGb3J3YXJkIFBzIFRpbWVzIChkZWZhdWx0ID0gMSkgKENVRikuXG4gICAgICAgICAgY2FzZSAnQyc6XG4gICAgICAgICAgICB0aGlzLmN1cnNvckZvcndhcmQodGhpcy5wYXJhbXMpO1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAvLyBDU0kgUHMgRFxuICAgICAgICAgIC8vIEN1cnNvciBCYWNrd2FyZCBQcyBUaW1lcyAoZGVmYXVsdCA9IDEpIChDVUIpLlxuICAgICAgICAgIGNhc2UgJ0QnOlxuICAgICAgICAgICAgdGhpcy5jdXJzb3JCYWNrd2FyZCh0aGlzLnBhcmFtcyk7XG4gICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgIC8vIENTSSBQcyA7IFBzIEhcbiAgICAgICAgICAvLyBDdXJzb3IgUG9zaXRpb24gW3Jvdztjb2x1bW5dIChkZWZhdWx0ID0gWzEsMV0pIChDVVApLlxuICAgICAgICAgIGNhc2UgJ0gnOlxuICAgICAgICAgICAgdGhpcy5jdXJzb3JQb3ModGhpcy5wYXJhbXMpO1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAvLyBDU0kgUHMgSiAgRXJhc2UgaW4gRGlzcGxheSAoRUQpLlxuICAgICAgICAgIGNhc2UgJ0onOlxuICAgICAgICAgICAgdGhpcy5lcmFzZUluRGlzcGxheSh0aGlzLnBhcmFtcyk7XG4gICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgIC8vIENTSSBQcyBLICBFcmFzZSBpbiBMaW5lIChFTCkuXG4gICAgICAgICAgY2FzZSAnSyc6XG4gICAgICAgICAgICB0aGlzLmVyYXNlSW5MaW5lKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gQ1NJIFBtIG0gIENoYXJhY3RlciBBdHRyaWJ1dGVzIChTR1IpLlxuICAgICAgICAgIGNhc2UgJ20nOlxuICAgICAgICAgICAgaWYgKCF0aGlzLnByZWZpeCkge1xuICAgICAgICAgICAgICB0aGlzLmNoYXJBdHRyaWJ1dGVzKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gQ1NJIFBzIG4gIERldmljZSBTdGF0dXMgUmVwb3J0IChEU1IpLlxuICAgICAgICAgIGNhc2UgJ24nOlxuICAgICAgICAgICAgaWYgKCF0aGlzLnByZWZpeCkge1xuICAgICAgICAgICAgICB0aGlzLmRldmljZVN0YXR1cyh0aGlzLnBhcmFtcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgIC8qKlxuICAgICAgICAgICAqIEFkZGl0aW9uc1xuICAgICAgICAgICAqL1xuXG4gICAgICAgICAgLy8gQ1NJIFBzIEBcbiAgICAgICAgICAvLyBJbnNlcnQgUHMgKEJsYW5rKSBDaGFyYWN0ZXIocykgKGRlZmF1bHQgPSAxKSAoSUNIKS5cbiAgICAgICAgICBjYXNlICdAJzpcbiAgICAgICAgICAgIHRoaXMuaW5zZXJ0Q2hhcnModGhpcy5wYXJhbXMpO1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAvLyBDU0kgUHMgRVxuICAgICAgICAgIC8vIEN1cnNvciBOZXh0IExpbmUgUHMgVGltZXMgKGRlZmF1bHQgPSAxKSAoQ05MKS5cbiAgICAgICAgICBjYXNlICdFJzpcbiAgICAgICAgICAgIHRoaXMuY3Vyc29yTmV4dExpbmUodGhpcy5wYXJhbXMpO1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAvLyBDU0kgUHMgRlxuICAgICAgICAgIC8vIEN1cnNvciBQcmVjZWRpbmcgTGluZSBQcyBUaW1lcyAoZGVmYXVsdCA9IDEpIChDTkwpLlxuICAgICAgICAgIGNhc2UgJ0YnOlxuICAgICAgICAgICAgdGhpcy5jdXJzb3JQcmVjZWRpbmdMaW5lKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gQ1NJIFBzIEdcbiAgICAgICAgICAvLyBDdXJzb3IgQ2hhcmFjdGVyIEFic29sdXRlICBbY29sdW1uXSAoZGVmYXVsdCA9IFtyb3csMV0pIChDSEEpLlxuICAgICAgICAgIGNhc2UgJ0cnOlxuICAgICAgICAgICAgdGhpcy5jdXJzb3JDaGFyQWJzb2x1dGUodGhpcy5wYXJhbXMpO1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAvLyBDU0kgUHMgTFxuICAgICAgICAgIC8vIEluc2VydCBQcyBMaW5lKHMpIChkZWZhdWx0ID0gMSkgKElMKS5cbiAgICAgICAgICBjYXNlICdMJzpcbiAgICAgICAgICAgIHRoaXMuaW5zZXJ0TGluZXModGhpcy5wYXJhbXMpO1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAvLyBDU0kgUHMgTVxuICAgICAgICAgIC8vIERlbGV0ZSBQcyBMaW5lKHMpIChkZWZhdWx0ID0gMSkgKERMKS5cbiAgICAgICAgICBjYXNlICdNJzpcbiAgICAgICAgICAgIHRoaXMuZGVsZXRlTGluZXModGhpcy5wYXJhbXMpO1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAvLyBDU0kgUHMgUFxuICAgICAgICAgIC8vIERlbGV0ZSBQcyBDaGFyYWN0ZXIocykgKGRlZmF1bHQgPSAxKSAoRENIKS5cbiAgICAgICAgICBjYXNlICdQJzpcbiAgICAgICAgICAgIHRoaXMuZGVsZXRlQ2hhcnModGhpcy5wYXJhbXMpO1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAvLyBDU0kgUHMgWFxuICAgICAgICAgIC8vIEVyYXNlIFBzIENoYXJhY3RlcihzKSAoZGVmYXVsdCA9IDEpIChFQ0gpLlxuICAgICAgICAgIGNhc2UgJ1gnOlxuICAgICAgICAgICAgdGhpcy5lcmFzZUNoYXJzKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gQ1NJIFBtIGAgIENoYXJhY3RlciBQb3NpdGlvbiBBYnNvbHV0ZVxuICAgICAgICAgIC8vICAgW2NvbHVtbl0gKGRlZmF1bHQgPSBbcm93LDFdKSAoSFBBKS5cbiAgICAgICAgICBjYXNlICdgJzpcbiAgICAgICAgICAgIHRoaXMuY2hhclBvc0Fic29sdXRlKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gMTQxIDYxIGEgKiBIUFIgLVxuICAgICAgICAgIC8vIEhvcml6b250YWwgUG9zaXRpb24gUmVsYXRpdmVcbiAgICAgICAgICBjYXNlICdhJzpcbiAgICAgICAgICAgIHRoaXMuSFBvc2l0aW9uUmVsYXRpdmUodGhpcy5wYXJhbXMpO1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAvLyBDU0kgUCBzIGNcbiAgICAgICAgICAvLyBTZW5kIERldmljZSBBdHRyaWJ1dGVzIChQcmltYXJ5IERBKS5cbiAgICAgICAgICAvLyBDU0kgPiBQIHMgY1xuICAgICAgICAgIC8vIFNlbmQgRGV2aWNlIEF0dHJpYnV0ZXMgKFNlY29uZGFyeSBEQSlcbiAgICAgICAgICBjYXNlICdjJzpcbiAgICAgICAgICAgIHRoaXMuc2VuZERldmljZUF0dHJpYnV0ZXModGhpcy5wYXJhbXMpO1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAvLyBDU0kgUG0gZFxuICAgICAgICAgIC8vIExpbmUgUG9zaXRpb24gQWJzb2x1dGUgIFtyb3ddIChkZWZhdWx0ID0gWzEsY29sdW1uXSkgKFZQQSkuXG4gICAgICAgICAgY2FzZSAnZCc6XG4gICAgICAgICAgICB0aGlzLmxpbmVQb3NBYnNvbHV0ZSh0aGlzLnBhcmFtcyk7XG4gICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgIC8vIDE0NSA2NSBlICogVlBSIC0gVmVydGljYWwgUG9zaXRpb24gUmVsYXRpdmVcbiAgICAgICAgICBjYXNlICdlJzpcbiAgICAgICAgICAgIHRoaXMuVlBvc2l0aW9uUmVsYXRpdmUodGhpcy5wYXJhbXMpO1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAvLyBDU0kgUHMgOyBQcyBmXG4gICAgICAgICAgLy8gICBIb3Jpem9udGFsIGFuZCBWZXJ0aWNhbCBQb3NpdGlvbiBbcm93O2NvbHVtbl0gKGRlZmF1bHQgPVxuICAgICAgICAgIC8vICAgWzEsMV0pIChIVlApLlxuICAgICAgICAgIGNhc2UgJ2YnOlxuICAgICAgICAgICAgdGhpcy5IVlBvc2l0aW9uKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gQ1NJIFBtIGggIFNldCBNb2RlIChTTSkuXG4gICAgICAgICAgLy8gQ1NJID8gUG0gaCAtIG1vdXNlIGVzY2FwZSBjb2RlcywgY3Vyc29yIGVzY2FwZSBjb2Rlc1xuICAgICAgICAgIGNhc2UgJ2gnOlxuICAgICAgICAgICAgdGhpcy5zZXRNb2RlKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gQ1NJIFBtIGwgIFJlc2V0IE1vZGUgKFJNKS5cbiAgICAgICAgICAvLyBDU0kgPyBQbSBsXG4gICAgICAgICAgY2FzZSAnbCc6XG4gICAgICAgICAgICB0aGlzLnJlc2V0TW9kZSh0aGlzLnBhcmFtcyk7XG4gICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgIC8vIENTSSBQcyA7IFBzIHJcbiAgICAgICAgICAvLyAgIFNldCBTY3JvbGxpbmcgUmVnaW9uIFt0b3A7Ym90dG9tXSAoZGVmYXVsdCA9IGZ1bGwgc2l6ZSBvZiB3aW4tXG4gICAgICAgICAgLy8gICBkb3cpIChERUNTVEJNKS5cbiAgICAgICAgICAvLyBDU0kgPyBQbSByXG4gICAgICAgICAgY2FzZSAncic6XG4gICAgICAgICAgICB0aGlzLnNldFNjcm9sbFJlZ2lvbih0aGlzLnBhcmFtcyk7XG4gICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgIC8vIENTSSBzXG4gICAgICAgICAgLy8gICBTYXZlIGN1cnNvciAoQU5TSS5TWVMpLlxuICAgICAgICAgIGNhc2UgJ3MnOlxuICAgICAgICAgICAgdGhpcy5zYXZlQ3Vyc29yKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gQ1NJIHVcbiAgICAgICAgICAvLyAgIFJlc3RvcmUgY3Vyc29yIChBTlNJLlNZUykuXG4gICAgICAgICAgY2FzZSAndSc6XG4gICAgICAgICAgICB0aGlzLnJlc3RvcmVDdXJzb3IodGhpcy5wYXJhbXMpO1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAvKipcbiAgICAgICAgICAgKiBMZXNzZXIgVXNlZFxuICAgICAgICAgICAqL1xuXG4gICAgICAgICAgLy8gQ1NJIFBzIElcbiAgICAgICAgICAvLyBDdXJzb3IgRm9yd2FyZCBUYWJ1bGF0aW9uIFBzIHRhYiBzdG9wcyAoZGVmYXVsdCA9IDEpIChDSFQpLlxuICAgICAgICAgIGNhc2UgJ0knOlxuICAgICAgICAgICAgdGhpcy5jdXJzb3JGb3J3YXJkVGFiKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gQ1NJIFBzIFMgIFNjcm9sbCB1cCBQcyBsaW5lcyAoZGVmYXVsdCA9IDEpIChTVSkuXG4gICAgICAgICAgY2FzZSAnUyc6XG4gICAgICAgICAgICB0aGlzLnNjcm9sbFVwKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gQ1NJIFBzIFQgIFNjcm9sbCBkb3duIFBzIGxpbmVzIChkZWZhdWx0ID0gMSkgKFNEKS5cbiAgICAgICAgICAvLyBDU0kgUHMgOyBQcyA7IFBzIDsgUHMgOyBQcyBUXG4gICAgICAgICAgLy8gQ1NJID4gUHM7IFBzIFRcbiAgICAgICAgICBjYXNlICdUJzpcbiAgICAgICAgICAgIC8vIGlmICh0aGlzLnByZWZpeCA9PT0gJz4nKSB7XG4gICAgICAgICAgICAvLyAgIHRoaXMucmVzZXRUaXRsZU1vZGVzKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAgIC8vICAgYnJlYWs7XG4gICAgICAgICAgICAvLyB9XG4gICAgICAgICAgICAvLyBpZiAodGhpcy5wYXJhbXMubGVuZ3RoID4gMikge1xuICAgICAgICAgICAgLy8gICB0aGlzLmluaXRNb3VzZVRyYWNraW5nKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAgIC8vICAgYnJlYWs7XG4gICAgICAgICAgICAvLyB9XG4gICAgICAgICAgICBpZiAodGhpcy5wYXJhbXMubGVuZ3RoIDwgMiAmJiAhdGhpcy5wcmVmaXgpIHtcbiAgICAgICAgICAgICAgdGhpcy5zY3JvbGxEb3duKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gQ1NJIFBzIFpcbiAgICAgICAgICAvLyBDdXJzb3IgQmFja3dhcmQgVGFidWxhdGlvbiBQcyB0YWIgc3RvcHMgKGRlZmF1bHQgPSAxKSAoQ0JUKS5cbiAgICAgICAgICBjYXNlICdaJzpcbiAgICAgICAgICAgIHRoaXMuY3Vyc29yQmFja3dhcmRUYWIodGhpcy5wYXJhbXMpO1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAvLyBDU0kgUHMgYiAgUmVwZWF0IHRoZSBwcmVjZWRpbmcgZ3JhcGhpYyBjaGFyYWN0ZXIgUHMgdGltZXMgKFJFUCkuXG4gICAgICAgICAgY2FzZSAnYic6XG4gICAgICAgICAgICB0aGlzLnJlcGVhdFByZWNlZGluZ0NoYXJhY3Rlcih0aGlzLnBhcmFtcyk7XG4gICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgIC8vIENTSSBQcyBnICBUYWIgQ2xlYXIgKFRCQykuXG4gICAgICAgICAgY2FzZSAnZyc6XG4gICAgICAgICAgICB0aGlzLnRhYkNsZWFyKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gQ1NJIFBtIGkgIE1lZGlhIENvcHkgKE1DKS5cbiAgICAgICAgICAvLyBDU0kgPyBQbSBpXG4gICAgICAgICAgLy8gY2FzZSAnaSc6XG4gICAgICAgICAgLy8gICB0aGlzLm1lZGlhQ29weSh0aGlzLnBhcmFtcyk7XG4gICAgICAgICAgLy8gICBicmVhaztcblxuICAgICAgICAgIC8vIENTSSBQbSBtICBDaGFyYWN0ZXIgQXR0cmlidXRlcyAoU0dSKS5cbiAgICAgICAgICAvLyBDU0kgPiBQczsgUHMgbVxuICAgICAgICAgIC8vIGNhc2UgJ20nOiAvLyBkdXBsaWNhdGVcbiAgICAgICAgICAvLyAgIGlmICh0aGlzLnByZWZpeCA9PT0gJz4nKSB7XG4gICAgICAgICAgLy8gICAgIHRoaXMuc2V0UmVzb3VyY2VzKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAvLyAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gICAgIHRoaXMuY2hhckF0dHJpYnV0ZXModGhpcy5wYXJhbXMpO1xuICAgICAgICAgIC8vICAgfVxuICAgICAgICAgIC8vICAgYnJlYWs7XG5cbiAgICAgICAgICAvLyBDU0kgUHMgbiAgRGV2aWNlIFN0YXR1cyBSZXBvcnQgKERTUikuXG4gICAgICAgICAgLy8gQ1NJID4gUHMgblxuICAgICAgICAgIC8vIGNhc2UgJ24nOiAvLyBkdXBsaWNhdGVcbiAgICAgICAgICAvLyAgIGlmICh0aGlzLnByZWZpeCA9PT0gJz4nKSB7XG4gICAgICAgICAgLy8gICAgIHRoaXMuZGlzYWJsZU1vZGlmaWVycyh0aGlzLnBhcmFtcyk7XG4gICAgICAgICAgLy8gICB9IGVsc2Uge1xuICAgICAgICAgIC8vICAgICB0aGlzLmRldmljZVN0YXR1cyh0aGlzLnBhcmFtcyk7XG4gICAgICAgICAgLy8gICB9XG4gICAgICAgICAgLy8gICBicmVhaztcblxuICAgICAgICAgIC8vIENTSSA+IFBzIHAgIFNldCBwb2ludGVyIG1vZGUuXG4gICAgICAgICAgLy8gQ1NJICEgcCAgIFNvZnQgdGVybWluYWwgcmVzZXQgKERFQ1NUUikuXG4gICAgICAgICAgLy8gQ1NJIFBzJCBwXG4gICAgICAgICAgLy8gICBSZXF1ZXN0IEFOU0kgbW9kZSAoREVDUlFNKS5cbiAgICAgICAgICAvLyBDU0kgPyBQcyQgcFxuICAgICAgICAgIC8vICAgUmVxdWVzdCBERUMgcHJpdmF0ZSBtb2RlIChERUNSUU0pLlxuICAgICAgICAgIC8vIENTSSBQcyA7IFBzIFwiIHBcbiAgICAgICAgICBjYXNlICdwJzpcbiAgICAgICAgICAgIHN3aXRjaCAodGhpcy5wcmVmaXgpIHtcbiAgICAgICAgICAgICAgLy8gY2FzZSAnPic6XG4gICAgICAgICAgICAgIC8vICAgdGhpcy5zZXRQb2ludGVyTW9kZSh0aGlzLnBhcmFtcyk7XG4gICAgICAgICAgICAgIC8vICAgYnJlYWs7XG4gICAgICAgICAgICAgIGNhc2UgJyEnOlxuICAgICAgICAgICAgICAgIHRoaXMuc29mdFJlc2V0KHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgLy8gY2FzZSAnPyc6XG4gICAgICAgICAgICAgIC8vICAgaWYgKHRoaXMucG9zdGZpeCA9PT0gJyQnKSB7XG4gICAgICAgICAgICAgIC8vICAgICB0aGlzLnJlcXVlc3RQcml2YXRlTW9kZSh0aGlzLnBhcmFtcyk7XG4gICAgICAgICAgICAgIC8vICAgfVxuICAgICAgICAgICAgICAvLyAgIGJyZWFrO1xuICAgICAgICAgICAgICAvLyBkZWZhdWx0OlxuICAgICAgICAgICAgICAvLyAgIGlmICh0aGlzLnBvc3RmaXggPT09ICdcIicpIHtcbiAgICAgICAgICAgICAgLy8gICAgIHRoaXMuc2V0Q29uZm9ybWFuY2VMZXZlbCh0aGlzLnBhcmFtcyk7XG4gICAgICAgICAgICAgIC8vICAgfSBlbHNlIGlmICh0aGlzLnBvc3RmaXggPT09ICckJykge1xuICAgICAgICAgICAgICAvLyAgICAgdGhpcy5yZXF1ZXN0QW5zaU1vZGUodGhpcy5wYXJhbXMpO1xuICAgICAgICAgICAgICAvLyAgIH1cbiAgICAgICAgICAgICAgLy8gICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gQ1NJIFBzIHEgIExvYWQgTEVEcyAoREVDTEwpLlxuICAgICAgICAgIC8vIENTSSBQcyBTUCBxXG4gICAgICAgICAgLy8gQ1NJIFBzIFwiIHFcbiAgICAgICAgICAvLyBjYXNlICdxJzpcbiAgICAgICAgICAvLyAgIGlmICh0aGlzLnBvc3RmaXggPT09ICcgJykge1xuICAgICAgICAgIC8vICAgICB0aGlzLnNldEN1cnNvclN0eWxlKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAvLyAgICAgYnJlYWs7XG4gICAgICAgICAgLy8gICB9XG4gICAgICAgICAgLy8gICBpZiAodGhpcy5wb3N0Zml4ID09PSAnXCInKSB7XG4gICAgICAgICAgLy8gICAgIHRoaXMuc2V0Q2hhclByb3RlY3Rpb25BdHRyKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAvLyAgICAgYnJlYWs7XG4gICAgICAgICAgLy8gICB9XG4gICAgICAgICAgLy8gICB0aGlzLmxvYWRMRURzKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAvLyAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gQ1NJIFBzIDsgUHMgclxuICAgICAgICAgIC8vICAgU2V0IFNjcm9sbGluZyBSZWdpb24gW3RvcDtib3R0b21dIChkZWZhdWx0ID0gZnVsbCBzaXplIG9mIHdpbi1cbiAgICAgICAgICAvLyAgIGRvdykgKERFQ1NUQk0pLlxuICAgICAgICAgIC8vIENTSSA/IFBtIHJcbiAgICAgICAgICAvLyBDU0kgUHQ7IFBsOyBQYjsgUHI7IFBzJCByXG4gICAgICAgICAgLy8gY2FzZSAncic6IC8vIGR1cGxpY2F0ZVxuICAgICAgICAgIC8vICAgaWYgKHRoaXMucHJlZml4ID09PSAnPycpIHtcbiAgICAgICAgICAvLyAgICAgdGhpcy5yZXN0b3JlUHJpdmF0ZVZhbHVlcyh0aGlzLnBhcmFtcyk7XG4gICAgICAgICAgLy8gICB9IGVsc2UgaWYgKHRoaXMucG9zdGZpeCA9PT0gJyQnKSB7XG4gICAgICAgICAgLy8gICAgIHRoaXMuc2V0QXR0ckluUmVjdGFuZ2xlKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAvLyAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gICAgIHRoaXMuc2V0U2Nyb2xsUmVnaW9uKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAvLyAgIH1cbiAgICAgICAgICAvLyAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gQ1NJIHMgICAgIFNhdmUgY3Vyc29yIChBTlNJLlNZUykuXG4gICAgICAgICAgLy8gQ1NJID8gUG0gc1xuICAgICAgICAgIC8vIGNhc2UgJ3MnOiAvLyBkdXBsaWNhdGVcbiAgICAgICAgICAvLyAgIGlmICh0aGlzLnByZWZpeCA9PT0gJz8nKSB7XG4gICAgICAgICAgLy8gICAgIHRoaXMuc2F2ZVByaXZhdGVWYWx1ZXModGhpcy5wYXJhbXMpO1xuICAgICAgICAgIC8vICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyAgICAgdGhpcy5zYXZlQ3Vyc29yKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAvLyAgIH1cbiAgICAgICAgICAvLyAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gQ1NJIFBzIDsgUHMgOyBQcyB0XG4gICAgICAgICAgLy8gQ1NJIFB0OyBQbDsgUGI7IFByOyBQcyQgdFxuICAgICAgICAgIC8vIENTSSA+IFBzOyBQcyB0XG4gICAgICAgICAgLy8gQ1NJIFBzIFNQIHRcbiAgICAgICAgICAvLyBjYXNlICd0JzpcbiAgICAgICAgICAvLyAgIGlmICh0aGlzLnBvc3RmaXggPT09ICckJykge1xuICAgICAgICAgIC8vICAgICB0aGlzLnJldmVyc2VBdHRySW5SZWN0YW5nbGUodGhpcy5wYXJhbXMpO1xuICAgICAgICAgIC8vICAgfSBlbHNlIGlmICh0aGlzLnBvc3RmaXggPT09ICcgJykge1xuICAgICAgICAgIC8vICAgICB0aGlzLnNldFdhcm5pbmdCZWxsVm9sdW1lKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAvLyAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gICAgIGlmICh0aGlzLnByZWZpeCA9PT0gJz4nKSB7XG4gICAgICAgICAgLy8gICAgICAgdGhpcy5zZXRUaXRsZU1vZGVGZWF0dXJlKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAvLyAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyAgICAgICB0aGlzLm1hbmlwdWxhdGVXaW5kb3codGhpcy5wYXJhbXMpO1xuICAgICAgICAgIC8vICAgICB9XG4gICAgICAgICAgLy8gICB9XG4gICAgICAgICAgLy8gICBicmVhaztcblxuICAgICAgICAgIC8vIENTSSB1ICAgICBSZXN0b3JlIGN1cnNvciAoQU5TSS5TWVMpLlxuICAgICAgICAgIC8vIENTSSBQcyBTUCB1XG4gICAgICAgICAgLy8gY2FzZSAndSc6IC8vIGR1cGxpY2F0ZVxuICAgICAgICAgIC8vICAgaWYgKHRoaXMucG9zdGZpeCA9PT0gJyAnKSB7XG4gICAgICAgICAgLy8gICAgIHRoaXMuc2V0TWFyZ2luQmVsbFZvbHVtZSh0aGlzLnBhcmFtcyk7XG4gICAgICAgICAgLy8gICB9IGVsc2Uge1xuICAgICAgICAgIC8vICAgICB0aGlzLnJlc3RvcmVDdXJzb3IodGhpcy5wYXJhbXMpO1xuICAgICAgICAgIC8vICAgfVxuICAgICAgICAgIC8vICAgYnJlYWs7XG5cbiAgICAgICAgICAvLyBDU0kgUHQ7IFBsOyBQYjsgUHI7IFBwOyBQdDsgUGw7IFBwJCB2XG4gICAgICAgICAgLy8gY2FzZSAndic6XG4gICAgICAgICAgLy8gICBpZiAodGhpcy5wb3N0Zml4ID09PSAnJCcpIHtcbiAgICAgICAgICAvLyAgICAgdGhpcy5jb3B5UmVjdGFnbGUodGhpcy5wYXJhbXMpO1xuICAgICAgICAgIC8vICAgfVxuICAgICAgICAgIC8vICAgYnJlYWs7XG5cbiAgICAgICAgICAvLyBDU0kgUHQgOyBQbCA7IFBiIDsgUHIgJyB3XG4gICAgICAgICAgLy8gY2FzZSAndyc6XG4gICAgICAgICAgLy8gICBpZiAodGhpcy5wb3N0Zml4ID09PSAnXFwnJykge1xuICAgICAgICAgIC8vICAgICB0aGlzLmVuYWJsZUZpbHRlclJlY3RhbmdsZSh0aGlzLnBhcmFtcyk7XG4gICAgICAgICAgLy8gICB9XG4gICAgICAgICAgLy8gICBicmVhaztcblxuICAgICAgICAgIC8vIENTSSBQcyB4ICBSZXF1ZXN0IFRlcm1pbmFsIFBhcmFtZXRlcnMgKERFQ1JFUVRQQVJNKS5cbiAgICAgICAgICAvLyBDU0kgUHMgeCAgU2VsZWN0IEF0dHJpYnV0ZSBDaGFuZ2UgRXh0ZW50IChERUNTQUNFKS5cbiAgICAgICAgICAvLyBDU0kgUGM7IFB0OyBQbDsgUGI7IFByJCB4XG4gICAgICAgICAgLy8gY2FzZSAneCc6XG4gICAgICAgICAgLy8gICBpZiAodGhpcy5wb3N0Zml4ID09PSAnJCcpIHtcbiAgICAgICAgICAvLyAgICAgdGhpcy5maWxsUmVjdGFuZ2xlKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAvLyAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gICAgIHRoaXMucmVxdWVzdFBhcmFtZXRlcnModGhpcy5wYXJhbXMpO1xuICAgICAgICAgIC8vICAgICAvL3RoaXMuX18odGhpcy5wYXJhbXMpO1xuICAgICAgICAgIC8vICAgfVxuICAgICAgICAgIC8vICAgYnJlYWs7XG5cbiAgICAgICAgICAvLyBDU0kgUHMgOyBQdSAnIHpcbiAgICAgICAgICAvLyBDU0kgUHQ7IFBsOyBQYjsgUHIkIHpcbiAgICAgICAgICAvLyBjYXNlICd6JzpcbiAgICAgICAgICAvLyAgIGlmICh0aGlzLnBvc3RmaXggPT09ICdcXCcnKSB7XG4gICAgICAgICAgLy8gICAgIHRoaXMuZW5hYmxlTG9jYXRvclJlcG9ydGluZyh0aGlzLnBhcmFtcyk7XG4gICAgICAgICAgLy8gICB9IGVsc2UgaWYgKHRoaXMucG9zdGZpeCA9PT0gJyQnKSB7XG4gICAgICAgICAgLy8gICAgIHRoaXMuZXJhc2VSZWN0YW5nbGUodGhpcy5wYXJhbXMpO1xuICAgICAgICAgIC8vICAgfVxuICAgICAgICAgIC8vICAgYnJlYWs7XG5cbiAgICAgICAgICAvLyBDU0kgUG0gJyB7XG4gICAgICAgICAgLy8gQ1NJIFB0OyBQbDsgUGI7IFByJCB7XG4gICAgICAgICAgLy8gY2FzZSAneyc6XG4gICAgICAgICAgLy8gICBpZiAodGhpcy5wb3N0Zml4ID09PSAnXFwnJykge1xuICAgICAgICAgIC8vICAgICB0aGlzLnNldExvY2F0b3JFdmVudHModGhpcy5wYXJhbXMpO1xuICAgICAgICAgIC8vICAgfSBlbHNlIGlmICh0aGlzLnBvc3RmaXggPT09ICckJykge1xuICAgICAgICAgIC8vICAgICB0aGlzLnNlbGVjdGl2ZUVyYXNlUmVjdGFuZ2xlKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAvLyAgIH1cbiAgICAgICAgICAvLyAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gQ1NJIFBzICcgfFxuICAgICAgICAgIC8vIGNhc2UgJ3wnOlxuICAgICAgICAgIC8vICAgaWYgKHRoaXMucG9zdGZpeCA9PT0gJ1xcJycpIHtcbiAgICAgICAgICAvLyAgICAgdGhpcy5yZXF1ZXN0TG9jYXRvclBvc2l0aW9uKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAvLyAgIH1cbiAgICAgICAgICAvLyAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gQ1NJIFAgbSBTUCB9XG4gICAgICAgICAgLy8gSW5zZXJ0IFAgcyBDb2x1bW4ocykgKGRlZmF1bHQgPSAxKSAoREVDSUMpLCBWVDQyMCBhbmQgdXAuXG4gICAgICAgICAgLy8gY2FzZSAnfSc6XG4gICAgICAgICAgLy8gICBpZiAodGhpcy5wb3N0Zml4ID09PSAnICcpIHtcbiAgICAgICAgICAvLyAgICAgdGhpcy5pbnNlcnRDb2x1bW5zKHRoaXMucGFyYW1zKTtcbiAgICAgICAgICAvLyAgIH1cbiAgICAgICAgICAvLyAgIGJyZWFrO1xuXG4gICAgICAgICAgLy8gQ1NJIFAgbSBTUCB+XG4gICAgICAgICAgLy8gRGVsZXRlIFAgcyBDb2x1bW4ocykgKGRlZmF1bHQgPSAxKSAoREVDREMpLCBWVDQyMCBhbmQgdXBcbiAgICAgICAgICAvLyBjYXNlICd+JzpcbiAgICAgICAgICAvLyAgIGlmICh0aGlzLnBvc3RmaXggPT09ICcgJykge1xuICAgICAgICAgIC8vICAgICB0aGlzLmRlbGV0ZUNvbHVtbnModGhpcy5wYXJhbXMpO1xuICAgICAgICAgIC8vICAgfVxuICAgICAgICAgIC8vICAgYnJlYWs7XG5cbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgdGhpcy5lcnJvcignVW5rbm93biBDU0kgY29kZTogJXMuJywgY2gpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnByZWZpeCA9ICcnO1xuICAgICAgICB0aGlzLnBvc3RmaXggPSAnJztcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgZGNzOlxuICAgICAgICBpZiAoY2ggPT09ICdcXHgxYicgfHwgY2ggPT09ICdcXHgwNycpIHtcbiAgICAgICAgICBpZiAoY2ggPT09ICdcXHgxYicpIGkrKztcblxuICAgICAgICAgIHN3aXRjaCAodGhpcy5wcmVmaXgpIHtcbiAgICAgICAgICAgIC8vIFVzZXItRGVmaW5lZCBLZXlzIChERUNVREspLlxuICAgICAgICAgICAgY2FzZSAnJzpcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIC8vIFJlcXVlc3QgU3RhdHVzIFN0cmluZyAoREVDUlFTUykuXG4gICAgICAgICAgICAvLyB0ZXN0OiBlY2hvIC1lICdcXGVQJHFcInBcXGVcXFxcJ1xuICAgICAgICAgICAgY2FzZSAnJHEnOlxuICAgICAgICAgICAgICB2YXIgcHQgPSB0aGlzLmN1cnJlbnRQYXJhbVxuICAgICAgICAgICAgICAgICwgdmFsaWQgPSBmYWxzZTtcblxuICAgICAgICAgICAgICBzd2l0Y2ggKHB0KSB7XG4gICAgICAgICAgICAgICAgLy8gREVDU0NBXG4gICAgICAgICAgICAgICAgY2FzZSAnXCJxJzpcbiAgICAgICAgICAgICAgICAgIHB0ID0gJzBcInEnO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICAvLyBERUNTQ0xcbiAgICAgICAgICAgICAgICBjYXNlICdcInAnOlxuICAgICAgICAgICAgICAgICAgcHQgPSAnNjFcInAnO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICAvLyBERUNTVEJNXG4gICAgICAgICAgICAgICAgY2FzZSAncic6XG4gICAgICAgICAgICAgICAgICBwdCA9ICcnXG4gICAgICAgICAgICAgICAgICAgICsgKHRoaXMuc2Nyb2xsVG9wICsgMSlcbiAgICAgICAgICAgICAgICAgICAgKyAnOydcbiAgICAgICAgICAgICAgICAgICAgKyAodGhpcy5zY3JvbGxCb3R0b20gKyAxKVxuICAgICAgICAgICAgICAgICAgICArICdyJztcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgLy8gU0dSXG4gICAgICAgICAgICAgICAgY2FzZSAnbSc6XG4gICAgICAgICAgICAgICAgICBwdCA9ICcwbSc7XG4gICAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICB0aGlzLmVycm9yKCdVbmtub3duIERDUyBQdDogJXMuJywgcHQpO1xuICAgICAgICAgICAgICAgICAgcHQgPSAnJztcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgdGhpcy5zZW5kKCdcXHgxYlAnICsgK3ZhbGlkICsgJyRyJyArIHB0ICsgJ1xceDFiXFxcXCcpO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgLy8gU2V0IFRlcm1jYXAvVGVybWluZm8gRGF0YSAoeHRlcm0sIGV4cGVyaW1lbnRhbCkuXG4gICAgICAgICAgICBjYXNlICcrcCc6XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAvLyBSZXF1ZXN0IFRlcm1jYXAvVGVybWluZm8gU3RyaW5nICh4dGVybSwgZXhwZXJpbWVudGFsKVxuICAgICAgICAgICAgLy8gUmVndWxhciB4dGVybSBkb2VzIG5vdCBldmVuIHJlc3BvbmQgdG8gdGhpcyBzZXF1ZW5jZS5cbiAgICAgICAgICAgIC8vIFRoaXMgY2FuIGNhdXNlIGEgc21hbGwgZ2xpdGNoIGluIHZpbS5cbiAgICAgICAgICAgIC8vIHRlc3Q6IGVjaG8gLW5lICdcXGVQK3E2YjY0XFxlXFxcXCdcbiAgICAgICAgICAgIGNhc2UgJytxJzpcbiAgICAgICAgICAgICAgdmFyIHB0ID0gdGhpcy5jdXJyZW50UGFyYW1cbiAgICAgICAgICAgICAgICAsIHZhbGlkID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgdGhpcy5zZW5kKCdcXHgxYlAnICsgK3ZhbGlkICsgJytyJyArIHB0ICsgJ1xceDFiXFxcXCcpO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgdGhpcy5lcnJvcignVW5rbm93biBEQ1MgcHJlZml4OiAlcy4nLCB0aGlzLnByZWZpeCk7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRoaXMuY3VycmVudFBhcmFtID0gMDtcbiAgICAgICAgICB0aGlzLnByZWZpeCA9ICcnO1xuICAgICAgICAgIHRoaXMuc3RhdGUgPSBub3JtYWw7XG4gICAgICAgIH0gZWxzZSBpZiAoIXRoaXMuY3VycmVudFBhcmFtKSB7XG4gICAgICAgICAgaWYgKCF0aGlzLnByZWZpeCAmJiBjaCAhPT0gJyQnICYmIGNoICE9PSAnKycpIHtcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFBhcmFtID0gY2g7XG4gICAgICAgICAgfSBlbHNlIGlmICh0aGlzLnByZWZpeC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFBhcmFtID0gY2g7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMucHJlZml4ICs9IGNoO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLmN1cnJlbnRQYXJhbSArPSBjaDtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSBpZ25vcmU6XG4gICAgICAgIC8vIEZvciBQTSBhbmQgQVBDLlxuICAgICAgICBpZiAoY2ggPT09ICdcXHgxYicgfHwgY2ggPT09ICdcXHgwNycpIHtcbiAgICAgICAgICBpZiAoY2ggPT09ICdcXHgxYicpIGkrKztcbiAgICAgICAgICB0aGlzLnN0YXRlID0gbm9ybWFsO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIHRoaXMudXBkYXRlUmFuZ2UodGhpcy55KTtcbiAgdGhpcy5yZWZyZXNoKHRoaXMucmVmcmVzaFN0YXJ0LCB0aGlzLnJlZnJlc2hFbmQpO1xufTtcblxuVGVybWluYWwucHJvdG90eXBlLndyaXRlbG4gPSBmdW5jdGlvbihkYXRhKSB7XG4gIHRoaXMud3JpdGUoZGF0YSArICdcXHJcXG4nKTtcbn07XG5cbi8vIEtleSBSZXNvdXJjZXM6XG4vLyBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL0RPTS9LZXlib2FyZEV2ZW50XG5UZXJtaW5hbC5wcm90b3R5cGUua2V5RG93biA9IGZ1bmN0aW9uKGV2KSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICAgICwga2V5O1xuXG4gIHN3aXRjaCAoZXYua2V5Q29kZSkge1xuICAgIC8vIGJhY2tzcGFjZVxuICAgIGNhc2UgODpcbiAgICAgIGlmIChldi5zaGlmdEtleSkge1xuICAgICAgICBrZXkgPSAnXFx4MDgnOyAvLyBeSFxuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGtleSA9ICdcXHg3Zic7IC8vIF4/XG4gICAgICBicmVhaztcbiAgICAvLyB0YWJcbiAgICBjYXNlIDk6XG4gICAgICBpZiAoZXYuc2hpZnRLZXkpIHtcbiAgICAgICAga2V5ID0gJ1xceDFiW1onO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGtleSA9ICdcXHQnO1xuICAgICAgYnJlYWs7XG4gICAgLy8gcmV0dXJuL2VudGVyXG4gICAgY2FzZSAxMzpcbiAgICAgIGtleSA9ICdcXHInO1xuICAgICAgYnJlYWs7XG4gICAgLy8gZXNjYXBlXG4gICAgY2FzZSAyNzpcbiAgICAgIGtleSA9ICdcXHgxYic7XG4gICAgICBicmVhaztcbiAgICAvLyBsZWZ0LWFycm93XG4gICAgY2FzZSAzNzpcbiAgICAgIGlmICh0aGlzLmFwcGxpY2F0aW9uQ3Vyc29yKSB7XG4gICAgICAgIGtleSA9ICdcXHgxYk9EJzsgLy8gU1MzIGFzIF5bTyBmb3IgNy1iaXRcbiAgICAgICAgLy9rZXkgPSAnXFx4OGZEJzsgLy8gU1MzIGFzIDB4OGYgZm9yIDgtYml0XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAga2V5ID0gJ1xceDFiW0QnO1xuICAgICAgYnJlYWs7XG4gICAgLy8gcmlnaHQtYXJyb3dcbiAgICBjYXNlIDM5OlxuICAgICAgaWYgKHRoaXMuYXBwbGljYXRpb25DdXJzb3IpIHtcbiAgICAgICAga2V5ID0gJ1xceDFiT0MnO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGtleSA9ICdcXHgxYltDJztcbiAgICAgIGJyZWFrO1xuICAgIC8vIHVwLWFycm93XG4gICAgY2FzZSAzODpcbiAgICAgIGlmICh0aGlzLmFwcGxpY2F0aW9uQ3Vyc29yKSB7XG4gICAgICAgIGtleSA9ICdcXHgxYk9BJztcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBpZiAoZXYuY3RybEtleSkge1xuICAgICAgICB0aGlzLnNjcm9sbERpc3AoLTEpO1xuICAgICAgICByZXR1cm4gY2FuY2VsKGV2KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGtleSA9ICdcXHgxYltBJztcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIC8vIGRvd24tYXJyb3dcbiAgICBjYXNlIDQwOlxuICAgICAgaWYgKHRoaXMuYXBwbGljYXRpb25DdXJzb3IpIHtcbiAgICAgICAga2V5ID0gJ1xceDFiT0InO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGlmIChldi5jdHJsS2V5KSB7XG4gICAgICAgIHRoaXMuc2Nyb2xsRGlzcCgxKTtcbiAgICAgICAgcmV0dXJuIGNhbmNlbChldik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBrZXkgPSAnXFx4MWJbQic7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICAvLyBkZWxldGVcbiAgICBjYXNlIDQ2OlxuICAgICAga2V5ID0gJ1xceDFiWzN+JztcbiAgICAgIGJyZWFrO1xuICAgIC8vIGluc2VydFxuICAgIGNhc2UgNDU6XG4gICAgICBrZXkgPSAnXFx4MWJbMn4nO1xuICAgICAgYnJlYWs7XG4gICAgLy8gaG9tZVxuICAgIGNhc2UgMzY6XG4gICAgICBpZiAodGhpcy5hcHBsaWNhdGlvbktleXBhZCkge1xuICAgICAgICBrZXkgPSAnXFx4MWJPSCc7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAga2V5ID0gJ1xceDFiT0gnO1xuICAgICAgYnJlYWs7XG4gICAgLy8gZW5kXG4gICAgY2FzZSAzNTpcbiAgICAgIGlmICh0aGlzLmFwcGxpY2F0aW9uS2V5cGFkKSB7XG4gICAgICAgIGtleSA9ICdcXHgxYk9GJztcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBrZXkgPSAnXFx4MWJPRic7XG4gICAgICBicmVhaztcbiAgICAvLyBwYWdlIHVwXG4gICAgY2FzZSAzMzpcbiAgICAgIGlmIChldi5zaGlmdEtleSkge1xuICAgICAgICB0aGlzLnNjcm9sbERpc3AoLSh0aGlzLnJvd3MgLSAxKSk7XG4gICAgICAgIHJldHVybiBjYW5jZWwoZXYpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAga2V5ID0gJ1xceDFiWzV+JztcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIC8vIHBhZ2UgZG93blxuICAgIGNhc2UgMzQ6XG4gICAgICBpZiAoZXYuc2hpZnRLZXkpIHtcbiAgICAgICAgdGhpcy5zY3JvbGxEaXNwKHRoaXMucm93cyAtIDEpO1xuICAgICAgICByZXR1cm4gY2FuY2VsKGV2KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGtleSA9ICdcXHgxYls2fic7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICAvLyBGMVxuICAgIGNhc2UgMTEyOlxuICAgICAga2V5ID0gJ1xceDFiT1AnO1xuICAgICAgYnJlYWs7XG4gICAgLy8gRjJcbiAgICBjYXNlIDExMzpcbiAgICAgIGtleSA9ICdcXHgxYk9RJztcbiAgICAgIGJyZWFrO1xuICAgIC8vIEYzXG4gICAgY2FzZSAxMTQ6XG4gICAgICBrZXkgPSAnXFx4MWJPUic7XG4gICAgICBicmVhaztcbiAgICAvLyBGNFxuICAgIGNhc2UgMTE1OlxuICAgICAga2V5ID0gJ1xceDFiT1MnO1xuICAgICAgYnJlYWs7XG4gICAgLy8gRjVcbiAgICBjYXNlIDExNjpcbiAgICAgIGtleSA9ICdcXHgxYlsxNX4nO1xuICAgICAgYnJlYWs7XG4gICAgLy8gRjZcbiAgICBjYXNlIDExNzpcbiAgICAgIGtleSA9ICdcXHgxYlsxN34nO1xuICAgICAgYnJlYWs7XG4gICAgLy8gRjdcbiAgICBjYXNlIDExODpcbiAgICAgIGtleSA9ICdcXHgxYlsxOH4nO1xuICAgICAgYnJlYWs7XG4gICAgLy8gRjhcbiAgICBjYXNlIDExOTpcbiAgICAgIGtleSA9ICdcXHgxYlsxOX4nO1xuICAgICAgYnJlYWs7XG4gICAgLy8gRjlcbiAgICBjYXNlIDEyMDpcbiAgICAgIGtleSA9ICdcXHgxYlsyMH4nO1xuICAgICAgYnJlYWs7XG4gICAgLy8gRjEwXG4gICAgY2FzZSAxMjE6XG4gICAgICBrZXkgPSAnXFx4MWJbMjF+JztcbiAgICAgIGJyZWFrO1xuICAgIC8vIEYxMVxuICAgIGNhc2UgMTIyOlxuICAgICAga2V5ID0gJ1xceDFiWzIzfic7XG4gICAgICBicmVhaztcbiAgICAvLyBGMTJcbiAgICBjYXNlIDEyMzpcbiAgICAgIGtleSA9ICdcXHgxYlsyNH4nO1xuICAgICAgYnJlYWs7XG4gICAgZGVmYXVsdDpcbiAgICAgIC8vIGEteiBhbmQgc3BhY2VcbiAgICAgIGlmIChldi5jdHJsS2V5KSB7XG4gICAgICAgIGlmIChldi5rZXlDb2RlID49IDY1ICYmIGV2LmtleUNvZGUgPD0gOTApIHtcbiAgICAgICAgICAvLyBDdHJsLUFcbiAgICAgICAgICBpZiAodGhpcy5zY3JlZW5LZXlzKSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMucHJlZml4TW9kZSAmJiAhdGhpcy5zZWxlY3RNb2RlICYmIGV2LmtleUNvZGUgPT09IDY1KSB7XG4gICAgICAgICAgICAgIHRoaXMuZW50ZXJQcmVmaXgoKTtcbiAgICAgICAgICAgICAgcmV0dXJuIGNhbmNlbChldik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEN0cmwtVlxuICAgICAgICAgIGlmICh0aGlzLnByZWZpeE1vZGUgJiYgZXYua2V5Q29kZSA9PT0gODYpIHtcbiAgICAgICAgICAgIHRoaXMubGVhdmVQcmVmaXgoKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gQ3RybC1DXG4gICAgICAgICAgaWYgKCh0aGlzLnByZWZpeE1vZGUgfHwgdGhpcy5zZWxlY3RNb2RlKSAmJiBldi5rZXlDb2RlID09PSA2Nykge1xuICAgICAgICAgICAgaWYgKHRoaXMudmlzdWFsTW9kZSkge1xuICAgICAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHNlbGYubGVhdmVWaXN1YWwoKTtcbiAgICAgICAgICAgICAgfSwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIGtleSA9IFN0cmluZy5mcm9tQ2hhckNvZGUoZXYua2V5Q29kZSAtIDY0KTtcbiAgICAgICAgfSBlbHNlIGlmIChldi5rZXlDb2RlID09PSAzMikge1xuICAgICAgICAgIC8vIE5VTFxuICAgICAgICAgIGtleSA9IFN0cmluZy5mcm9tQ2hhckNvZGUoMCk7XG4gICAgICAgIH0gZWxzZSBpZiAoZXYua2V5Q29kZSA+PSA1MSAmJiBldi5rZXlDb2RlIDw9IDU1KSB7XG4gICAgICAgICAgLy8gZXNjYXBlLCBmaWxlIHNlcCwgZ3JvdXAgc2VwLCByZWNvcmQgc2VwLCB1bml0IHNlcFxuICAgICAgICAgIGtleSA9IFN0cmluZy5mcm9tQ2hhckNvZGUoZXYua2V5Q29kZSAtIDUxICsgMjcpO1xuICAgICAgICB9IGVsc2UgaWYgKGV2LmtleUNvZGUgPT09IDU2KSB7XG4gICAgICAgICAgLy8gZGVsZXRlXG4gICAgICAgICAga2V5ID0gU3RyaW5nLmZyb21DaGFyQ29kZSgxMjcpO1xuICAgICAgICB9IGVsc2UgaWYgKGV2LmtleUNvZGUgPT09IDIxOSkge1xuICAgICAgICAgIC8vIF5bIC0gZXNjYXBlXG4gICAgICAgICAga2V5ID0gU3RyaW5nLmZyb21DaGFyQ29kZSgyNyk7XG4gICAgICAgIH0gZWxzZSBpZiAoZXYua2V5Q29kZSA9PT0gMjIxKSB7XG4gICAgICAgICAgLy8gXl0gLSBncm91cCBzZXBcbiAgICAgICAgICBrZXkgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKDI5KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICgoIXRoaXMuaXNNYWMgJiYgZXYuYWx0S2V5KSB8fCAodGhpcy5pc01hYyAmJiBldi5tZXRhS2V5KSkge1xuICAgICAgICBpZiAoZXYua2V5Q29kZSA+PSA2NSAmJiBldi5rZXlDb2RlIDw9IDkwKSB7XG4gICAgICAgICAga2V5ID0gJ1xceDFiJyArIFN0cmluZy5mcm9tQ2hhckNvZGUoZXYua2V5Q29kZSArIDMyKTtcbiAgICAgICAgfSBlbHNlIGlmIChldi5rZXlDb2RlID09PSAxOTIpIHtcbiAgICAgICAgICBrZXkgPSAnXFx4MWJgJztcbiAgICAgICAgfSBlbHNlIGlmIChldi5rZXlDb2RlID49IDQ4ICYmIGV2LmtleUNvZGUgPD0gNTcpIHtcbiAgICAgICAgICBrZXkgPSAnXFx4MWInICsgKGV2LmtleUNvZGUgLSA0OCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICB9XG5cbiAgaWYgKCFrZXkpIHJldHVybiB0cnVlO1xuXG4gIGlmICh0aGlzLnByZWZpeE1vZGUpIHtcbiAgICB0aGlzLmxlYXZlUHJlZml4KCk7XG4gICAgcmV0dXJuIGNhbmNlbChldik7XG4gIH1cblxuICBpZiAodGhpcy5zZWxlY3RNb2RlKSB7XG4gICAgdGhpcy5rZXlTZWxlY3QoZXYsIGtleSk7XG4gICAgcmV0dXJuIGNhbmNlbChldik7XG4gIH1cblxuICB0aGlzLmVtaXQoJ2tleWRvd24nLCBldik7XG4gIHRoaXMuZW1pdCgna2V5Jywga2V5LCBldik7XG5cbiAgdGhpcy5zaG93Q3Vyc29yKCk7XG4gIHRoaXMuaGFuZGxlcihrZXkpO1xuXG4gIHJldHVybiBjYW5jZWwoZXYpO1xufTtcblxuVGVybWluYWwucHJvdG90eXBlLnNldGdMZXZlbCA9IGZ1bmN0aW9uKGcpIHtcbiAgdGhpcy5nbGV2ZWwgPSBnO1xuICB0aGlzLmNoYXJzZXQgPSB0aGlzLmNoYXJzZXRzW2ddO1xufTtcblxuVGVybWluYWwucHJvdG90eXBlLnNldGdDaGFyc2V0ID0gZnVuY3Rpb24oZywgY2hhcnNldCkge1xuICB0aGlzLmNoYXJzZXRzW2ddID0gY2hhcnNldDtcbiAgaWYgKHRoaXMuZ2xldmVsID09PSBnKSB7XG4gICAgdGhpcy5jaGFyc2V0ID0gY2hhcnNldDtcbiAgfVxufTtcblxuVGVybWluYWwucHJvdG90eXBlLmtleVByZXNzID0gZnVuY3Rpb24oZXYpIHtcbiAgdmFyIGtleTtcblxuICBjYW5jZWwoZXYpO1xuXG4gIGlmIChldi5jaGFyQ29kZSkge1xuICAgIGtleSA9IGV2LmNoYXJDb2RlO1xuICB9IGVsc2UgaWYgKGV2LndoaWNoID09IG51bGwpIHtcbiAgICBrZXkgPSBldi5rZXlDb2RlO1xuICB9IGVsc2UgaWYgKGV2LndoaWNoICE9PSAwICYmIGV2LmNoYXJDb2RlICE9PSAwKSB7XG4gICAga2V5ID0gZXYud2hpY2g7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYgKCFrZXkgfHwgZXYuY3RybEtleSB8fCBldi5hbHRLZXkgfHwgZXYubWV0YUtleSkgcmV0dXJuIGZhbHNlO1xuXG4gIGtleSA9IFN0cmluZy5mcm9tQ2hhckNvZGUoa2V5KTtcblxuICBpZiAodGhpcy5wcmVmaXhNb2RlKSB7XG4gICAgdGhpcy5sZWF2ZVByZWZpeCgpO1xuICAgIHRoaXMua2V5UHJlZml4KGV2LCBrZXkpO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGlmICh0aGlzLnNlbGVjdE1vZGUpIHtcbiAgICB0aGlzLmtleVNlbGVjdChldiwga2V5KTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICB0aGlzLmVtaXQoJ2tleXByZXNzJywga2V5LCBldik7XG4gIHRoaXMuZW1pdCgna2V5Jywga2V5LCBldik7XG5cbiAgdGhpcy5zaG93Q3Vyc29yKCk7XG4gIHRoaXMuaGFuZGxlcihrZXkpO1xuXG4gIHJldHVybiBmYWxzZTtcbn07XG5cblRlcm1pbmFsLnByb3RvdHlwZS5zZW5kID0gZnVuY3Rpb24oZGF0YSkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgaWYgKCF0aGlzLnF1ZXVlKSB7XG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgIHNlbGYuaGFuZGxlcihzZWxmLnF1ZXVlKTtcbiAgICAgIHNlbGYucXVldWUgPSAnJztcbiAgICB9LCAxKTtcbiAgfVxuXG4gIHRoaXMucXVldWUgKz0gZGF0YTtcbn07XG5cblRlcm1pbmFsLnByb3RvdHlwZS5iZWxsID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuZW1pdCgnYmVsbCcpO1xuICBpZiAoIXRoaXMudmlzdWFsQmVsbCkgcmV0dXJuO1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHRoaXMuZWxlbWVudC5zdHlsZS5ib3JkZXJDb2xvciA9ICd3aGl0ZSc7XG4gIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgc2VsZi5lbGVtZW50LnN0eWxlLmJvcmRlckNvbG9yID0gJyc7XG4gIH0sIDEwKTtcbiAgaWYgKHRoaXMucG9wT25CZWxsKSB0aGlzLmZvY3VzKCk7XG59O1xuXG5UZXJtaW5hbC5wcm90b3R5cGUubG9nID0gZnVuY3Rpb24oKSB7XG4gIGlmICghdGhpcy5kZWJ1ZykgcmV0dXJuO1xuICBpZiAoIXRoaXMuY29udGV4dC5jb25zb2xlIHx8ICF0aGlzLmNvbnRleHQuY29uc29sZS5sb2cpIHJldHVybjtcbiAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICB0aGlzLmNvbnRleHQuY29uc29sZS5sb2cuYXBwbHkodGhpcy5jb250ZXh0LmNvbnNvbGUsIGFyZ3MpO1xufTtcblxuVGVybWluYWwucHJvdG90eXBlLmVycm9yID0gZnVuY3Rpb24oKSB7XG4gIGlmICghdGhpcy5kZWJ1ZykgcmV0dXJuO1xuICBpZiAoIXRoaXMuY29udGV4dC5jb25zb2xlIHx8ICF0aGlzLmNvbnRleHQuY29uc29sZS5lcnJvcikgcmV0dXJuO1xuICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gIHRoaXMuY29udGV4dC5jb25zb2xlLmVycm9yLmFwcGx5KHRoaXMuY29udGV4dC5jb25zb2xlLCBhcmdzKTtcbn07XG5cblRlcm1pbmFsLnByb3RvdHlwZS5yZXNpemUgPSBmdW5jdGlvbih4LCB5KSB7XG4gIHZhciBsaW5lXG4gICAgLCBlbFxuICAgICwgaVxuICAgICwgalxuICAgICwgY2g7XG5cbiAgaWYgKHggPCAxKSB4ID0gMTtcbiAgaWYgKHkgPCAxKSB5ID0gMTtcblxuICAvLyByZXNpemUgY29sc1xuICBqID0gdGhpcy5jb2xzO1xuICBpZiAoaiA8IHgpIHtcbiAgICBjaCA9IFt0aGlzLmRlZkF0dHIsICcgJ107IC8vIGRvZXMgeHRlcm0gdXNlIHRoZSBkZWZhdWx0IGF0dHI/XG4gICAgaSA9IHRoaXMubGluZXMubGVuZ3RoO1xuICAgIHdoaWxlIChpLS0pIHtcbiAgICAgIHdoaWxlICh0aGlzLmxpbmVzW2ldLmxlbmd0aCA8IHgpIHtcbiAgICAgICAgdGhpcy5saW5lc1tpXS5wdXNoKGNoKTtcbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSBpZiAoaiA+IHgpIHtcbiAgICBpID0gdGhpcy5saW5lcy5sZW5ndGg7XG4gICAgd2hpbGUgKGktLSkge1xuICAgICAgd2hpbGUgKHRoaXMubGluZXNbaV0ubGVuZ3RoID4geCkge1xuICAgICAgICB0aGlzLmxpbmVzW2ldLnBvcCgpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICB0aGlzLnNldHVwU3RvcHMoaik7XG4gIHRoaXMuY29scyA9IHg7XG5cbiAgLy8gcmVzaXplIHJvd3NcbiAgaiA9IHRoaXMucm93cztcbiAgaWYgKGogPCB5KSB7XG4gICAgZWwgPSB0aGlzLmVsZW1lbnQ7XG4gICAgd2hpbGUgKGorKyA8IHkpIHtcbiAgICAgIGlmICh0aGlzLmxpbmVzLmxlbmd0aCA8IHkgKyB0aGlzLnliYXNlKSB7XG4gICAgICAgIHRoaXMubGluZXMucHVzaCh0aGlzLmJsYW5rTGluZSgpKTtcbiAgICAgIH1cbiAgICAgIGlmICh0aGlzLmNoaWxkcmVuLmxlbmd0aCA8IHkpIHtcbiAgICAgICAgbGluZSA9IHRoaXMuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIGVsLmFwcGVuZENoaWxkKGxpbmUpO1xuICAgICAgICB0aGlzLmNoaWxkcmVuLnB1c2gobGluZSk7XG4gICAgICB9XG4gICAgfVxuICB9IGVsc2UgaWYgKGogPiB5KSB7XG4gICAgd2hpbGUgKGotLSA+IHkpIHtcbiAgICAgIGlmICh0aGlzLmxpbmVzLmxlbmd0aCA+IHkgKyB0aGlzLnliYXNlKSB7XG4gICAgICAgIHRoaXMubGluZXMucG9wKCk7XG4gICAgICB9XG4gICAgICBpZiAodGhpcy5jaGlsZHJlbi5sZW5ndGggPiB5KSB7XG4gICAgICAgIGVsID0gdGhpcy5jaGlsZHJlbi5wb3AoKTtcbiAgICAgICAgaWYgKCFlbCkgY29udGludWU7XG4gICAgICAgIGVsLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoZWwpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICB0aGlzLnJvd3MgPSB5O1xuXG4gIC8vIG1ha2Ugc3VyZSB0aGUgY3Vyc29yIHN0YXlzIG9uIHNjcmVlblxuICBpZiAodGhpcy55ID49IHkpIHRoaXMueSA9IHkgLSAxO1xuICBpZiAodGhpcy54ID49IHgpIHRoaXMueCA9IHggLSAxO1xuXG4gIHRoaXMuc2Nyb2xsVG9wID0gMDtcbiAgdGhpcy5zY3JvbGxCb3R0b20gPSB5IC0gMTtcblxuICB0aGlzLnJlZnJlc2goMCwgdGhpcy5yb3dzIC0gMSk7XG5cbiAgLy8gaXQncyBhIHJlYWwgbmlnaHRtYXJlIHRyeWluZ1xuICAvLyB0byByZXNpemUgdGhlIG9yaWdpbmFsXG4gIC8vIHNjcmVlbiBidWZmZXIuIGp1c3Qgc2V0IGl0XG4gIC8vIHRvIG51bGwgZm9yIG5vdy5cbiAgdGhpcy5ub3JtYWwgPSBudWxsO1xufTtcblxuVGVybWluYWwucHJvdG90eXBlLnVwZGF0ZVJhbmdlID0gZnVuY3Rpb24oeSkge1xuICBpZiAoeSA8IHRoaXMucmVmcmVzaFN0YXJ0KSB0aGlzLnJlZnJlc2hTdGFydCA9IHk7XG4gIGlmICh5ID4gdGhpcy5yZWZyZXNoRW5kKSB0aGlzLnJlZnJlc2hFbmQgPSB5O1xuICAvLyBpZiAoeSA+IHRoaXMucmVmcmVzaEVuZCkge1xuICAvLyAgIHRoaXMucmVmcmVzaEVuZCA9IHk7XG4gIC8vICAgaWYgKHkgPiB0aGlzLnJvd3MgLSAxKSB7XG4gIC8vICAgICB0aGlzLnJlZnJlc2hFbmQgPSB0aGlzLnJvd3MgLSAxO1xuICAvLyAgIH1cbiAgLy8gfVxufTtcblxuVGVybWluYWwucHJvdG90eXBlLm1heFJhbmdlID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMucmVmcmVzaFN0YXJ0ID0gMDtcbiAgdGhpcy5yZWZyZXNoRW5kID0gdGhpcy5yb3dzIC0gMTtcbn07XG5cblRlcm1pbmFsLnByb3RvdHlwZS5zZXR1cFN0b3BzID0gZnVuY3Rpb24oaSkge1xuICBpZiAoaSAhPSBudWxsKSB7XG4gICAgaWYgKCF0aGlzLnRhYnNbaV0pIHtcbiAgICAgIGkgPSB0aGlzLnByZXZTdG9wKGkpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0aGlzLnRhYnMgPSB7fTtcbiAgICBpID0gMDtcbiAgfVxuXG4gIGZvciAoOyBpIDwgdGhpcy5jb2xzOyBpICs9IDgpIHtcbiAgICB0aGlzLnRhYnNbaV0gPSB0cnVlO1xuICB9XG59O1xuXG5UZXJtaW5hbC5wcm90b3R5cGUucHJldlN0b3AgPSBmdW5jdGlvbih4KSB7XG4gIGlmICh4ID09IG51bGwpIHggPSB0aGlzLng7XG4gIHdoaWxlICghdGhpcy50YWJzWy0teF0gJiYgeCA+IDApO1xuICByZXR1cm4geCA+PSB0aGlzLmNvbHNcbiAgICA/IHRoaXMuY29scyAtIDFcbiAgICA6IHggPCAwID8gMCA6IHg7XG59O1xuXG5UZXJtaW5hbC5wcm90b3R5cGUubmV4dFN0b3AgPSBmdW5jdGlvbih4KSB7XG4gIGlmICh4ID09IG51bGwpIHggPSB0aGlzLng7XG4gIHdoaWxlICghdGhpcy50YWJzWysreF0gJiYgeCA8IHRoaXMuY29scyk7XG4gIHJldHVybiB4ID49IHRoaXMuY29sc1xuICAgID8gdGhpcy5jb2xzIC0gMVxuICAgIDogeCA8IDAgPyAwIDogeDtcbn07XG5cblRlcm1pbmFsLnByb3RvdHlwZS5lcmFzZVJpZ2h0ID0gZnVuY3Rpb24oeCwgeSkge1xuICB2YXIgbGluZSA9IHRoaXMubGluZXNbdGhpcy55YmFzZSArIHldXG4gICAgLCBjaCA9IFt0aGlzLmVyYXNlQXR0cigpLCAnICddOyAvLyB4dGVybVxuXG5cbiAgZm9yICg7IHggPCB0aGlzLmNvbHM7IHgrKykge1xuICAgIGxpbmVbeF0gPSBjaDtcbiAgfVxuXG4gIHRoaXMudXBkYXRlUmFuZ2UoeSk7XG59O1xuXG5UZXJtaW5hbC5wcm90b3R5cGUuZXJhc2VMZWZ0ID0gZnVuY3Rpb24oeCwgeSkge1xuICB2YXIgbGluZSA9IHRoaXMubGluZXNbdGhpcy55YmFzZSArIHldXG4gICAgLCBjaCA9IFt0aGlzLmVyYXNlQXR0cigpLCAnICddOyAvLyB4dGVybVxuXG4gIHgrKztcbiAgd2hpbGUgKHgtLSkgbGluZVt4XSA9IGNoO1xuXG4gIHRoaXMudXBkYXRlUmFuZ2UoeSk7XG59O1xuXG5UZXJtaW5hbC5wcm90b3R5cGUuZXJhc2VMaW5lID0gZnVuY3Rpb24oeSkge1xuICB0aGlzLmVyYXNlUmlnaHQoMCwgeSk7XG59O1xuXG5UZXJtaW5hbC5wcm90b3R5cGUuYmxhbmtMaW5lID0gZnVuY3Rpb24oY3VyKSB7XG4gIHZhciBhdHRyID0gY3VyXG4gICAgPyB0aGlzLmVyYXNlQXR0cigpXG4gICAgOiB0aGlzLmRlZkF0dHI7XG5cbiAgdmFyIGNoID0gW2F0dHIsICcgJ11cbiAgICAsIGxpbmUgPSBbXVxuICAgICwgaSA9IDA7XG5cbiAgZm9yICg7IGkgPCB0aGlzLmNvbHM7IGkrKykge1xuICAgIGxpbmVbaV0gPSBjaDtcbiAgfVxuXG4gIHJldHVybiBsaW5lO1xufTtcblxuVGVybWluYWwucHJvdG90eXBlLmNoID0gZnVuY3Rpb24oY3VyKSB7XG4gIHJldHVybiBjdXJcbiAgICA/IFt0aGlzLmVyYXNlQXR0cigpLCAnICddXG4gICAgOiBbdGhpcy5kZWZBdHRyLCAnICddO1xufTtcblxuVGVybWluYWwucHJvdG90eXBlLmlzID0gZnVuY3Rpb24odGVybSkge1xuICB2YXIgbmFtZSA9IHRoaXMudGVybU5hbWU7XG4gIHJldHVybiAobmFtZSArICcnKS5pbmRleE9mKHRlcm0pID09PSAwO1xufTtcblxuVGVybWluYWwucHJvdG90eXBlLmhhbmRsZXIgPSBmdW5jdGlvbihkYXRhKSB7XG4gIHRoaXMuZW1pdCgnZGF0YScsIGRhdGEpO1xufTtcblxuVGVybWluYWwucHJvdG90eXBlLmhhbmRsZVRpdGxlID0gZnVuY3Rpb24odGl0bGUpIHtcbiAgdGhpcy5lbWl0KCd0aXRsZScsIHRpdGxlKTtcbn07XG5cbi8qKlxuICogRVNDXG4gKi9cblxuLy8gRVNDIEQgSW5kZXggKElORCBpcyAweDg0KS5cblRlcm1pbmFsLnByb3RvdHlwZS5pbmRleCA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLnkrKztcbiAgaWYgKHRoaXMueSA+IHRoaXMuc2Nyb2xsQm90dG9tKSB7XG4gICAgdGhpcy55LS07XG4gICAgdGhpcy5zY3JvbGwoKTtcbiAgfVxuICB0aGlzLnN0YXRlID0gbm9ybWFsO1xufTtcblxuLy8gRVNDIE0gUmV2ZXJzZSBJbmRleCAoUkkgaXMgMHg4ZCkuXG5UZXJtaW5hbC5wcm90b3R5cGUucmV2ZXJzZUluZGV4ID0gZnVuY3Rpb24oKSB7XG4gIHZhciBqO1xuICB0aGlzLnktLTtcbiAgaWYgKHRoaXMueSA8IHRoaXMuc2Nyb2xsVG9wKSB7XG4gICAgdGhpcy55Kys7XG4gICAgLy8gcG9zc2libHkgbW92ZSB0aGUgY29kZSBiZWxvdyB0byB0ZXJtLnJldmVyc2VTY3JvbGwoKTtcbiAgICAvLyB0ZXN0OiBlY2hvIC1uZSAnXFxlWzE7MUhcXGVbNDRtXFxlTVxcZVswbSdcbiAgICAvLyBibGFua0xpbmUodHJ1ZSkgaXMgeHRlcm0vbGludXggYmVoYXZpb3JcbiAgICB0aGlzLmxpbmVzLnNwbGljZSh0aGlzLnkgKyB0aGlzLnliYXNlLCAwLCB0aGlzLmJsYW5rTGluZSh0cnVlKSk7XG4gICAgaiA9IHRoaXMucm93cyAtIDEgLSB0aGlzLnNjcm9sbEJvdHRvbTtcbiAgICB0aGlzLmxpbmVzLnNwbGljZSh0aGlzLnJvd3MgLSAxICsgdGhpcy55YmFzZSAtIGogKyAxLCAxKTtcbiAgICAvLyB0aGlzLm1heFJhbmdlKCk7XG4gICAgdGhpcy51cGRhdGVSYW5nZSh0aGlzLnNjcm9sbFRvcCk7XG4gICAgdGhpcy51cGRhdGVSYW5nZSh0aGlzLnNjcm9sbEJvdHRvbSk7XG4gIH1cbiAgdGhpcy5zdGF0ZSA9IG5vcm1hbDtcbn07XG5cbi8vIEVTQyBjIEZ1bGwgUmVzZXQgKFJJUykuXG5UZXJtaW5hbC5wcm90b3R5cGUucmVzZXQgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5vcHRpb25zLnJvd3MgPSB0aGlzLnJvd3M7XG4gIHRoaXMub3B0aW9ucy5jb2xzID0gdGhpcy5jb2xzO1xuICBUZXJtaW5hbC5jYWxsKHRoaXMsIHRoaXMub3B0aW9ucyk7XG4gIHRoaXMucmVmcmVzaCgwLCB0aGlzLnJvd3MgLSAxKTtcbn07XG5cbi8vIEVTQyBIIFRhYiBTZXQgKEhUUyBpcyAweDg4KS5cblRlcm1pbmFsLnByb3RvdHlwZS50YWJTZXQgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy50YWJzW3RoaXMueF0gPSB0cnVlO1xuICB0aGlzLnN0YXRlID0gbm9ybWFsO1xufTtcblxuLyoqXG4gKiBDU0lcbiAqL1xuXG4vLyBDU0kgUHMgQVxuLy8gQ3Vyc29yIFVwIFBzIFRpbWVzIChkZWZhdWx0ID0gMSkgKENVVSkuXG5UZXJtaW5hbC5wcm90b3R5cGUuY3Vyc29yVXAgPSBmdW5jdGlvbihwYXJhbXMpIHtcbiAgdmFyIHBhcmFtID0gcGFyYW1zWzBdO1xuICBpZiAocGFyYW0gPCAxKSBwYXJhbSA9IDE7XG4gIHRoaXMueSAtPSBwYXJhbTtcbiAgaWYgKHRoaXMueSA8IDApIHRoaXMueSA9IDA7XG59O1xuXG4vLyBDU0kgUHMgQlxuLy8gQ3Vyc29yIERvd24gUHMgVGltZXMgKGRlZmF1bHQgPSAxKSAoQ1VEKS5cblRlcm1pbmFsLnByb3RvdHlwZS5jdXJzb3JEb3duID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gIHZhciBwYXJhbSA9IHBhcmFtc1swXTtcbiAgaWYgKHBhcmFtIDwgMSkgcGFyYW0gPSAxO1xuICB0aGlzLnkgKz0gcGFyYW07XG4gIGlmICh0aGlzLnkgPj0gdGhpcy5yb3dzKSB7XG4gICAgdGhpcy55ID0gdGhpcy5yb3dzIC0gMTtcbiAgfVxufTtcblxuLy8gQ1NJIFBzIENcbi8vIEN1cnNvciBGb3J3YXJkIFBzIFRpbWVzIChkZWZhdWx0ID0gMSkgKENVRikuXG5UZXJtaW5hbC5wcm90b3R5cGUuY3Vyc29yRm9yd2FyZCA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICB2YXIgcGFyYW0gPSBwYXJhbXNbMF07XG4gIGlmIChwYXJhbSA8IDEpIHBhcmFtID0gMTtcbiAgdGhpcy54ICs9IHBhcmFtO1xuICBpZiAodGhpcy54ID49IHRoaXMuY29scykge1xuICAgIHRoaXMueCA9IHRoaXMuY29scyAtIDE7XG4gIH1cbn07XG5cbi8vIENTSSBQcyBEXG4vLyBDdXJzb3IgQmFja3dhcmQgUHMgVGltZXMgKGRlZmF1bHQgPSAxKSAoQ1VCKS5cblRlcm1pbmFsLnByb3RvdHlwZS5jdXJzb3JCYWNrd2FyZCA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICB2YXIgcGFyYW0gPSBwYXJhbXNbMF07XG4gIGlmIChwYXJhbSA8IDEpIHBhcmFtID0gMTtcbiAgdGhpcy54IC09IHBhcmFtO1xuICBpZiAodGhpcy54IDwgMCkgdGhpcy54ID0gMDtcbn07XG5cbi8vIENTSSBQcyA7IFBzIEhcbi8vIEN1cnNvciBQb3NpdGlvbiBbcm93O2NvbHVtbl0gKGRlZmF1bHQgPSBbMSwxXSkgKENVUCkuXG5UZXJtaW5hbC5wcm90b3R5cGUuY3Vyc29yUG9zID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gIHZhciByb3csIGNvbDtcblxuICByb3cgPSBwYXJhbXNbMF0gLSAxO1xuXG4gIGlmIChwYXJhbXMubGVuZ3RoID49IDIpIHtcbiAgICBjb2wgPSBwYXJhbXNbMV0gLSAxO1xuICB9IGVsc2Uge1xuICAgIGNvbCA9IDA7XG4gIH1cblxuICBpZiAocm93IDwgMCkge1xuICAgIHJvdyA9IDA7XG4gIH0gZWxzZSBpZiAocm93ID49IHRoaXMucm93cykge1xuICAgIHJvdyA9IHRoaXMucm93cyAtIDE7XG4gIH1cblxuICBpZiAoY29sIDwgMCkge1xuICAgIGNvbCA9IDA7XG4gIH0gZWxzZSBpZiAoY29sID49IHRoaXMuY29scykge1xuICAgIGNvbCA9IHRoaXMuY29scyAtIDE7XG4gIH1cblxuICB0aGlzLnggPSBjb2w7XG4gIHRoaXMueSA9IHJvdztcbn07XG5cbi8vIENTSSBQcyBKICBFcmFzZSBpbiBEaXNwbGF5IChFRCkuXG4vLyAgICAgUHMgPSAwICAtPiBFcmFzZSBCZWxvdyAoZGVmYXVsdCkuXG4vLyAgICAgUHMgPSAxICAtPiBFcmFzZSBBYm92ZS5cbi8vICAgICBQcyA9IDIgIC0+IEVyYXNlIEFsbC5cbi8vICAgICBQcyA9IDMgIC0+IEVyYXNlIFNhdmVkIExpbmVzICh4dGVybSkuXG4vLyBDU0kgPyBQcyBKXG4vLyAgIEVyYXNlIGluIERpc3BsYXkgKERFQ1NFRCkuXG4vLyAgICAgUHMgPSAwICAtPiBTZWxlY3RpdmUgRXJhc2UgQmVsb3cgKGRlZmF1bHQpLlxuLy8gICAgIFBzID0gMSAgLT4gU2VsZWN0aXZlIEVyYXNlIEFib3ZlLlxuLy8gICAgIFBzID0gMiAgLT4gU2VsZWN0aXZlIEVyYXNlIEFsbC5cblRlcm1pbmFsLnByb3RvdHlwZS5lcmFzZUluRGlzcGxheSA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICB2YXIgajtcbiAgc3dpdGNoIChwYXJhbXNbMF0pIHtcbiAgICBjYXNlIDA6XG4gICAgICB0aGlzLmVyYXNlUmlnaHQodGhpcy54LCB0aGlzLnkpO1xuICAgICAgaiA9IHRoaXMueSArIDE7XG4gICAgICBmb3IgKDsgaiA8IHRoaXMucm93czsgaisrKSB7XG4gICAgICAgIHRoaXMuZXJhc2VMaW5lKGopO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAxOlxuICAgICAgdGhpcy5lcmFzZUxlZnQodGhpcy54LCB0aGlzLnkpO1xuICAgICAgaiA9IHRoaXMueTtcbiAgICAgIHdoaWxlIChqLS0pIHtcbiAgICAgICAgdGhpcy5lcmFzZUxpbmUoaik7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlIDI6XG4gICAgICBqID0gdGhpcy5yb3dzO1xuICAgICAgd2hpbGUgKGotLSkgdGhpcy5lcmFzZUxpbmUoaik7XG4gICAgICBicmVhaztcbiAgICBjYXNlIDM6XG4gICAgICA7IC8vIG5vIHNhdmVkIGxpbmVzXG4gICAgICBicmVhaztcbiAgfVxufTtcblxuLy8gQ1NJIFBzIEsgIEVyYXNlIGluIExpbmUgKEVMKS5cbi8vICAgICBQcyA9IDAgIC0+IEVyYXNlIHRvIFJpZ2h0IChkZWZhdWx0KS5cbi8vICAgICBQcyA9IDEgIC0+IEVyYXNlIHRvIExlZnQuXG4vLyAgICAgUHMgPSAyICAtPiBFcmFzZSBBbGwuXG4vLyBDU0kgPyBQcyBLXG4vLyAgIEVyYXNlIGluIExpbmUgKERFQ1NFTCkuXG4vLyAgICAgUHMgPSAwICAtPiBTZWxlY3RpdmUgRXJhc2UgdG8gUmlnaHQgKGRlZmF1bHQpLlxuLy8gICAgIFBzID0gMSAgLT4gU2VsZWN0aXZlIEVyYXNlIHRvIExlZnQuXG4vLyAgICAgUHMgPSAyICAtPiBTZWxlY3RpdmUgRXJhc2UgQWxsLlxuVGVybWluYWwucHJvdG90eXBlLmVyYXNlSW5MaW5lID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gIHN3aXRjaCAocGFyYW1zWzBdKSB7XG4gICAgY2FzZSAwOlxuICAgICAgdGhpcy5lcmFzZVJpZ2h0KHRoaXMueCwgdGhpcy55KTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgMTpcbiAgICAgIHRoaXMuZXJhc2VMZWZ0KHRoaXMueCwgdGhpcy55KTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgMjpcbiAgICAgIHRoaXMuZXJhc2VMaW5lKHRoaXMueSk7XG4gICAgICBicmVhaztcbiAgfVxufTtcblxuLy8gQ1NJIFBtIG0gIENoYXJhY3RlciBBdHRyaWJ1dGVzIChTR1IpLlxuLy8gICAgIFBzID0gMCAgLT4gTm9ybWFsIChkZWZhdWx0KS5cbi8vICAgICBQcyA9IDEgIC0+IEJvbGQuXG4vLyAgICAgUHMgPSA0ICAtPiBVbmRlcmxpbmVkLlxuLy8gICAgIFBzID0gNSAgLT4gQmxpbmsgKGFwcGVhcnMgYXMgQm9sZCkuXG4vLyAgICAgUHMgPSA3ICAtPiBJbnZlcnNlLlxuLy8gICAgIFBzID0gOCAgLT4gSW52aXNpYmxlLCBpLmUuLCBoaWRkZW4gKFZUMzAwKS5cbi8vICAgICBQcyA9IDIgMiAgLT4gTm9ybWFsIChuZWl0aGVyIGJvbGQgbm9yIGZhaW50KS5cbi8vICAgICBQcyA9IDIgNCAgLT4gTm90IHVuZGVybGluZWQuXG4vLyAgICAgUHMgPSAyIDUgIC0+IFN0ZWFkeSAobm90IGJsaW5raW5nKS5cbi8vICAgICBQcyA9IDIgNyAgLT4gUG9zaXRpdmUgKG5vdCBpbnZlcnNlKS5cbi8vICAgICBQcyA9IDIgOCAgLT4gVmlzaWJsZSwgaS5lLiwgbm90IGhpZGRlbiAoVlQzMDApLlxuLy8gICAgIFBzID0gMyAwICAtPiBTZXQgZm9yZWdyb3VuZCBjb2xvciB0byBCbGFjay5cbi8vICAgICBQcyA9IDMgMSAgLT4gU2V0IGZvcmVncm91bmQgY29sb3IgdG8gUmVkLlxuLy8gICAgIFBzID0gMyAyICAtPiBTZXQgZm9yZWdyb3VuZCBjb2xvciB0byBHcmVlbi5cbi8vICAgICBQcyA9IDMgMyAgLT4gU2V0IGZvcmVncm91bmQgY29sb3IgdG8gWWVsbG93LlxuLy8gICAgIFBzID0gMyA0ICAtPiBTZXQgZm9yZWdyb3VuZCBjb2xvciB0byBCbHVlLlxuLy8gICAgIFBzID0gMyA1ICAtPiBTZXQgZm9yZWdyb3VuZCBjb2xvciB0byBNYWdlbnRhLlxuLy8gICAgIFBzID0gMyA2ICAtPiBTZXQgZm9yZWdyb3VuZCBjb2xvciB0byBDeWFuLlxuLy8gICAgIFBzID0gMyA3ICAtPiBTZXQgZm9yZWdyb3VuZCBjb2xvciB0byBXaGl0ZS5cbi8vICAgICBQcyA9IDMgOSAgLT4gU2V0IGZvcmVncm91bmQgY29sb3IgdG8gZGVmYXVsdCAob3JpZ2luYWwpLlxuLy8gICAgIFBzID0gNCAwICAtPiBTZXQgYmFja2dyb3VuZCBjb2xvciB0byBCbGFjay5cbi8vICAgICBQcyA9IDQgMSAgLT4gU2V0IGJhY2tncm91bmQgY29sb3IgdG8gUmVkLlxuLy8gICAgIFBzID0gNCAyICAtPiBTZXQgYmFja2dyb3VuZCBjb2xvciB0byBHcmVlbi5cbi8vICAgICBQcyA9IDQgMyAgLT4gU2V0IGJhY2tncm91bmQgY29sb3IgdG8gWWVsbG93LlxuLy8gICAgIFBzID0gNCA0ICAtPiBTZXQgYmFja2dyb3VuZCBjb2xvciB0byBCbHVlLlxuLy8gICAgIFBzID0gNCA1ICAtPiBTZXQgYmFja2dyb3VuZCBjb2xvciB0byBNYWdlbnRhLlxuLy8gICAgIFBzID0gNCA2ICAtPiBTZXQgYmFja2dyb3VuZCBjb2xvciB0byBDeWFuLlxuLy8gICAgIFBzID0gNCA3ICAtPiBTZXQgYmFja2dyb3VuZCBjb2xvciB0byBXaGl0ZS5cbi8vICAgICBQcyA9IDQgOSAgLT4gU2V0IGJhY2tncm91bmQgY29sb3IgdG8gZGVmYXVsdCAob3JpZ2luYWwpLlxuXG4vLyAgIElmIDE2LWNvbG9yIHN1cHBvcnQgaXMgY29tcGlsZWQsIHRoZSBmb2xsb3dpbmcgYXBwbHkuICBBc3N1bWVcbi8vICAgdGhhdCB4dGVybSdzIHJlc291cmNlcyBhcmUgc2V0IHNvIHRoYXQgdGhlIElTTyBjb2xvciBjb2RlcyBhcmVcbi8vICAgdGhlIGZpcnN0IDggb2YgYSBzZXQgb2YgMTYuICBUaGVuIHRoZSBhaXh0ZXJtIGNvbG9ycyBhcmUgdGhlXG4vLyAgIGJyaWdodCB2ZXJzaW9ucyBvZiB0aGUgSVNPIGNvbG9yczpcbi8vICAgICBQcyA9IDkgMCAgLT4gU2V0IGZvcmVncm91bmQgY29sb3IgdG8gQmxhY2suXG4vLyAgICAgUHMgPSA5IDEgIC0+IFNldCBmb3JlZ3JvdW5kIGNvbG9yIHRvIFJlZC5cbi8vICAgICBQcyA9IDkgMiAgLT4gU2V0IGZvcmVncm91bmQgY29sb3IgdG8gR3JlZW4uXG4vLyAgICAgUHMgPSA5IDMgIC0+IFNldCBmb3JlZ3JvdW5kIGNvbG9yIHRvIFllbGxvdy5cbi8vICAgICBQcyA9IDkgNCAgLT4gU2V0IGZvcmVncm91bmQgY29sb3IgdG8gQmx1ZS5cbi8vICAgICBQcyA9IDkgNSAgLT4gU2V0IGZvcmVncm91bmQgY29sb3IgdG8gTWFnZW50YS5cbi8vICAgICBQcyA9IDkgNiAgLT4gU2V0IGZvcmVncm91bmQgY29sb3IgdG8gQ3lhbi5cbi8vICAgICBQcyA9IDkgNyAgLT4gU2V0IGZvcmVncm91bmQgY29sb3IgdG8gV2hpdGUuXG4vLyAgICAgUHMgPSAxIDAgMCAgLT4gU2V0IGJhY2tncm91bmQgY29sb3IgdG8gQmxhY2suXG4vLyAgICAgUHMgPSAxIDAgMSAgLT4gU2V0IGJhY2tncm91bmQgY29sb3IgdG8gUmVkLlxuLy8gICAgIFBzID0gMSAwIDIgIC0+IFNldCBiYWNrZ3JvdW5kIGNvbG9yIHRvIEdyZWVuLlxuLy8gICAgIFBzID0gMSAwIDMgIC0+IFNldCBiYWNrZ3JvdW5kIGNvbG9yIHRvIFllbGxvdy5cbi8vICAgICBQcyA9IDEgMCA0ICAtPiBTZXQgYmFja2dyb3VuZCBjb2xvciB0byBCbHVlLlxuLy8gICAgIFBzID0gMSAwIDUgIC0+IFNldCBiYWNrZ3JvdW5kIGNvbG9yIHRvIE1hZ2VudGEuXG4vLyAgICAgUHMgPSAxIDAgNiAgLT4gU2V0IGJhY2tncm91bmQgY29sb3IgdG8gQ3lhbi5cbi8vICAgICBQcyA9IDEgMCA3ICAtPiBTZXQgYmFja2dyb3VuZCBjb2xvciB0byBXaGl0ZS5cblxuLy8gICBJZiB4dGVybSBpcyBjb21waWxlZCB3aXRoIHRoZSAxNi1jb2xvciBzdXBwb3J0IGRpc2FibGVkLCBpdFxuLy8gICBzdXBwb3J0cyB0aGUgZm9sbG93aW5nLCBmcm9tIHJ4dnQ6XG4vLyAgICAgUHMgPSAxIDAgMCAgLT4gU2V0IGZvcmVncm91bmQgYW5kIGJhY2tncm91bmQgY29sb3IgdG9cbi8vICAgICBkZWZhdWx0LlxuXG4vLyAgIElmIDg4LSBvciAyNTYtY29sb3Igc3VwcG9ydCBpcyBjb21waWxlZCwgdGhlIGZvbGxvd2luZyBhcHBseS5cbi8vICAgICBQcyA9IDMgOCAgOyA1ICA7IFBzIC0+IFNldCBmb3JlZ3JvdW5kIGNvbG9yIHRvIHRoZSBzZWNvbmRcbi8vICAgICBQcy5cbi8vICAgICBQcyA9IDQgOCAgOyA1ICA7IFBzIC0+IFNldCBiYWNrZ3JvdW5kIGNvbG9yIHRvIHRoZSBzZWNvbmRcbi8vICAgICBQcy5cblRlcm1pbmFsLnByb3RvdHlwZS5jaGFyQXR0cmlidXRlcyA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICAvLyBPcHRpbWl6ZSBhIHNpbmdsZSBTR1IwLlxuICBpZiAocGFyYW1zLmxlbmd0aCA9PT0gMSAmJiBwYXJhbXNbMF0gPT09IDApIHtcbiAgICB0aGlzLmN1ckF0dHIgPSB0aGlzLmRlZkF0dHI7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdmFyIGwgPSBwYXJhbXMubGVuZ3RoXG4gICAgLCBpID0gMFxuICAgICwgZmxhZ3MgPSB0aGlzLmN1ckF0dHIgPj4gMThcbiAgICAsIGZnID0gKHRoaXMuY3VyQXR0ciA+PiA5KSAmIDB4MWZmXG4gICAgLCBiZyA9IHRoaXMuY3VyQXR0ciAmIDB4MWZmXG4gICAgLCBwO1xuXG4gIGZvciAoOyBpIDwgbDsgaSsrKSB7XG4gICAgcCA9IHBhcmFtc1tpXTtcbiAgICBpZiAocCA+PSAzMCAmJiBwIDw9IDM3KSB7XG4gICAgICAvLyBmZyBjb2xvciA4XG4gICAgICBmZyA9IHAgLSAzMDtcbiAgICB9IGVsc2UgaWYgKHAgPj0gNDAgJiYgcCA8PSA0Nykge1xuICAgICAgLy8gYmcgY29sb3IgOFxuICAgICAgYmcgPSBwIC0gNDA7XG4gICAgfSBlbHNlIGlmIChwID49IDkwICYmIHAgPD0gOTcpIHtcbiAgICAgIC8vIGZnIGNvbG9yIDE2XG4gICAgICBwICs9IDg7XG4gICAgICBmZyA9IHAgLSA5MDtcbiAgICB9IGVsc2UgaWYgKHAgPj0gMTAwICYmIHAgPD0gMTA3KSB7XG4gICAgICAvLyBiZyBjb2xvciAxNlxuICAgICAgcCArPSA4O1xuICAgICAgYmcgPSBwIC0gMTAwO1xuICAgIH0gZWxzZSBpZiAocCA9PT0gMCkge1xuICAgICAgLy8gZGVmYXVsdFxuICAgICAgZmxhZ3MgPSB0aGlzLmRlZkF0dHIgPj4gMTg7XG4gICAgICBmZyA9ICh0aGlzLmRlZkF0dHIgPj4gOSkgJiAweDFmZjtcbiAgICAgIGJnID0gdGhpcy5kZWZBdHRyICYgMHgxZmY7XG4gICAgICAvLyBmbGFncyA9IDA7XG4gICAgICAvLyBmZyA9IDB4MWZmO1xuICAgICAgLy8gYmcgPSAweDFmZjtcbiAgICB9IGVsc2UgaWYgKHAgPT09IDEpIHtcbiAgICAgIC8vIGJvbGQgdGV4dFxuICAgICAgZmxhZ3MgfD0gMTtcbiAgICB9IGVsc2UgaWYgKHAgPT09IDQpIHtcbiAgICAgIC8vIHVuZGVybGluZWQgdGV4dFxuICAgICAgZmxhZ3MgfD0gMjtcbiAgICB9IGVsc2UgaWYgKHAgPT09IDUpIHtcbiAgICAgIC8vIGJsaW5rXG4gICAgICBmbGFncyB8PSA0O1xuICAgIH0gZWxzZSBpZiAocCA9PT0gNykge1xuICAgICAgLy8gaW52ZXJzZSBhbmQgcG9zaXRpdmVcbiAgICAgIC8vIHRlc3Qgd2l0aDogZWNobyAtZSAnXFxlWzMxbVxcZVs0Mm1oZWxsb1xcZVs3bXdvcmxkXFxlWzI3bWhpXFxlW20nXG4gICAgICBmbGFncyB8PSA4O1xuICAgIH0gZWxzZSBpZiAocCA9PT0gOCkge1xuICAgICAgLy8gaW52aXNpYmxlXG4gICAgICBmbGFncyB8PSAxNjtcbiAgICB9IGVsc2UgaWYgKHAgPT09IDIyKSB7XG4gICAgICAvLyBub3QgYm9sZFxuICAgICAgZmxhZ3MgJj0gfjE7XG4gICAgfSBlbHNlIGlmIChwID09PSAyNCkge1xuICAgICAgLy8gbm90IHVuZGVybGluZWRcbiAgICAgIGZsYWdzICY9IH4yO1xuICAgIH0gZWxzZSBpZiAocCA9PT0gMjUpIHtcbiAgICAgIC8vIG5vdCBibGlua1xuICAgICAgZmxhZ3MgJj0gfjQ7XG4gICAgfSBlbHNlIGlmIChwID09PSAyNykge1xuICAgICAgLy8gbm90IGludmVyc2VcbiAgICAgIGZsYWdzICY9IH44O1xuICAgIH0gZWxzZSBpZiAocCA9PT0gMjgpIHtcbiAgICAgIC8vIG5vdCBpbnZpc2libGVcbiAgICAgIGZsYWdzICY9IH4xNjtcbiAgICB9IGVsc2UgaWYgKHAgPT09IDM5KSB7XG4gICAgICAvLyByZXNldCBmZ1xuICAgICAgZmcgPSAodGhpcy5kZWZBdHRyID4+IDkpICYgMHgxZmY7XG4gICAgfSBlbHNlIGlmIChwID09PSA0OSkge1xuICAgICAgLy8gcmVzZXQgYmdcbiAgICAgIGJnID0gdGhpcy5kZWZBdHRyICYgMHgxZmY7XG4gICAgfSBlbHNlIGlmIChwID09PSAzOCkge1xuICAgICAgLy8gZmcgY29sb3IgMjU2XG4gICAgICBpZiAocGFyYW1zW2kgKyAxXSA9PT0gMikge1xuICAgICAgICBpICs9IDI7XG4gICAgICAgIGZnID0gbWF0Y2hDb2xvcihcbiAgICAgICAgICBwYXJhbXNbaV0gJiAweGZmLFxuICAgICAgICAgIHBhcmFtc1tpICsgMV0gJiAweGZmLFxuICAgICAgICAgIHBhcmFtc1tpICsgMl0gJiAweGZmKTtcbiAgICAgICAgaWYgKGZnID09PSAtMSkgZmcgPSAweDFmZjtcbiAgICAgICAgaSArPSAyO1xuICAgICAgfSBlbHNlIGlmIChwYXJhbXNbaSArIDFdID09PSA1KSB7XG4gICAgICAgIGkgKz0gMjtcbiAgICAgICAgcCA9IHBhcmFtc1tpXSAmIDB4ZmY7XG4gICAgICAgIGZnID0gcDtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHAgPT09IDQ4KSB7XG4gICAgICAvLyBiZyBjb2xvciAyNTZcbiAgICAgIGlmIChwYXJhbXNbaSArIDFdID09PSAyKSB7XG4gICAgICAgIGkgKz0gMjtcbiAgICAgICAgYmcgPSBtYXRjaENvbG9yKFxuICAgICAgICAgIHBhcmFtc1tpXSAmIDB4ZmYsXG4gICAgICAgICAgcGFyYW1zW2kgKyAxXSAmIDB4ZmYsXG4gICAgICAgICAgcGFyYW1zW2kgKyAyXSAmIDB4ZmYpO1xuICAgICAgICBpZiAoYmcgPT09IC0xKSBiZyA9IDB4MWZmO1xuICAgICAgICBpICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKHBhcmFtc1tpICsgMV0gPT09IDUpIHtcbiAgICAgICAgaSArPSAyO1xuICAgICAgICBwID0gcGFyYW1zW2ldICYgMHhmZjtcbiAgICAgICAgYmcgPSBwO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAocCA9PT0gMTAwKSB7XG4gICAgICAvLyByZXNldCBmZy9iZ1xuICAgICAgZmcgPSAodGhpcy5kZWZBdHRyID4+IDkpICYgMHgxZmY7XG4gICAgICBiZyA9IHRoaXMuZGVmQXR0ciAmIDB4MWZmO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmVycm9yKCdVbmtub3duIFNHUiBhdHRyaWJ1dGU6ICVkLicsIHApO1xuICAgIH1cbiAgfVxuXG4gIHRoaXMuY3VyQXR0ciA9IChmbGFncyA8PCAxOCkgfCAoZmcgPDwgOSkgfCBiZztcbn07XG5cbi8vIENTSSBQcyBuICBEZXZpY2UgU3RhdHVzIFJlcG9ydCAoRFNSKS5cbi8vICAgICBQcyA9IDUgIC0+IFN0YXR1cyBSZXBvcnQuICBSZXN1bHQgKGBgT0snJykgaXNcbi8vICAgQ1NJIDAgblxuLy8gICAgIFBzID0gNiAgLT4gUmVwb3J0IEN1cnNvciBQb3NpdGlvbiAoQ1BSKSBbcm93O2NvbHVtbl0uXG4vLyAgIFJlc3VsdCBpc1xuLy8gICBDU0kgciA7IGMgUlxuLy8gQ1NJID8gUHMgblxuLy8gICBEZXZpY2UgU3RhdHVzIFJlcG9ydCAoRFNSLCBERUMtc3BlY2lmaWMpLlxuLy8gICAgIFBzID0gNiAgLT4gUmVwb3J0IEN1cnNvciBQb3NpdGlvbiAoQ1BSKSBbcm93O2NvbHVtbl0gYXMgQ1NJXG4vLyAgICAgPyByIDsgYyBSIChhc3N1bWVzIHBhZ2UgaXMgemVybykuXG4vLyAgICAgUHMgPSAxIDUgIC0+IFJlcG9ydCBQcmludGVyIHN0YXR1cyBhcyBDU0kgPyAxIDAgIG4gIChyZWFkeSkuXG4vLyAgICAgb3IgQ1NJID8gMSAxICBuICAobm90IHJlYWR5KS5cbi8vICAgICBQcyA9IDIgNSAgLT4gUmVwb3J0IFVESyBzdGF0dXMgYXMgQ1NJID8gMiAwICBuICAodW5sb2NrZWQpXG4vLyAgICAgb3IgQ1NJID8gMiAxICBuICAobG9ja2VkKS5cbi8vICAgICBQcyA9IDIgNiAgLT4gUmVwb3J0IEtleWJvYXJkIHN0YXR1cyBhc1xuLy8gICBDU0kgPyAyIDcgIDsgIDEgIDsgIDAgIDsgIDAgIG4gIChOb3J0aCBBbWVyaWNhbikuXG4vLyAgIFRoZSBsYXN0IHR3byBwYXJhbWV0ZXJzIGFwcGx5IHRvIFZUNDAwICYgdXAsIGFuZCBkZW5vdGUga2V5LVxuLy8gICBib2FyZCByZWFkeSBhbmQgTEswMSByZXNwZWN0aXZlbHkuXG4vLyAgICAgUHMgPSA1IDMgIC0+IFJlcG9ydCBMb2NhdG9yIHN0YXR1cyBhc1xuLy8gICBDU0kgPyA1IDMgIG4gIExvY2F0b3IgYXZhaWxhYmxlLCBpZiBjb21waWxlZC1pbiwgb3Jcbi8vICAgQ1NJID8gNSAwICBuICBObyBMb2NhdG9yLCBpZiBub3QuXG5UZXJtaW5hbC5wcm90b3R5cGUuZGV2aWNlU3RhdHVzID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gIGlmICghdGhpcy5wcmVmaXgpIHtcbiAgICBzd2l0Y2ggKHBhcmFtc1swXSkge1xuICAgICAgY2FzZSA1OlxuICAgICAgICAvLyBzdGF0dXMgcmVwb3J0XG4gICAgICAgIHRoaXMuc2VuZCgnXFx4MWJbMG4nKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDY6XG4gICAgICAgIC8vIGN1cnNvciBwb3NpdGlvblxuICAgICAgICB0aGlzLnNlbmQoJ1xceDFiWydcbiAgICAgICAgICArICh0aGlzLnkgKyAxKVxuICAgICAgICAgICsgJzsnXG4gICAgICAgICAgKyAodGhpcy54ICsgMSlcbiAgICAgICAgICArICdSJyk7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgfSBlbHNlIGlmICh0aGlzLnByZWZpeCA9PT0gJz8nKSB7XG4gICAgLy8gbW9kZXJuIHh0ZXJtIGRvZXNudCBzZWVtIHRvXG4gICAgLy8gcmVzcG9uZCB0byBhbnkgb2YgdGhlc2UgZXhjZXB0ID82LCA2LCBhbmQgNVxuICAgIHN3aXRjaCAocGFyYW1zWzBdKSB7XG4gICAgICBjYXNlIDY6XG4gICAgICAgIC8vIGN1cnNvciBwb3NpdGlvblxuICAgICAgICB0aGlzLnNlbmQoJ1xceDFiWz8nXG4gICAgICAgICAgKyAodGhpcy55ICsgMSlcbiAgICAgICAgICArICc7J1xuICAgICAgICAgICsgKHRoaXMueCArIDEpXG4gICAgICAgICAgKyAnUicpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMTU6XG4gICAgICAgIC8vIG5vIHByaW50ZXJcbiAgICAgICAgLy8gdGhpcy5zZW5kKCdcXHgxYls/MTFuJyk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAyNTpcbiAgICAgICAgLy8gZG9udCBzdXBwb3J0IHVzZXIgZGVmaW5lZCBrZXlzXG4gICAgICAgIC8vIHRoaXMuc2VuZCgnXFx4MWJbPzIxbicpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMjY6XG4gICAgICAgIC8vIG5vcnRoIGFtZXJpY2FuIGtleWJvYXJkXG4gICAgICAgIC8vIHRoaXMuc2VuZCgnXFx4MWJbPzI3OzE7MDswbicpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgNTM6XG4gICAgICAgIC8vIG5vIGRlYyBsb2NhdG9yL21vdXNlXG4gICAgICAgIC8vIHRoaXMuc2VuZCgnXFx4MWJbPzUwbicpO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gIH1cbn07XG5cbi8qKlxuICogQWRkaXRpb25zXG4gKi9cblxuLy8gQ1NJIFBzIEBcbi8vIEluc2VydCBQcyAoQmxhbmspIENoYXJhY3RlcihzKSAoZGVmYXVsdCA9IDEpIChJQ0gpLlxuVGVybWluYWwucHJvdG90eXBlLmluc2VydENoYXJzID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gIHZhciBwYXJhbSwgcm93LCBqLCBjaDtcblxuICBwYXJhbSA9IHBhcmFtc1swXTtcbiAgaWYgKHBhcmFtIDwgMSkgcGFyYW0gPSAxO1xuXG4gIHJvdyA9IHRoaXMueSArIHRoaXMueWJhc2U7XG4gIGogPSB0aGlzLng7XG4gIGNoID0gW3RoaXMuZXJhc2VBdHRyKCksICcgJ107IC8vIHh0ZXJtXG5cbiAgd2hpbGUgKHBhcmFtLS0gJiYgaiA8IHRoaXMuY29scykge1xuICAgIHRoaXMubGluZXNbcm93XS5zcGxpY2UoaisrLCAwLCBjaCk7XG4gICAgdGhpcy5saW5lc1tyb3ddLnBvcCgpO1xuICB9XG59O1xuXG4vLyBDU0kgUHMgRVxuLy8gQ3Vyc29yIE5leHQgTGluZSBQcyBUaW1lcyAoZGVmYXVsdCA9IDEpIChDTkwpLlxuLy8gc2FtZSBhcyBDU0kgUHMgQiA/XG5UZXJtaW5hbC5wcm90b3R5cGUuY3Vyc29yTmV4dExpbmUgPSBmdW5jdGlvbihwYXJhbXMpIHtcbiAgdmFyIHBhcmFtID0gcGFyYW1zWzBdO1xuICBpZiAocGFyYW0gPCAxKSBwYXJhbSA9IDE7XG4gIHRoaXMueSArPSBwYXJhbTtcbiAgaWYgKHRoaXMueSA+PSB0aGlzLnJvd3MpIHtcbiAgICB0aGlzLnkgPSB0aGlzLnJvd3MgLSAxO1xuICB9XG4gIHRoaXMueCA9IDA7XG59O1xuXG4vLyBDU0kgUHMgRlxuLy8gQ3Vyc29yIFByZWNlZGluZyBMaW5lIFBzIFRpbWVzIChkZWZhdWx0ID0gMSkgKENOTCkuXG4vLyByZXVzZSBDU0kgUHMgQSA/XG5UZXJtaW5hbC5wcm90b3R5cGUuY3Vyc29yUHJlY2VkaW5nTGluZSA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICB2YXIgcGFyYW0gPSBwYXJhbXNbMF07XG4gIGlmIChwYXJhbSA8IDEpIHBhcmFtID0gMTtcbiAgdGhpcy55IC09IHBhcmFtO1xuICBpZiAodGhpcy55IDwgMCkgdGhpcy55ID0gMDtcbiAgdGhpcy54ID0gMDtcbn07XG5cbi8vIENTSSBQcyBHXG4vLyBDdXJzb3IgQ2hhcmFjdGVyIEFic29sdXRlICBbY29sdW1uXSAoZGVmYXVsdCA9IFtyb3csMV0pIChDSEEpLlxuVGVybWluYWwucHJvdG90eXBlLmN1cnNvckNoYXJBYnNvbHV0ZSA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICB2YXIgcGFyYW0gPSBwYXJhbXNbMF07XG4gIGlmIChwYXJhbSA8IDEpIHBhcmFtID0gMTtcbiAgdGhpcy54ID0gcGFyYW0gLSAxO1xufTtcblxuLy8gQ1NJIFBzIExcbi8vIEluc2VydCBQcyBMaW5lKHMpIChkZWZhdWx0ID0gMSkgKElMKS5cblRlcm1pbmFsLnByb3RvdHlwZS5pbnNlcnRMaW5lcyA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICB2YXIgcGFyYW0sIHJvdywgajtcblxuICBwYXJhbSA9IHBhcmFtc1swXTtcbiAgaWYgKHBhcmFtIDwgMSkgcGFyYW0gPSAxO1xuICByb3cgPSB0aGlzLnkgKyB0aGlzLnliYXNlO1xuXG4gIGogPSB0aGlzLnJvd3MgLSAxIC0gdGhpcy5zY3JvbGxCb3R0b207XG4gIGogPSB0aGlzLnJvd3MgLSAxICsgdGhpcy55YmFzZSAtIGogKyAxO1xuXG4gIHdoaWxlIChwYXJhbS0tKSB7XG4gICAgLy8gdGVzdDogZWNobyAtZSAnXFxlWzQ0bVxcZVsxTFxcZVswbSdcbiAgICAvLyBibGFua0xpbmUodHJ1ZSkgLSB4dGVybS9saW51eCBiZWhhdmlvclxuICAgIHRoaXMubGluZXMuc3BsaWNlKHJvdywgMCwgdGhpcy5ibGFua0xpbmUodHJ1ZSkpO1xuICAgIHRoaXMubGluZXMuc3BsaWNlKGosIDEpO1xuICB9XG5cbiAgLy8gdGhpcy5tYXhSYW5nZSgpO1xuICB0aGlzLnVwZGF0ZVJhbmdlKHRoaXMueSk7XG4gIHRoaXMudXBkYXRlUmFuZ2UodGhpcy5zY3JvbGxCb3R0b20pO1xufTtcblxuLy8gQ1NJIFBzIE1cbi8vIERlbGV0ZSBQcyBMaW5lKHMpIChkZWZhdWx0ID0gMSkgKERMKS5cblRlcm1pbmFsLnByb3RvdHlwZS5kZWxldGVMaW5lcyA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICB2YXIgcGFyYW0sIHJvdywgajtcblxuICBwYXJhbSA9IHBhcmFtc1swXTtcbiAgaWYgKHBhcmFtIDwgMSkgcGFyYW0gPSAxO1xuICByb3cgPSB0aGlzLnkgKyB0aGlzLnliYXNlO1xuXG4gIGogPSB0aGlzLnJvd3MgLSAxIC0gdGhpcy5zY3JvbGxCb3R0b207XG4gIGogPSB0aGlzLnJvd3MgLSAxICsgdGhpcy55YmFzZSAtIGo7XG5cbiAgd2hpbGUgKHBhcmFtLS0pIHtcbiAgICAvLyB0ZXN0OiBlY2hvIC1lICdcXGVbNDRtXFxlWzFNXFxlWzBtJ1xuICAgIC8vIGJsYW5rTGluZSh0cnVlKSAtIHh0ZXJtL2xpbnV4IGJlaGF2aW9yXG4gICAgdGhpcy5saW5lcy5zcGxpY2UoaiArIDEsIDAsIHRoaXMuYmxhbmtMaW5lKHRydWUpKTtcbiAgICB0aGlzLmxpbmVzLnNwbGljZShyb3csIDEpO1xuICB9XG5cbiAgLy8gdGhpcy5tYXhSYW5nZSgpO1xuICB0aGlzLnVwZGF0ZVJhbmdlKHRoaXMueSk7XG4gIHRoaXMudXBkYXRlUmFuZ2UodGhpcy5zY3JvbGxCb3R0b20pO1xufTtcblxuLy8gQ1NJIFBzIFBcbi8vIERlbGV0ZSBQcyBDaGFyYWN0ZXIocykgKGRlZmF1bHQgPSAxKSAoRENIKS5cblRlcm1pbmFsLnByb3RvdHlwZS5kZWxldGVDaGFycyA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICB2YXIgcGFyYW0sIHJvdywgY2g7XG5cbiAgcGFyYW0gPSBwYXJhbXNbMF07XG4gIGlmIChwYXJhbSA8IDEpIHBhcmFtID0gMTtcblxuICByb3cgPSB0aGlzLnkgKyB0aGlzLnliYXNlO1xuICBjaCA9IFt0aGlzLmVyYXNlQXR0cigpLCAnICddOyAvLyB4dGVybVxuXG4gIHdoaWxlIChwYXJhbS0tKSB7XG4gICAgdGhpcy5saW5lc1tyb3ddLnNwbGljZSh0aGlzLngsIDEpO1xuICAgIHRoaXMubGluZXNbcm93XS5wdXNoKGNoKTtcbiAgfVxufTtcblxuLy8gQ1NJIFBzIFhcbi8vIEVyYXNlIFBzIENoYXJhY3RlcihzKSAoZGVmYXVsdCA9IDEpIChFQ0gpLlxuVGVybWluYWwucHJvdG90eXBlLmVyYXNlQ2hhcnMgPSBmdW5jdGlvbihwYXJhbXMpIHtcbiAgdmFyIHBhcmFtLCByb3csIGosIGNoO1xuXG4gIHBhcmFtID0gcGFyYW1zWzBdO1xuICBpZiAocGFyYW0gPCAxKSBwYXJhbSA9IDE7XG5cbiAgcm93ID0gdGhpcy55ICsgdGhpcy55YmFzZTtcbiAgaiA9IHRoaXMueDtcbiAgY2ggPSBbdGhpcy5lcmFzZUF0dHIoKSwgJyAnXTsgLy8geHRlcm1cblxuICB3aGlsZSAocGFyYW0tLSAmJiBqIDwgdGhpcy5jb2xzKSB7XG4gICAgdGhpcy5saW5lc1tyb3ddW2orK10gPSBjaDtcbiAgfVxufTtcblxuLy8gQ1NJIFBtIGAgIENoYXJhY3RlciBQb3NpdGlvbiBBYnNvbHV0ZVxuLy8gICBbY29sdW1uXSAoZGVmYXVsdCA9IFtyb3csMV0pIChIUEEpLlxuVGVybWluYWwucHJvdG90eXBlLmNoYXJQb3NBYnNvbHV0ZSA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICB2YXIgcGFyYW0gPSBwYXJhbXNbMF07XG4gIGlmIChwYXJhbSA8IDEpIHBhcmFtID0gMTtcbiAgdGhpcy54ID0gcGFyYW0gLSAxO1xuICBpZiAodGhpcy54ID49IHRoaXMuY29scykge1xuICAgIHRoaXMueCA9IHRoaXMuY29scyAtIDE7XG4gIH1cbn07XG5cbi8vIDE0MSA2MSBhICogSFBSIC1cbi8vIEhvcml6b250YWwgUG9zaXRpb24gUmVsYXRpdmVcbi8vIHJldXNlIENTSSBQcyBDID9cblRlcm1pbmFsLnByb3RvdHlwZS5IUG9zaXRpb25SZWxhdGl2ZSA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICB2YXIgcGFyYW0gPSBwYXJhbXNbMF07XG4gIGlmIChwYXJhbSA8IDEpIHBhcmFtID0gMTtcbiAgdGhpcy54ICs9IHBhcmFtO1xuICBpZiAodGhpcy54ID49IHRoaXMuY29scykge1xuICAgIHRoaXMueCA9IHRoaXMuY29scyAtIDE7XG4gIH1cbn07XG5cbi8vIENTSSBQcyBjICBTZW5kIERldmljZSBBdHRyaWJ1dGVzIChQcmltYXJ5IERBKS5cbi8vICAgICBQcyA9IDAgIG9yIG9taXR0ZWQgLT4gcmVxdWVzdCBhdHRyaWJ1dGVzIGZyb20gdGVybWluYWwuICBUaGVcbi8vICAgICByZXNwb25zZSBkZXBlbmRzIG9uIHRoZSBkZWNUZXJtaW5hbElEIHJlc291cmNlIHNldHRpbmcuXG4vLyAgICAgLT4gQ1NJID8gMSA7IDIgYyAgKGBgVlQxMDAgd2l0aCBBZHZhbmNlZCBWaWRlbyBPcHRpb24nJylcbi8vICAgICAtPiBDU0kgPyAxIDsgMCBjICAoYGBWVDEwMSB3aXRoIE5vIE9wdGlvbnMnJylcbi8vICAgICAtPiBDU0kgPyA2IGMgIChgYFZUMTAyJycpXG4vLyAgICAgLT4gQ1NJID8gNiAwIDsgMSA7IDIgOyA2IDsgOCA7IDkgOyAxIDUgOyBjICAoYGBWVDIyMCcnKVxuLy8gICBUaGUgVlQxMDAtc3R5bGUgcmVzcG9uc2UgcGFyYW1ldGVycyBkbyBub3QgbWVhbiBhbnl0aGluZyBieVxuLy8gICB0aGVtc2VsdmVzLiAgVlQyMjAgcGFyYW1ldGVycyBkbywgdGVsbGluZyB0aGUgaG9zdCB3aGF0IGZlYS1cbi8vICAgdHVyZXMgdGhlIHRlcm1pbmFsIHN1cHBvcnRzOlxuLy8gICAgIFBzID0gMSAgLT4gMTMyLWNvbHVtbnMuXG4vLyAgICAgUHMgPSAyICAtPiBQcmludGVyLlxuLy8gICAgIFBzID0gNiAgLT4gU2VsZWN0aXZlIGVyYXNlLlxuLy8gICAgIFBzID0gOCAgLT4gVXNlci1kZWZpbmVkIGtleXMuXG4vLyAgICAgUHMgPSA5ICAtPiBOYXRpb25hbCByZXBsYWNlbWVudCBjaGFyYWN0ZXIgc2V0cy5cbi8vICAgICBQcyA9IDEgNSAgLT4gVGVjaG5pY2FsIGNoYXJhY3RlcnMuXG4vLyAgICAgUHMgPSAyIDIgIC0+IEFOU0kgY29sb3IsIGUuZy4sIFZUNTI1LlxuLy8gICAgIFBzID0gMiA5ICAtPiBBTlNJIHRleHQgbG9jYXRvciAoaS5lLiwgREVDIExvY2F0b3IgbW9kZSkuXG4vLyBDU0kgPiBQcyBjXG4vLyAgIFNlbmQgRGV2aWNlIEF0dHJpYnV0ZXMgKFNlY29uZGFyeSBEQSkuXG4vLyAgICAgUHMgPSAwICBvciBvbWl0dGVkIC0+IHJlcXVlc3QgdGhlIHRlcm1pbmFsJ3MgaWRlbnRpZmljYXRpb25cbi8vICAgICBjb2RlLiAgVGhlIHJlc3BvbnNlIGRlcGVuZHMgb24gdGhlIGRlY1Rlcm1pbmFsSUQgcmVzb3VyY2Ugc2V0LVxuLy8gICAgIHRpbmcuICBJdCBzaG91bGQgYXBwbHkgb25seSB0byBWVDIyMCBhbmQgdXAsIGJ1dCB4dGVybSBleHRlbmRzXG4vLyAgICAgdGhpcyB0byBWVDEwMC5cbi8vICAgICAtPiBDU0kgID4gUHAgOyBQdiA7IFBjIGNcbi8vICAgd2hlcmUgUHAgZGVub3RlcyB0aGUgdGVybWluYWwgdHlwZVxuLy8gICAgIFBwID0gMCAgLT4gYGBWVDEwMCcnLlxuLy8gICAgIFBwID0gMSAgLT4gYGBWVDIyMCcnLlxuLy8gICBhbmQgUHYgaXMgdGhlIGZpcm13YXJlIHZlcnNpb24gKGZvciB4dGVybSwgdGhpcyB3YXMgb3JpZ2luYWxseVxuLy8gICB0aGUgWEZyZWU4NiBwYXRjaCBudW1iZXIsIHN0YXJ0aW5nIHdpdGggOTUpLiAgSW4gYSBERUMgdGVybWktXG4vLyAgIG5hbCwgUGMgaW5kaWNhdGVzIHRoZSBST00gY2FydHJpZGdlIHJlZ2lzdHJhdGlvbiBudW1iZXIgYW5kIGlzXG4vLyAgIGFsd2F5cyB6ZXJvLlxuLy8gTW9yZSBpbmZvcm1hdGlvbjpcbi8vICAgeHRlcm0vY2hhcnByb2MuYyAtIGxpbmUgMjAxMiwgZm9yIG1vcmUgaW5mb3JtYXRpb24uXG4vLyAgIHZpbSByZXNwb25kcyB3aXRoIF5bWz8wYyBvciBeW1s/MWMgYWZ0ZXIgdGhlIHRlcm1pbmFsJ3MgcmVzcG9uc2UgKD8pXG5UZXJtaW5hbC5wcm90b3R5cGUuc2VuZERldmljZUF0dHJpYnV0ZXMgPSBmdW5jdGlvbihwYXJhbXMpIHtcbiAgaWYgKHBhcmFtc1swXSA+IDApIHJldHVybjtcblxuICBpZiAoIXRoaXMucHJlZml4KSB7XG4gICAgaWYgKHRoaXMuaXMoJ3h0ZXJtJylcbiAgICAgICAgfHwgdGhpcy5pcygncnh2dC11bmljb2RlJylcbiAgICAgICAgfHwgdGhpcy5pcygnc2NyZWVuJykpIHtcbiAgICAgIHRoaXMuc2VuZCgnXFx4MWJbPzE7MmMnKTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuaXMoJ2xpbnV4JykpIHtcbiAgICAgIHRoaXMuc2VuZCgnXFx4MWJbPzZjJyk7XG4gICAgfVxuICB9IGVsc2UgaWYgKHRoaXMucHJlZml4ID09PSAnPicpIHtcbiAgICAvLyB4dGVybSBhbmQgdXJ4dnRcbiAgICAvLyBzZWVtIHRvIHNwaXQgdGhpc1xuICAgIC8vIG91dCBhcm91bmQgfjM3MCB0aW1lcyAoPykuXG4gICAgaWYgKHRoaXMuaXMoJ3h0ZXJtJykpIHtcbiAgICAgIHRoaXMuc2VuZCgnXFx4MWJbPjA7Mjc2OzBjJyk7XG4gICAgfSBlbHNlIGlmICh0aGlzLmlzKCdyeHZ0LXVuaWNvZGUnKSkge1xuICAgICAgdGhpcy5zZW5kKCdcXHgxYls+ODU7OTU7MGMnKTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuaXMoJ2xpbnV4JykpIHtcbiAgICAgIC8vIG5vdCBzdXBwb3J0ZWQgYnkgbGludXggY29uc29sZS5cbiAgICAgIC8vIGxpbnV4IGNvbnNvbGUgZWNob2VzIHBhcmFtZXRlcnMuXG4gICAgICB0aGlzLnNlbmQocGFyYW1zWzBdICsgJ2MnKTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuaXMoJ3NjcmVlbicpKSB7XG4gICAgICB0aGlzLnNlbmQoJ1xceDFiWz44Mzs0MDAwMzswYycpO1xuICAgIH1cbiAgfVxufTtcblxuLy8gQ1NJIFBtIGRcbi8vIExpbmUgUG9zaXRpb24gQWJzb2x1dGUgIFtyb3ddIChkZWZhdWx0ID0gWzEsY29sdW1uXSkgKFZQQSkuXG5UZXJtaW5hbC5wcm90b3R5cGUubGluZVBvc0Fic29sdXRlID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gIHZhciBwYXJhbSA9IHBhcmFtc1swXTtcbiAgaWYgKHBhcmFtIDwgMSkgcGFyYW0gPSAxO1xuICB0aGlzLnkgPSBwYXJhbSAtIDE7XG4gIGlmICh0aGlzLnkgPj0gdGhpcy5yb3dzKSB7XG4gICAgdGhpcy55ID0gdGhpcy5yb3dzIC0gMTtcbiAgfVxufTtcblxuLy8gMTQ1IDY1IGUgKiBWUFIgLSBWZXJ0aWNhbCBQb3NpdGlvbiBSZWxhdGl2ZVxuLy8gcmV1c2UgQ1NJIFBzIEIgP1xuVGVybWluYWwucHJvdG90eXBlLlZQb3NpdGlvblJlbGF0aXZlID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gIHZhciBwYXJhbSA9IHBhcmFtc1swXTtcbiAgaWYgKHBhcmFtIDwgMSkgcGFyYW0gPSAxO1xuICB0aGlzLnkgKz0gcGFyYW07XG4gIGlmICh0aGlzLnkgPj0gdGhpcy5yb3dzKSB7XG4gICAgdGhpcy55ID0gdGhpcy5yb3dzIC0gMTtcbiAgfVxufTtcblxuLy8gQ1NJIFBzIDsgUHMgZlxuLy8gICBIb3Jpem9udGFsIGFuZCBWZXJ0aWNhbCBQb3NpdGlvbiBbcm93O2NvbHVtbl0gKGRlZmF1bHQgPVxuLy8gICBbMSwxXSkgKEhWUCkuXG5UZXJtaW5hbC5wcm90b3R5cGUuSFZQb3NpdGlvbiA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICBpZiAocGFyYW1zWzBdIDwgMSkgcGFyYW1zWzBdID0gMTtcbiAgaWYgKHBhcmFtc1sxXSA8IDEpIHBhcmFtc1sxXSA9IDE7XG5cbiAgdGhpcy55ID0gcGFyYW1zWzBdIC0gMTtcbiAgaWYgKHRoaXMueSA+PSB0aGlzLnJvd3MpIHtcbiAgICB0aGlzLnkgPSB0aGlzLnJvd3MgLSAxO1xuICB9XG5cbiAgdGhpcy54ID0gcGFyYW1zWzFdIC0gMTtcbiAgaWYgKHRoaXMueCA+PSB0aGlzLmNvbHMpIHtcbiAgICB0aGlzLnggPSB0aGlzLmNvbHMgLSAxO1xuICB9XG59O1xuXG4vLyBDU0kgUG0gaCAgU2V0IE1vZGUgKFNNKS5cbi8vICAgICBQcyA9IDIgIC0+IEtleWJvYXJkIEFjdGlvbiBNb2RlIChBTSkuXG4vLyAgICAgUHMgPSA0ICAtPiBJbnNlcnQgTW9kZSAoSVJNKS5cbi8vICAgICBQcyA9IDEgMiAgLT4gU2VuZC9yZWNlaXZlIChTUk0pLlxuLy8gICAgIFBzID0gMiAwICAtPiBBdXRvbWF0aWMgTmV3bGluZSAoTE5NKS5cbi8vIENTSSA/IFBtIGhcbi8vICAgREVDIFByaXZhdGUgTW9kZSBTZXQgKERFQ1NFVCkuXG4vLyAgICAgUHMgPSAxICAtPiBBcHBsaWNhdGlvbiBDdXJzb3IgS2V5cyAoREVDQ0tNKS5cbi8vICAgICBQcyA9IDIgIC0+IERlc2lnbmF0ZSBVU0FTQ0lJIGZvciBjaGFyYWN0ZXIgc2V0cyBHMC1HM1xuLy8gICAgIChERUNBTk0pLCBhbmQgc2V0IFZUMTAwIG1vZGUuXG4vLyAgICAgUHMgPSAzICAtPiAxMzIgQ29sdW1uIE1vZGUgKERFQ0NPTE0pLlxuLy8gICAgIFBzID0gNCAgLT4gU21vb3RoIChTbG93KSBTY3JvbGwgKERFQ1NDTE0pLlxuLy8gICAgIFBzID0gNSAgLT4gUmV2ZXJzZSBWaWRlbyAoREVDU0NOTSkuXG4vLyAgICAgUHMgPSA2ICAtPiBPcmlnaW4gTW9kZSAoREVDT00pLlxuLy8gICAgIFBzID0gNyAgLT4gV3JhcGFyb3VuZCBNb2RlIChERUNBV00pLlxuLy8gICAgIFBzID0gOCAgLT4gQXV0by1yZXBlYXQgS2V5cyAoREVDQVJNKS5cbi8vICAgICBQcyA9IDkgIC0+IFNlbmQgTW91c2UgWCAmIFkgb24gYnV0dG9uIHByZXNzLiAgU2VlIHRoZSBzZWMtXG4vLyAgICAgdGlvbiBNb3VzZSBUcmFja2luZy5cbi8vICAgICBQcyA9IDEgMCAgLT4gU2hvdyB0b29sYmFyIChyeHZ0KS5cbi8vICAgICBQcyA9IDEgMiAgLT4gU3RhcnQgQmxpbmtpbmcgQ3Vyc29yIChhdHQ2MTApLlxuLy8gICAgIFBzID0gMSA4ICAtPiBQcmludCBmb3JtIGZlZWQgKERFQ1BGRikuXG4vLyAgICAgUHMgPSAxIDkgIC0+IFNldCBwcmludCBleHRlbnQgdG8gZnVsbCBzY3JlZW4gKERFQ1BFWCkuXG4vLyAgICAgUHMgPSAyIDUgIC0+IFNob3cgQ3Vyc29yIChERUNUQ0VNKS5cbi8vICAgICBQcyA9IDMgMCAgLT4gU2hvdyBzY3JvbGxiYXIgKHJ4dnQpLlxuLy8gICAgIFBzID0gMyA1ICAtPiBFbmFibGUgZm9udC1zaGlmdGluZyBmdW5jdGlvbnMgKHJ4dnQpLlxuLy8gICAgIFBzID0gMyA4ICAtPiBFbnRlciBUZWt0cm9uaXggTW9kZSAoREVDVEVLKS5cbi8vICAgICBQcyA9IDQgMCAgLT4gQWxsb3cgODAgLT4gMTMyIE1vZGUuXG4vLyAgICAgUHMgPSA0IDEgIC0+IG1vcmUoMSkgZml4IChzZWUgY3Vyc2VzIHJlc291cmNlKS5cbi8vICAgICBQcyA9IDQgMiAgLT4gRW5hYmxlIE5hdGlvbiBSZXBsYWNlbWVudCBDaGFyYWN0ZXIgc2V0cyAoREVDTi1cbi8vICAgICBSQ00pLlxuLy8gICAgIFBzID0gNCA0ICAtPiBUdXJuIE9uIE1hcmdpbiBCZWxsLlxuLy8gICAgIFBzID0gNCA1ICAtPiBSZXZlcnNlLXdyYXBhcm91bmQgTW9kZS5cbi8vICAgICBQcyA9IDQgNiAgLT4gU3RhcnQgTG9nZ2luZy4gIFRoaXMgaXMgbm9ybWFsbHkgZGlzYWJsZWQgYnkgYVxuLy8gICAgIGNvbXBpbGUtdGltZSBvcHRpb24uXG4vLyAgICAgUHMgPSA0IDcgIC0+IFVzZSBBbHRlcm5hdGUgU2NyZWVuIEJ1ZmZlci4gIChUaGlzIG1heSBiZSBkaXMtXG4vLyAgICAgYWJsZWQgYnkgdGhlIHRpdGVJbmhpYml0IHJlc291cmNlKS5cbi8vICAgICBQcyA9IDYgNiAgLT4gQXBwbGljYXRpb24ga2V5cGFkIChERUNOS00pLlxuLy8gICAgIFBzID0gNiA3ICAtPiBCYWNrYXJyb3cga2V5IHNlbmRzIGJhY2tzcGFjZSAoREVDQktNKS5cbi8vICAgICBQcyA9IDEgMCAwIDAgIC0+IFNlbmQgTW91c2UgWCAmIFkgb24gYnV0dG9uIHByZXNzIGFuZFxuLy8gICAgIHJlbGVhc2UuICBTZWUgdGhlIHNlY3Rpb24gTW91c2UgVHJhY2tpbmcuXG4vLyAgICAgUHMgPSAxIDAgMCAxICAtPiBVc2UgSGlsaXRlIE1vdXNlIFRyYWNraW5nLlxuLy8gICAgIFBzID0gMSAwIDAgMiAgLT4gVXNlIENlbGwgTW90aW9uIE1vdXNlIFRyYWNraW5nLlxuLy8gICAgIFBzID0gMSAwIDAgMyAgLT4gVXNlIEFsbCBNb3Rpb24gTW91c2UgVHJhY2tpbmcuXG4vLyAgICAgUHMgPSAxIDAgMCA0ICAtPiBTZW5kIEZvY3VzSW4vRm9jdXNPdXQgZXZlbnRzLlxuLy8gICAgIFBzID0gMSAwIDAgNSAgLT4gRW5hYmxlIEV4dGVuZGVkIE1vdXNlIE1vZGUuXG4vLyAgICAgUHMgPSAxIDAgMSAwICAtPiBTY3JvbGwgdG8gYm90dG9tIG9uIHR0eSBvdXRwdXQgKHJ4dnQpLlxuLy8gICAgIFBzID0gMSAwIDEgMSAgLT4gU2Nyb2xsIHRvIGJvdHRvbSBvbiBrZXkgcHJlc3MgKHJ4dnQpLlxuLy8gICAgIFBzID0gMSAwIDMgNCAgLT4gSW50ZXJwcmV0IFwibWV0YVwiIGtleSwgc2V0cyBlaWdodGggYml0LlxuLy8gICAgIChlbmFibGVzIHRoZSBlaWdodEJpdElucHV0IHJlc291cmNlKS5cbi8vICAgICBQcyA9IDEgMCAzIDUgIC0+IEVuYWJsZSBzcGVjaWFsIG1vZGlmaWVycyBmb3IgQWx0IGFuZCBOdW0tXG4vLyAgICAgTG9jayBrZXlzLiAgKFRoaXMgZW5hYmxlcyB0aGUgbnVtTG9jayByZXNvdXJjZSkuXG4vLyAgICAgUHMgPSAxIDAgMyA2ICAtPiBTZW5kIEVTQyAgIHdoZW4gTWV0YSBtb2RpZmllcyBhIGtleS4gIChUaGlzXG4vLyAgICAgZW5hYmxlcyB0aGUgbWV0YVNlbmRzRXNjYXBlIHJlc291cmNlKS5cbi8vICAgICBQcyA9IDEgMCAzIDcgIC0+IFNlbmQgREVMIGZyb20gdGhlIGVkaXRpbmcta2V5cGFkIERlbGV0ZVxuLy8gICAgIGtleS5cbi8vICAgICBQcyA9IDEgMCAzIDkgIC0+IFNlbmQgRVNDICB3aGVuIEFsdCBtb2RpZmllcyBhIGtleS4gIChUaGlzXG4vLyAgICAgZW5hYmxlcyB0aGUgYWx0U2VuZHNFc2NhcGUgcmVzb3VyY2UpLlxuLy8gICAgIFBzID0gMSAwIDQgMCAgLT4gS2VlcCBzZWxlY3Rpb24gZXZlbiBpZiBub3QgaGlnaGxpZ2h0ZWQuXG4vLyAgICAgKFRoaXMgZW5hYmxlcyB0aGUga2VlcFNlbGVjdGlvbiByZXNvdXJjZSkuXG4vLyAgICAgUHMgPSAxIDAgNCAxICAtPiBVc2UgdGhlIENMSVBCT0FSRCBzZWxlY3Rpb24uICAoVGhpcyBlbmFibGVzXG4vLyAgICAgdGhlIHNlbGVjdFRvQ2xpcGJvYXJkIHJlc291cmNlKS5cbi8vICAgICBQcyA9IDEgMCA0IDIgIC0+IEVuYWJsZSBVcmdlbmN5IHdpbmRvdyBtYW5hZ2VyIGhpbnQgd2hlblxuLy8gICAgIENvbnRyb2wtRyBpcyByZWNlaXZlZC4gIChUaGlzIGVuYWJsZXMgdGhlIGJlbGxJc1VyZ2VudFxuLy8gICAgIHJlc291cmNlKS5cbi8vICAgICBQcyA9IDEgMCA0IDMgIC0+IEVuYWJsZSByYWlzaW5nIG9mIHRoZSB3aW5kb3cgd2hlbiBDb250cm9sLUdcbi8vICAgICBpcyByZWNlaXZlZC4gIChlbmFibGVzIHRoZSBwb3BPbkJlbGwgcmVzb3VyY2UpLlxuLy8gICAgIFBzID0gMSAwIDQgNyAgLT4gVXNlIEFsdGVybmF0ZSBTY3JlZW4gQnVmZmVyLiAgKFRoaXMgbWF5IGJlXG4vLyAgICAgZGlzYWJsZWQgYnkgdGhlIHRpdGVJbmhpYml0IHJlc291cmNlKS5cbi8vICAgICBQcyA9IDEgMCA0IDggIC0+IFNhdmUgY3Vyc29yIGFzIGluIERFQ1NDLiAgKFRoaXMgbWF5IGJlIGRpcy1cbi8vICAgICBhYmxlZCBieSB0aGUgdGl0ZUluaGliaXQgcmVzb3VyY2UpLlxuLy8gICAgIFBzID0gMSAwIDQgOSAgLT4gU2F2ZSBjdXJzb3IgYXMgaW4gREVDU0MgYW5kIHVzZSBBbHRlcm5hdGVcbi8vICAgICBTY3JlZW4gQnVmZmVyLCBjbGVhcmluZyBpdCBmaXJzdC4gIChUaGlzIG1heSBiZSBkaXNhYmxlZCBieVxuLy8gICAgIHRoZSB0aXRlSW5oaWJpdCByZXNvdXJjZSkuICBUaGlzIGNvbWJpbmVzIHRoZSBlZmZlY3RzIG9mIHRoZSAxXG4vLyAgICAgMCA0IDcgIGFuZCAxIDAgNCA4ICBtb2Rlcy4gIFVzZSB0aGlzIHdpdGggdGVybWluZm8tYmFzZWRcbi8vICAgICBhcHBsaWNhdGlvbnMgcmF0aGVyIHRoYW4gdGhlIDQgNyAgbW9kZS5cbi8vICAgICBQcyA9IDEgMCA1IDAgIC0+IFNldCB0ZXJtaW5mby90ZXJtY2FwIGZ1bmN0aW9uLWtleSBtb2RlLlxuLy8gICAgIFBzID0gMSAwIDUgMSAgLT4gU2V0IFN1biBmdW5jdGlvbi1rZXkgbW9kZS5cbi8vICAgICBQcyA9IDEgMCA1IDIgIC0+IFNldCBIUCBmdW5jdGlvbi1rZXkgbW9kZS5cbi8vICAgICBQcyA9IDEgMCA1IDMgIC0+IFNldCBTQ08gZnVuY3Rpb24ta2V5IG1vZGUuXG4vLyAgICAgUHMgPSAxIDAgNiAwICAtPiBTZXQgbGVnYWN5IGtleWJvYXJkIGVtdWxhdGlvbiAoWDExUjYpLlxuLy8gICAgIFBzID0gMSAwIDYgMSAgLT4gU2V0IFZUMjIwIGtleWJvYXJkIGVtdWxhdGlvbi5cbi8vICAgICBQcyA9IDIgMCAwIDQgIC0+IFNldCBicmFja2V0ZWQgcGFzdGUgbW9kZS5cbi8vIE1vZGVzOlxuLy8gICBodHRwOi8vdnQxMDAubmV0L2RvY3MvdnQyMjAtcm0vY2hhcHRlcjQuaHRtbFxuVGVybWluYWwucHJvdG90eXBlLnNldE1vZGUgPSBmdW5jdGlvbihwYXJhbXMpIHtcbiAgaWYgKHR5cGVvZiBwYXJhbXMgPT09ICdvYmplY3QnKSB7XG4gICAgdmFyIGwgPSBwYXJhbXMubGVuZ3RoXG4gICAgICAsIGkgPSAwO1xuXG4gICAgZm9yICg7IGkgPCBsOyBpKyspIHtcbiAgICAgIHRoaXMuc2V0TW9kZShwYXJhbXNbaV0pO1xuICAgIH1cblxuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICghdGhpcy5wcmVmaXgpIHtcbiAgICBzd2l0Y2ggKHBhcmFtcykge1xuICAgICAgY2FzZSA0OlxuICAgICAgICB0aGlzLmluc2VydE1vZGUgPSB0cnVlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMjA6XG4gICAgICAgIC8vdGhpcy5jb252ZXJ0RW9sID0gdHJ1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9IGVsc2UgaWYgKHRoaXMucHJlZml4ID09PSAnPycpIHtcbiAgICBzd2l0Y2ggKHBhcmFtcykge1xuICAgICAgY2FzZSAxOlxuICAgICAgICB0aGlzLmFwcGxpY2F0aW9uQ3Vyc29yID0gdHJ1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDI6XG4gICAgICAgIHRoaXMuc2V0Z0NoYXJzZXQoMCwgVGVybWluYWwuY2hhcnNldHMuVVMpO1xuICAgICAgICB0aGlzLnNldGdDaGFyc2V0KDEsIFRlcm1pbmFsLmNoYXJzZXRzLlVTKTtcbiAgICAgICAgdGhpcy5zZXRnQ2hhcnNldCgyLCBUZXJtaW5hbC5jaGFyc2V0cy5VUyk7XG4gICAgICAgIHRoaXMuc2V0Z0NoYXJzZXQoMywgVGVybWluYWwuY2hhcnNldHMuVVMpO1xuICAgICAgICAvLyBzZXQgVlQxMDAgbW9kZSBoZXJlXG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAzOiAvLyAxMzIgY29sIG1vZGVcbiAgICAgICAgdGhpcy5zYXZlZENvbHMgPSB0aGlzLmNvbHM7XG4gICAgICAgIHRoaXMucmVzaXplKDEzMiwgdGhpcy5yb3dzKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDY6XG4gICAgICAgIHRoaXMub3JpZ2luTW9kZSA9IHRydWU7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSA3OlxuICAgICAgICB0aGlzLndyYXBhcm91bmRNb2RlID0gdHJ1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDEyOlxuICAgICAgICAvLyB0aGlzLmN1cnNvckJsaW5rID0gdHJ1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDY2OlxuICAgICAgICB0aGlzLmxvZygnU2VyaWFsIHBvcnQgcmVxdWVzdGVkIGFwcGxpY2F0aW9uIGtleXBhZC4nKTtcbiAgICAgICAgdGhpcy5hcHBsaWNhdGlvbktleXBhZCA9IHRydWU7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSA5OiAvLyBYMTAgTW91c2VcbiAgICAgICAgLy8gbm8gcmVsZWFzZSwgbm8gbW90aW9uLCBubyB3aGVlbCwgbm8gbW9kaWZpZXJzLlxuICAgICAgY2FzZSAxMDAwOiAvLyB2dDIwMCBtb3VzZVxuICAgICAgICAvLyBubyBtb3Rpb24uXG4gICAgICAgIC8vIG5vIG1vZGlmaWVycywgZXhjZXB0IGNvbnRyb2wgb24gdGhlIHdoZWVsLlxuICAgICAgY2FzZSAxMDAyOiAvLyBidXR0b24gZXZlbnQgbW91c2VcbiAgICAgIGNhc2UgMTAwMzogLy8gYW55IGV2ZW50IG1vdXNlXG4gICAgICAgIC8vIGFueSBldmVudCAtIHNlbmRzIG1vdGlvbiBldmVudHMsXG4gICAgICAgIC8vIGV2ZW4gaWYgdGhlcmUgaXMgbm8gYnV0dG9uIGhlbGQgZG93bi5cbiAgICAgICAgdGhpcy54MTBNb3VzZSA9IHBhcmFtcyA9PT0gOTtcbiAgICAgICAgdGhpcy52dDIwME1vdXNlID0gcGFyYW1zID09PSAxMDAwO1xuICAgICAgICB0aGlzLm5vcm1hbE1vdXNlID0gcGFyYW1zID4gMTAwMDtcbiAgICAgICAgdGhpcy5tb3VzZUV2ZW50cyA9IHRydWU7XG4gICAgICAgIHRoaXMuZWxlbWVudC5zdHlsZS5jdXJzb3IgPSAnZGVmYXVsdCc7XG4gICAgICAgIHRoaXMubG9nKCdCaW5kaW5nIHRvIG1vdXNlIGV2ZW50cy4nKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDEwMDQ6IC8vIHNlbmQgZm9jdXNpbi9mb2N1c291dCBldmVudHNcbiAgICAgICAgLy8gZm9jdXNpbjogXltbSVxuICAgICAgICAvLyBmb2N1c291dDogXltbT1xuICAgICAgICB0aGlzLnNlbmRGb2N1cyA9IHRydWU7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAxMDA1OiAvLyB1dGY4IGV4dCBtb2RlIG1vdXNlXG4gICAgICAgIHRoaXMudXRmTW91c2UgPSB0cnVlO1xuICAgICAgICAvLyBmb3Igd2lkZSB0ZXJtaW5hbHNcbiAgICAgICAgLy8gc2ltcGx5IGVuY29kZXMgbGFyZ2UgdmFsdWVzIGFzIHV0ZjggY2hhcmFjdGVyc1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMTAwNjogLy8gc2dyIGV4dCBtb2RlIG1vdXNlXG4gICAgICAgIHRoaXMuc2dyTW91c2UgPSB0cnVlO1xuICAgICAgICAvLyBmb3Igd2lkZSB0ZXJtaW5hbHNcbiAgICAgICAgLy8gZG9lcyBub3QgYWRkIDMyIHRvIGZpZWxkc1xuICAgICAgICAvLyBwcmVzczogXltbPGI7eDt5TVxuICAgICAgICAvLyByZWxlYXNlOiBeW1s8Yjt4O3ltXG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAxMDE1OiAvLyB1cnh2dCBleHQgbW9kZSBtb3VzZVxuICAgICAgICB0aGlzLnVyeHZ0TW91c2UgPSB0cnVlO1xuICAgICAgICAvLyBmb3Igd2lkZSB0ZXJtaW5hbHNcbiAgICAgICAgLy8gbnVtYmVycyBmb3IgZmllbGRzXG4gICAgICAgIC8vIHByZXNzOiBeW1tiO3g7eU1cbiAgICAgICAgLy8gbW90aW9uOiBeW1tiO3g7eVRcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDI1OiAvLyBzaG93IGN1cnNvclxuICAgICAgICB0aGlzLmN1cnNvckhpZGRlbiA9IGZhbHNlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMTA0OTogLy8gYWx0IHNjcmVlbiBidWZmZXIgY3Vyc29yXG4gICAgICAgIC8vdGhpcy5zYXZlQ3Vyc29yKCk7XG4gICAgICAgIDsgLy8gRkFMTC1USFJPVUdIXG4gICAgICBjYXNlIDQ3OiAvLyBhbHQgc2NyZWVuIGJ1ZmZlclxuICAgICAgY2FzZSAxMDQ3OiAvLyBhbHQgc2NyZWVuIGJ1ZmZlclxuICAgICAgICBpZiAoIXRoaXMubm9ybWFsKSB7XG4gICAgICAgICAgdmFyIG5vcm1hbCA9IHtcbiAgICAgICAgICAgIGxpbmVzOiB0aGlzLmxpbmVzLFxuICAgICAgICAgICAgeWJhc2U6IHRoaXMueWJhc2UsXG4gICAgICAgICAgICB5ZGlzcDogdGhpcy55ZGlzcCxcbiAgICAgICAgICAgIHg6IHRoaXMueCxcbiAgICAgICAgICAgIHk6IHRoaXMueSxcbiAgICAgICAgICAgIHNjcm9sbFRvcDogdGhpcy5zY3JvbGxUb3AsXG4gICAgICAgICAgICBzY3JvbGxCb3R0b206IHRoaXMuc2Nyb2xsQm90dG9tLFxuICAgICAgICAgICAgdGFiczogdGhpcy50YWJzXG4gICAgICAgICAgICAvLyBYWFggc2F2ZSBjaGFyc2V0KHMpIGhlcmU/XG4gICAgICAgICAgICAvLyBjaGFyc2V0OiB0aGlzLmNoYXJzZXQsXG4gICAgICAgICAgICAvLyBnbGV2ZWw6IHRoaXMuZ2xldmVsLFxuICAgICAgICAgICAgLy8gY2hhcnNldHM6IHRoaXMuY2hhcnNldHNcbiAgICAgICAgICB9O1xuICAgICAgICAgIHRoaXMucmVzZXQoKTtcbiAgICAgICAgICB0aGlzLm5vcm1hbCA9IG5vcm1hbDtcbiAgICAgICAgICB0aGlzLnNob3dDdXJzb3IoKTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICB9XG4gIH1cbn07XG5cbi8vIENTSSBQbSBsICBSZXNldCBNb2RlIChSTSkuXG4vLyAgICAgUHMgPSAyICAtPiBLZXlib2FyZCBBY3Rpb24gTW9kZSAoQU0pLlxuLy8gICAgIFBzID0gNCAgLT4gUmVwbGFjZSBNb2RlIChJUk0pLlxuLy8gICAgIFBzID0gMSAyICAtPiBTZW5kL3JlY2VpdmUgKFNSTSkuXG4vLyAgICAgUHMgPSAyIDAgIC0+IE5vcm1hbCBMaW5lZmVlZCAoTE5NKS5cbi8vIENTSSA/IFBtIGxcbi8vICAgREVDIFByaXZhdGUgTW9kZSBSZXNldCAoREVDUlNUKS5cbi8vICAgICBQcyA9IDEgIC0+IE5vcm1hbCBDdXJzb3IgS2V5cyAoREVDQ0tNKS5cbi8vICAgICBQcyA9IDIgIC0+IERlc2lnbmF0ZSBWVDUyIG1vZGUgKERFQ0FOTSkuXG4vLyAgICAgUHMgPSAzICAtPiA4MCBDb2x1bW4gTW9kZSAoREVDQ09MTSkuXG4vLyAgICAgUHMgPSA0ICAtPiBKdW1wIChGYXN0KSBTY3JvbGwgKERFQ1NDTE0pLlxuLy8gICAgIFBzID0gNSAgLT4gTm9ybWFsIFZpZGVvIChERUNTQ05NKS5cbi8vICAgICBQcyA9IDYgIC0+IE5vcm1hbCBDdXJzb3IgTW9kZSAoREVDT00pLlxuLy8gICAgIFBzID0gNyAgLT4gTm8gV3JhcGFyb3VuZCBNb2RlIChERUNBV00pLlxuLy8gICAgIFBzID0gOCAgLT4gTm8gQXV0by1yZXBlYXQgS2V5cyAoREVDQVJNKS5cbi8vICAgICBQcyA9IDkgIC0+IERvbid0IHNlbmQgTW91c2UgWCAmIFkgb24gYnV0dG9uIHByZXNzLlxuLy8gICAgIFBzID0gMSAwICAtPiBIaWRlIHRvb2xiYXIgKHJ4dnQpLlxuLy8gICAgIFBzID0gMSAyICAtPiBTdG9wIEJsaW5raW5nIEN1cnNvciAoYXR0NjEwKS5cbi8vICAgICBQcyA9IDEgOCAgLT4gRG9uJ3QgcHJpbnQgZm9ybSBmZWVkIChERUNQRkYpLlxuLy8gICAgIFBzID0gMSA5ICAtPiBMaW1pdCBwcmludCB0byBzY3JvbGxpbmcgcmVnaW9uIChERUNQRVgpLlxuLy8gICAgIFBzID0gMiA1ICAtPiBIaWRlIEN1cnNvciAoREVDVENFTSkuXG4vLyAgICAgUHMgPSAzIDAgIC0+IERvbid0IHNob3cgc2Nyb2xsYmFyIChyeHZ0KS5cbi8vICAgICBQcyA9IDMgNSAgLT4gRGlzYWJsZSBmb250LXNoaWZ0aW5nIGZ1bmN0aW9ucyAocnh2dCkuXG4vLyAgICAgUHMgPSA0IDAgIC0+IERpc2FsbG93IDgwIC0+IDEzMiBNb2RlLlxuLy8gICAgIFBzID0gNCAxICAtPiBObyBtb3JlKDEpIGZpeCAoc2VlIGN1cnNlcyByZXNvdXJjZSkuXG4vLyAgICAgUHMgPSA0IDIgIC0+IERpc2FibGUgTmF0aW9uIFJlcGxhY2VtZW50IENoYXJhY3RlciBzZXRzIChERUMtXG4vLyAgICAgTlJDTSkuXG4vLyAgICAgUHMgPSA0IDQgIC0+IFR1cm4gT2ZmIE1hcmdpbiBCZWxsLlxuLy8gICAgIFBzID0gNCA1ICAtPiBObyBSZXZlcnNlLXdyYXBhcm91bmQgTW9kZS5cbi8vICAgICBQcyA9IDQgNiAgLT4gU3RvcCBMb2dnaW5nLiAgKFRoaXMgaXMgbm9ybWFsbHkgZGlzYWJsZWQgYnkgYVxuLy8gICAgIGNvbXBpbGUtdGltZSBvcHRpb24pLlxuLy8gICAgIFBzID0gNCA3ICAtPiBVc2UgTm9ybWFsIFNjcmVlbiBCdWZmZXIuXG4vLyAgICAgUHMgPSA2IDYgIC0+IE51bWVyaWMga2V5cGFkIChERUNOS00pLlxuLy8gICAgIFBzID0gNiA3ICAtPiBCYWNrYXJyb3cga2V5IHNlbmRzIGRlbGV0ZSAoREVDQktNKS5cbi8vICAgICBQcyA9IDEgMCAwIDAgIC0+IERvbid0IHNlbmQgTW91c2UgWCAmIFkgb24gYnV0dG9uIHByZXNzIGFuZFxuLy8gICAgIHJlbGVhc2UuICBTZWUgdGhlIHNlY3Rpb24gTW91c2UgVHJhY2tpbmcuXG4vLyAgICAgUHMgPSAxIDAgMCAxICAtPiBEb24ndCB1c2UgSGlsaXRlIE1vdXNlIFRyYWNraW5nLlxuLy8gICAgIFBzID0gMSAwIDAgMiAgLT4gRG9uJ3QgdXNlIENlbGwgTW90aW9uIE1vdXNlIFRyYWNraW5nLlxuLy8gICAgIFBzID0gMSAwIDAgMyAgLT4gRG9uJ3QgdXNlIEFsbCBNb3Rpb24gTW91c2UgVHJhY2tpbmcuXG4vLyAgICAgUHMgPSAxIDAgMCA0ICAtPiBEb24ndCBzZW5kIEZvY3VzSW4vRm9jdXNPdXQgZXZlbnRzLlxuLy8gICAgIFBzID0gMSAwIDAgNSAgLT4gRGlzYWJsZSBFeHRlbmRlZCBNb3VzZSBNb2RlLlxuLy8gICAgIFBzID0gMSAwIDEgMCAgLT4gRG9uJ3Qgc2Nyb2xsIHRvIGJvdHRvbSBvbiB0dHkgb3V0cHV0XG4vLyAgICAgKHJ4dnQpLlxuLy8gICAgIFBzID0gMSAwIDEgMSAgLT4gRG9uJ3Qgc2Nyb2xsIHRvIGJvdHRvbSBvbiBrZXkgcHJlc3MgKHJ4dnQpLlxuLy8gICAgIFBzID0gMSAwIDMgNCAgLT4gRG9uJ3QgaW50ZXJwcmV0IFwibWV0YVwiIGtleS4gIChUaGlzIGRpc2FibGVzXG4vLyAgICAgdGhlIGVpZ2h0Qml0SW5wdXQgcmVzb3VyY2UpLlxuLy8gICAgIFBzID0gMSAwIDMgNSAgLT4gRGlzYWJsZSBzcGVjaWFsIG1vZGlmaWVycyBmb3IgQWx0IGFuZCBOdW0tXG4vLyAgICAgTG9jayBrZXlzLiAgKFRoaXMgZGlzYWJsZXMgdGhlIG51bUxvY2sgcmVzb3VyY2UpLlxuLy8gICAgIFBzID0gMSAwIDMgNiAgLT4gRG9uJ3Qgc2VuZCBFU0MgIHdoZW4gTWV0YSBtb2RpZmllcyBhIGtleS5cbi8vICAgICAoVGhpcyBkaXNhYmxlcyB0aGUgbWV0YVNlbmRzRXNjYXBlIHJlc291cmNlKS5cbi8vICAgICBQcyA9IDEgMCAzIDcgIC0+IFNlbmQgVlQyMjAgUmVtb3ZlIGZyb20gdGhlIGVkaXRpbmcta2V5cGFkXG4vLyAgICAgRGVsZXRlIGtleS5cbi8vICAgICBQcyA9IDEgMCAzIDkgIC0+IERvbid0IHNlbmQgRVNDICB3aGVuIEFsdCBtb2RpZmllcyBhIGtleS5cbi8vICAgICAoVGhpcyBkaXNhYmxlcyB0aGUgYWx0U2VuZHNFc2NhcGUgcmVzb3VyY2UpLlxuLy8gICAgIFBzID0gMSAwIDQgMCAgLT4gRG8gbm90IGtlZXAgc2VsZWN0aW9uIHdoZW4gbm90IGhpZ2hsaWdodGVkLlxuLy8gICAgIChUaGlzIGRpc2FibGVzIHRoZSBrZWVwU2VsZWN0aW9uIHJlc291cmNlKS5cbi8vICAgICBQcyA9IDEgMCA0IDEgIC0+IFVzZSB0aGUgUFJJTUFSWSBzZWxlY3Rpb24uICAoVGhpcyBkaXNhYmxlc1xuLy8gICAgIHRoZSBzZWxlY3RUb0NsaXBib2FyZCByZXNvdXJjZSkuXG4vLyAgICAgUHMgPSAxIDAgNCAyICAtPiBEaXNhYmxlIFVyZ2VuY3kgd2luZG93IG1hbmFnZXIgaGludCB3aGVuXG4vLyAgICAgQ29udHJvbC1HIGlzIHJlY2VpdmVkLiAgKFRoaXMgZGlzYWJsZXMgdGhlIGJlbGxJc1VyZ2VudFxuLy8gICAgIHJlc291cmNlKS5cbi8vICAgICBQcyA9IDEgMCA0IDMgIC0+IERpc2FibGUgcmFpc2luZyBvZiB0aGUgd2luZG93IHdoZW4gQ29udHJvbC1cbi8vICAgICBHIGlzIHJlY2VpdmVkLiAgKFRoaXMgZGlzYWJsZXMgdGhlIHBvcE9uQmVsbCByZXNvdXJjZSkuXG4vLyAgICAgUHMgPSAxIDAgNCA3ICAtPiBVc2UgTm9ybWFsIFNjcmVlbiBCdWZmZXIsIGNsZWFyaW5nIHNjcmVlblxuLy8gICAgIGZpcnN0IGlmIGluIHRoZSBBbHRlcm5hdGUgU2NyZWVuLiAgKFRoaXMgbWF5IGJlIGRpc2FibGVkIGJ5XG4vLyAgICAgdGhlIHRpdGVJbmhpYml0IHJlc291cmNlKS5cbi8vICAgICBQcyA9IDEgMCA0IDggIC0+IFJlc3RvcmUgY3Vyc29yIGFzIGluIERFQ1JDLiAgKFRoaXMgbWF5IGJlXG4vLyAgICAgZGlzYWJsZWQgYnkgdGhlIHRpdGVJbmhpYml0IHJlc291cmNlKS5cbi8vICAgICBQcyA9IDEgMCA0IDkgIC0+IFVzZSBOb3JtYWwgU2NyZWVuIEJ1ZmZlciBhbmQgcmVzdG9yZSBjdXJzb3Jcbi8vICAgICBhcyBpbiBERUNSQy4gIChUaGlzIG1heSBiZSBkaXNhYmxlZCBieSB0aGUgdGl0ZUluaGliaXRcbi8vICAgICByZXNvdXJjZSkuICBUaGlzIGNvbWJpbmVzIHRoZSBlZmZlY3RzIG9mIHRoZSAxIDAgNCA3ICBhbmQgMSAwXG4vLyAgICAgNCA4ICBtb2Rlcy4gIFVzZSB0aGlzIHdpdGggdGVybWluZm8tYmFzZWQgYXBwbGljYXRpb25zIHJhdGhlclxuLy8gICAgIHRoYW4gdGhlIDQgNyAgbW9kZS5cbi8vICAgICBQcyA9IDEgMCA1IDAgIC0+IFJlc2V0IHRlcm1pbmZvL3Rlcm1jYXAgZnVuY3Rpb24ta2V5IG1vZGUuXG4vLyAgICAgUHMgPSAxIDAgNSAxICAtPiBSZXNldCBTdW4gZnVuY3Rpb24ta2V5IG1vZGUuXG4vLyAgICAgUHMgPSAxIDAgNSAyICAtPiBSZXNldCBIUCBmdW5jdGlvbi1rZXkgbW9kZS5cbi8vICAgICBQcyA9IDEgMCA1IDMgIC0+IFJlc2V0IFNDTyBmdW5jdGlvbi1rZXkgbW9kZS5cbi8vICAgICBQcyA9IDEgMCA2IDAgIC0+IFJlc2V0IGxlZ2FjeSBrZXlib2FyZCBlbXVsYXRpb24gKFgxMVI2KS5cbi8vICAgICBQcyA9IDEgMCA2IDEgIC0+IFJlc2V0IGtleWJvYXJkIGVtdWxhdGlvbiB0byBTdW4vUEMgc3R5bGUuXG4vLyAgICAgUHMgPSAyIDAgMCA0ICAtPiBSZXNldCBicmFja2V0ZWQgcGFzdGUgbW9kZS5cblRlcm1pbmFsLnByb3RvdHlwZS5yZXNldE1vZGUgPSBmdW5jdGlvbihwYXJhbXMpIHtcbiAgaWYgKHR5cGVvZiBwYXJhbXMgPT09ICdvYmplY3QnKSB7XG4gICAgdmFyIGwgPSBwYXJhbXMubGVuZ3RoXG4gICAgICAsIGkgPSAwO1xuXG4gICAgZm9yICg7IGkgPCBsOyBpKyspIHtcbiAgICAgIHRoaXMucmVzZXRNb2RlKHBhcmFtc1tpXSk7XG4gICAgfVxuXG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCF0aGlzLnByZWZpeCkge1xuICAgIHN3aXRjaCAocGFyYW1zKSB7XG4gICAgICBjYXNlIDQ6XG4gICAgICAgIHRoaXMuaW5zZXJ0TW9kZSA9IGZhbHNlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMjA6XG4gICAgICAgIC8vdGhpcy5jb252ZXJ0RW9sID0gZmFsc2U7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgfSBlbHNlIGlmICh0aGlzLnByZWZpeCA9PT0gJz8nKSB7XG4gICAgc3dpdGNoIChwYXJhbXMpIHtcbiAgICAgIGNhc2UgMTpcbiAgICAgICAgdGhpcy5hcHBsaWNhdGlvbkN1cnNvciA9IGZhbHNlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMzpcbiAgICAgICAgaWYgKHRoaXMuY29scyA9PT0gMTMyICYmIHRoaXMuc2F2ZWRDb2xzKSB7XG4gICAgICAgICAgdGhpcy5yZXNpemUodGhpcy5zYXZlZENvbHMsIHRoaXMucm93cyk7XG4gICAgICAgIH1cbiAgICAgICAgZGVsZXRlIHRoaXMuc2F2ZWRDb2xzO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgNjpcbiAgICAgICAgdGhpcy5vcmlnaW5Nb2RlID0gZmFsc2U7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSA3OlxuICAgICAgICB0aGlzLndyYXBhcm91bmRNb2RlID0gZmFsc2U7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAxMjpcbiAgICAgICAgLy8gdGhpcy5jdXJzb3JCbGluayA9IGZhbHNlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgNjY6XG4gICAgICAgIHRoaXMubG9nKCdTd2l0Y2hpbmcgYmFjayB0byBub3JtYWwga2V5cGFkLicpO1xuICAgICAgICB0aGlzLmFwcGxpY2F0aW9uS2V5cGFkID0gZmFsc2U7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSA5OiAvLyBYMTAgTW91c2VcbiAgICAgIGNhc2UgMTAwMDogLy8gdnQyMDAgbW91c2VcbiAgICAgIGNhc2UgMTAwMjogLy8gYnV0dG9uIGV2ZW50IG1vdXNlXG4gICAgICBjYXNlIDEwMDM6IC8vIGFueSBldmVudCBtb3VzZVxuICAgICAgICB0aGlzLngxME1vdXNlID0gZmFsc2U7XG4gICAgICAgIHRoaXMudnQyMDBNb3VzZSA9IGZhbHNlO1xuICAgICAgICB0aGlzLm5vcm1hbE1vdXNlID0gZmFsc2U7XG4gICAgICAgIHRoaXMubW91c2VFdmVudHMgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5lbGVtZW50LnN0eWxlLmN1cnNvciA9ICcnO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMTAwNDogLy8gc2VuZCBmb2N1c2luL2ZvY3Vzb3V0IGV2ZW50c1xuICAgICAgICB0aGlzLnNlbmRGb2N1cyA9IGZhbHNlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMTAwNTogLy8gdXRmOCBleHQgbW9kZSBtb3VzZVxuICAgICAgICB0aGlzLnV0Zk1vdXNlID0gZmFsc2U7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAxMDA2OiAvLyBzZ3IgZXh0IG1vZGUgbW91c2VcbiAgICAgICAgdGhpcy5zZ3JNb3VzZSA9IGZhbHNlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMTAxNTogLy8gdXJ4dnQgZXh0IG1vZGUgbW91c2VcbiAgICAgICAgdGhpcy51cnh2dE1vdXNlID0gZmFsc2U7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAyNTogLy8gaGlkZSBjdXJzb3JcbiAgICAgICAgdGhpcy5jdXJzb3JIaWRkZW4gPSB0cnVlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMTA0OTogLy8gYWx0IHNjcmVlbiBidWZmZXIgY3Vyc29yXG4gICAgICAgIDsgLy8gRkFMTC1USFJPVUdIXG4gICAgICBjYXNlIDQ3OiAvLyBub3JtYWwgc2NyZWVuIGJ1ZmZlclxuICAgICAgY2FzZSAxMDQ3OiAvLyBub3JtYWwgc2NyZWVuIGJ1ZmZlciAtIGNsZWFyaW5nIGl0IGZpcnN0XG4gICAgICAgIGlmICh0aGlzLm5vcm1hbCkge1xuICAgICAgICAgIHRoaXMubGluZXMgPSB0aGlzLm5vcm1hbC5saW5lcztcbiAgICAgICAgICB0aGlzLnliYXNlID0gdGhpcy5ub3JtYWwueWJhc2U7XG4gICAgICAgICAgdGhpcy55ZGlzcCA9IHRoaXMubm9ybWFsLnlkaXNwO1xuICAgICAgICAgIHRoaXMueCA9IHRoaXMubm9ybWFsLng7XG4gICAgICAgICAgdGhpcy55ID0gdGhpcy5ub3JtYWwueTtcbiAgICAgICAgICB0aGlzLnNjcm9sbFRvcCA9IHRoaXMubm9ybWFsLnNjcm9sbFRvcDtcbiAgICAgICAgICB0aGlzLnNjcm9sbEJvdHRvbSA9IHRoaXMubm9ybWFsLnNjcm9sbEJvdHRvbTtcbiAgICAgICAgICB0aGlzLnRhYnMgPSB0aGlzLm5vcm1hbC50YWJzO1xuICAgICAgICAgIHRoaXMubm9ybWFsID0gbnVsbDtcbiAgICAgICAgICAvLyBpZiAocGFyYW1zID09PSAxMDQ5KSB7XG4gICAgICAgICAgLy8gICB0aGlzLnggPSB0aGlzLnNhdmVkWDtcbiAgICAgICAgICAvLyAgIHRoaXMueSA9IHRoaXMuc2F2ZWRZO1xuICAgICAgICAgIC8vIH1cbiAgICAgICAgICB0aGlzLnJlZnJlc2goMCwgdGhpcy5yb3dzIC0gMSk7XG4gICAgICAgICAgdGhpcy5zaG93Q3Vyc29yKCk7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG59O1xuXG4vLyBDU0kgUHMgOyBQcyByXG4vLyAgIFNldCBTY3JvbGxpbmcgUmVnaW9uIFt0b3A7Ym90dG9tXSAoZGVmYXVsdCA9IGZ1bGwgc2l6ZSBvZiB3aW4tXG4vLyAgIGRvdykgKERFQ1NUQk0pLlxuLy8gQ1NJID8gUG0gclxuVGVybWluYWwucHJvdG90eXBlLnNldFNjcm9sbFJlZ2lvbiA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICBpZiAodGhpcy5wcmVmaXgpIHJldHVybjtcbiAgdGhpcy5zY3JvbGxUb3AgPSAocGFyYW1zWzBdIHx8IDEpIC0gMTtcbiAgdGhpcy5zY3JvbGxCb3R0b20gPSAocGFyYW1zWzFdIHx8IHRoaXMucm93cykgLSAxO1xuICB0aGlzLnggPSAwO1xuICB0aGlzLnkgPSAwO1xufTtcblxuLy8gQ1NJIHNcbi8vICAgU2F2ZSBjdXJzb3IgKEFOU0kuU1lTKS5cblRlcm1pbmFsLnByb3RvdHlwZS5zYXZlQ3Vyc29yID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gIHRoaXMuc2F2ZWRYID0gdGhpcy54O1xuICB0aGlzLnNhdmVkWSA9IHRoaXMueTtcbn07XG5cbi8vIENTSSB1XG4vLyAgIFJlc3RvcmUgY3Vyc29yIChBTlNJLlNZUykuXG5UZXJtaW5hbC5wcm90b3R5cGUucmVzdG9yZUN1cnNvciA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICB0aGlzLnggPSB0aGlzLnNhdmVkWCB8fCAwO1xuICB0aGlzLnkgPSB0aGlzLnNhdmVkWSB8fCAwO1xufTtcblxuLyoqXG4gKiBMZXNzZXIgVXNlZFxuICovXG5cbi8vIENTSSBQcyBJXG4vLyAgIEN1cnNvciBGb3J3YXJkIFRhYnVsYXRpb24gUHMgdGFiIHN0b3BzIChkZWZhdWx0ID0gMSkgKENIVCkuXG5UZXJtaW5hbC5wcm90b3R5cGUuY3Vyc29yRm9yd2FyZFRhYiA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICB2YXIgcGFyYW0gPSBwYXJhbXNbMF0gfHwgMTtcbiAgd2hpbGUgKHBhcmFtLS0pIHtcbiAgICB0aGlzLnggPSB0aGlzLm5leHRTdG9wKCk7XG4gIH1cbn07XG5cbi8vIENTSSBQcyBTICBTY3JvbGwgdXAgUHMgbGluZXMgKGRlZmF1bHQgPSAxKSAoU1UpLlxuVGVybWluYWwucHJvdG90eXBlLnNjcm9sbFVwID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gIHZhciBwYXJhbSA9IHBhcmFtc1swXSB8fCAxO1xuICB3aGlsZSAocGFyYW0tLSkge1xuICAgIHRoaXMubGluZXMuc3BsaWNlKHRoaXMueWJhc2UgKyB0aGlzLnNjcm9sbFRvcCwgMSk7XG4gICAgdGhpcy5saW5lcy5zcGxpY2UodGhpcy55YmFzZSArIHRoaXMuc2Nyb2xsQm90dG9tLCAwLCB0aGlzLmJsYW5rTGluZSgpKTtcbiAgfVxuICAvLyB0aGlzLm1heFJhbmdlKCk7XG4gIHRoaXMudXBkYXRlUmFuZ2UodGhpcy5zY3JvbGxUb3ApO1xuICB0aGlzLnVwZGF0ZVJhbmdlKHRoaXMuc2Nyb2xsQm90dG9tKTtcbn07XG5cbi8vIENTSSBQcyBUICBTY3JvbGwgZG93biBQcyBsaW5lcyAoZGVmYXVsdCA9IDEpIChTRCkuXG5UZXJtaW5hbC5wcm90b3R5cGUuc2Nyb2xsRG93biA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICB2YXIgcGFyYW0gPSBwYXJhbXNbMF0gfHwgMTtcbiAgd2hpbGUgKHBhcmFtLS0pIHtcbiAgICB0aGlzLmxpbmVzLnNwbGljZSh0aGlzLnliYXNlICsgdGhpcy5zY3JvbGxCb3R0b20sIDEpO1xuICAgIHRoaXMubGluZXMuc3BsaWNlKHRoaXMueWJhc2UgKyB0aGlzLnNjcm9sbFRvcCwgMCwgdGhpcy5ibGFua0xpbmUoKSk7XG4gIH1cbiAgLy8gdGhpcy5tYXhSYW5nZSgpO1xuICB0aGlzLnVwZGF0ZVJhbmdlKHRoaXMuc2Nyb2xsVG9wKTtcbiAgdGhpcy51cGRhdGVSYW5nZSh0aGlzLnNjcm9sbEJvdHRvbSk7XG59O1xuXG4vLyBDU0kgUHMgOyBQcyA7IFBzIDsgUHMgOyBQcyBUXG4vLyAgIEluaXRpYXRlIGhpZ2hsaWdodCBtb3VzZSB0cmFja2luZy4gIFBhcmFtZXRlcnMgYXJlXG4vLyAgIFtmdW5jO3N0YXJ0eDtzdGFydHk7Zmlyc3Ryb3c7bGFzdHJvd10uICBTZWUgdGhlIHNlY3Rpb24gTW91c2Vcbi8vICAgVHJhY2tpbmcuXG5UZXJtaW5hbC5wcm90b3R5cGUuaW5pdE1vdXNlVHJhY2tpbmcgPSBmdW5jdGlvbihwYXJhbXMpIHtcbiAgLy8gUmVsZXZhbnQ6IERFQ1NFVCAxMDAxXG59O1xuXG4vLyBDU0kgPiBQczsgUHMgVFxuLy8gICBSZXNldCBvbmUgb3IgbW9yZSBmZWF0dXJlcyBvZiB0aGUgdGl0bGUgbW9kZXMgdG8gdGhlIGRlZmF1bHRcbi8vICAgdmFsdWUuICBOb3JtYWxseSwgXCJyZXNldFwiIGRpc2FibGVzIHRoZSBmZWF0dXJlLiAgSXQgaXMgcG9zc2ktXG4vLyAgIGJsZSB0byBkaXNhYmxlIHRoZSBhYmlsaXR5IHRvIHJlc2V0IGZlYXR1cmVzIGJ5IGNvbXBpbGluZyBhXG4vLyAgIGRpZmZlcmVudCBkZWZhdWx0IGZvciB0aGUgdGl0bGUgbW9kZXMgaW50byB4dGVybS5cbi8vICAgICBQcyA9IDAgIC0+IERvIG5vdCBzZXQgd2luZG93L2ljb24gbGFiZWxzIHVzaW5nIGhleGFkZWNpbWFsLlxuLy8gICAgIFBzID0gMSAgLT4gRG8gbm90IHF1ZXJ5IHdpbmRvdy9pY29uIGxhYmVscyB1c2luZyBoZXhhZGVjaS1cbi8vICAgICBtYWwuXG4vLyAgICAgUHMgPSAyICAtPiBEbyBub3Qgc2V0IHdpbmRvdy9pY29uIGxhYmVscyB1c2luZyBVVEYtOC5cbi8vICAgICBQcyA9IDMgIC0+IERvIG5vdCBxdWVyeSB3aW5kb3cvaWNvbiBsYWJlbHMgdXNpbmcgVVRGLTguXG4vLyAgIChTZWUgZGlzY3Vzc2lvbiBvZiBcIlRpdGxlIE1vZGVzXCIpLlxuVGVybWluYWwucHJvdG90eXBlLnJlc2V0VGl0bGVNb2RlcyA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICA7XG59O1xuXG4vLyBDU0kgUHMgWiAgQ3Vyc29yIEJhY2t3YXJkIFRhYnVsYXRpb24gUHMgdGFiIHN0b3BzIChkZWZhdWx0ID0gMSkgKENCVCkuXG5UZXJtaW5hbC5wcm90b3R5cGUuY3Vyc29yQmFja3dhcmRUYWIgPSBmdW5jdGlvbihwYXJhbXMpIHtcbiAgdmFyIHBhcmFtID0gcGFyYW1zWzBdIHx8IDE7XG4gIHdoaWxlIChwYXJhbS0tKSB7XG4gICAgdGhpcy54ID0gdGhpcy5wcmV2U3RvcCgpO1xuICB9XG59O1xuXG4vLyBDU0kgUHMgYiAgUmVwZWF0IHRoZSBwcmVjZWRpbmcgZ3JhcGhpYyBjaGFyYWN0ZXIgUHMgdGltZXMgKFJFUCkuXG5UZXJtaW5hbC5wcm90b3R5cGUucmVwZWF0UHJlY2VkaW5nQ2hhcmFjdGVyID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gIHZhciBwYXJhbSA9IHBhcmFtc1swXSB8fCAxXG4gICAgLCBsaW5lID0gdGhpcy5saW5lc1t0aGlzLnliYXNlICsgdGhpcy55XVxuICAgICwgY2ggPSBsaW5lW3RoaXMueCAtIDFdIHx8IFt0aGlzLmRlZkF0dHIsICcgJ107XG5cbiAgd2hpbGUgKHBhcmFtLS0pIGxpbmVbdGhpcy54KytdID0gY2g7XG59O1xuXG4vLyBDU0kgUHMgZyAgVGFiIENsZWFyIChUQkMpLlxuLy8gICAgIFBzID0gMCAgLT4gQ2xlYXIgQ3VycmVudCBDb2x1bW4gKGRlZmF1bHQpLlxuLy8gICAgIFBzID0gMyAgLT4gQ2xlYXIgQWxsLlxuLy8gUG90ZW50aWFsbHk6XG4vLyAgIFBzID0gMiAgLT4gQ2xlYXIgU3RvcHMgb24gTGluZS5cbi8vICAgaHR0cDovL3Z0MTAwLm5ldC9hbm5hcmJvci9hYWEtdWcvc2VjdGlvbjYuaHRtbFxuVGVybWluYWwucHJvdG90eXBlLnRhYkNsZWFyID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gIHZhciBwYXJhbSA9IHBhcmFtc1swXTtcbiAgaWYgKHBhcmFtIDw9IDApIHtcbiAgICBkZWxldGUgdGhpcy50YWJzW3RoaXMueF07XG4gIH0gZWxzZSBpZiAocGFyYW0gPT09IDMpIHtcbiAgICB0aGlzLnRhYnMgPSB7fTtcbiAgfVxufTtcblxuLy8gQ1NJIFBtIGkgIE1lZGlhIENvcHkgKE1DKS5cbi8vICAgICBQcyA9IDAgIC0+IFByaW50IHNjcmVlbiAoZGVmYXVsdCkuXG4vLyAgICAgUHMgPSA0ICAtPiBUdXJuIG9mZiBwcmludGVyIGNvbnRyb2xsZXIgbW9kZS5cbi8vICAgICBQcyA9IDUgIC0+IFR1cm4gb24gcHJpbnRlciBjb250cm9sbGVyIG1vZGUuXG4vLyBDU0kgPyBQbSBpXG4vLyAgIE1lZGlhIENvcHkgKE1DLCBERUMtc3BlY2lmaWMpLlxuLy8gICAgIFBzID0gMSAgLT4gUHJpbnQgbGluZSBjb250YWluaW5nIGN1cnNvci5cbi8vICAgICBQcyA9IDQgIC0+IFR1cm4gb2ZmIGF1dG9wcmludCBtb2RlLlxuLy8gICAgIFBzID0gNSAgLT4gVHVybiBvbiBhdXRvcHJpbnQgbW9kZS5cbi8vICAgICBQcyA9IDEgIDAgIC0+IFByaW50IGNvbXBvc2VkIGRpc3BsYXksIGlnbm9yZXMgREVDUEVYLlxuLy8gICAgIFBzID0gMSAgMSAgLT4gUHJpbnQgYWxsIHBhZ2VzLlxuVGVybWluYWwucHJvdG90eXBlLm1lZGlhQ29weSA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICA7XG59O1xuXG4vLyBDU0kgPiBQczsgUHMgbVxuLy8gICBTZXQgb3IgcmVzZXQgcmVzb3VyY2UtdmFsdWVzIHVzZWQgYnkgeHRlcm0gdG8gZGVjaWRlIHdoZXRoZXJcbi8vICAgdG8gY29uc3RydWN0IGVzY2FwZSBzZXF1ZW5jZXMgaG9sZGluZyBpbmZvcm1hdGlvbiBhYm91dCB0aGVcbi8vICAgbW9kaWZpZXJzIHByZXNzZWQgd2l0aCBhIGdpdmVuIGtleS4gIFRoZSBmaXJzdCBwYXJhbWV0ZXIgaWRlbi1cbi8vICAgdGlmaWVzIHRoZSByZXNvdXJjZSB0byBzZXQvcmVzZXQuICBUaGUgc2Vjb25kIHBhcmFtZXRlciBpcyB0aGVcbi8vICAgdmFsdWUgdG8gYXNzaWduIHRvIHRoZSByZXNvdXJjZS4gIElmIHRoZSBzZWNvbmQgcGFyYW1ldGVyIGlzXG4vLyAgIG9taXR0ZWQsIHRoZSByZXNvdXJjZSBpcyByZXNldCB0byBpdHMgaW5pdGlhbCB2YWx1ZS5cbi8vICAgICBQcyA9IDEgIC0+IG1vZGlmeUN1cnNvcktleXMuXG4vLyAgICAgUHMgPSAyICAtPiBtb2RpZnlGdW5jdGlvbktleXMuXG4vLyAgICAgUHMgPSA0ICAtPiBtb2RpZnlPdGhlcktleXMuXG4vLyAgIElmIG5vIHBhcmFtZXRlcnMgYXJlIGdpdmVuLCBhbGwgcmVzb3VyY2VzIGFyZSByZXNldCB0byB0aGVpclxuLy8gICBpbml0aWFsIHZhbHVlcy5cblRlcm1pbmFsLnByb3RvdHlwZS5zZXRSZXNvdXJjZXMgPSBmdW5jdGlvbihwYXJhbXMpIHtcbiAgO1xufTtcblxuLy8gQ1NJID4gUHMgblxuLy8gICBEaXNhYmxlIG1vZGlmaWVycyB3aGljaCBtYXkgYmUgZW5hYmxlZCB2aWEgdGhlIENTSSA+IFBzOyBQcyBtXG4vLyAgIHNlcXVlbmNlLiAgVGhpcyBjb3JyZXNwb25kcyB0byBhIHJlc291cmNlIHZhbHVlIG9mIFwiLTFcIiwgd2hpY2hcbi8vICAgY2Fubm90IGJlIHNldCB3aXRoIHRoZSBvdGhlciBzZXF1ZW5jZS4gIFRoZSBwYXJhbWV0ZXIgaWRlbnRpLVxuLy8gICBmaWVzIHRoZSByZXNvdXJjZSB0byBiZSBkaXNhYmxlZDpcbi8vICAgICBQcyA9IDEgIC0+IG1vZGlmeUN1cnNvcktleXMuXG4vLyAgICAgUHMgPSAyICAtPiBtb2RpZnlGdW5jdGlvbktleXMuXG4vLyAgICAgUHMgPSA0ICAtPiBtb2RpZnlPdGhlcktleXMuXG4vLyAgIElmIHRoZSBwYXJhbWV0ZXIgaXMgb21pdHRlZCwgbW9kaWZ5RnVuY3Rpb25LZXlzIGlzIGRpc2FibGVkLlxuLy8gICBXaGVuIG1vZGlmeUZ1bmN0aW9uS2V5cyBpcyBkaXNhYmxlZCwgeHRlcm0gdXNlcyB0aGUgbW9kaWZpZXJcbi8vICAga2V5cyB0byBtYWtlIGFuIGV4dGVuZGVkIHNlcXVlbmNlIG9mIGZ1bmN0aW9ucyByYXRoZXIgdGhhblxuLy8gICBhZGRpbmcgYSBwYXJhbWV0ZXIgdG8gZWFjaCBmdW5jdGlvbiBrZXkgdG8gZGVub3RlIHRoZSBtb2RpLVxuLy8gICBmaWVycy5cblRlcm1pbmFsLnByb3RvdHlwZS5kaXNhYmxlTW9kaWZpZXJzID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gIDtcbn07XG5cbi8vIENTSSA+IFBzIHBcbi8vICAgU2V0IHJlc291cmNlIHZhbHVlIHBvaW50ZXJNb2RlLiAgVGhpcyBpcyB1c2VkIGJ5IHh0ZXJtIHRvXG4vLyAgIGRlY2lkZSB3aGV0aGVyIHRvIGhpZGUgdGhlIHBvaW50ZXIgY3Vyc29yIGFzIHRoZSB1c2VyIHR5cGVzLlxuLy8gICBWYWxpZCB2YWx1ZXMgZm9yIHRoZSBwYXJhbWV0ZXI6XG4vLyAgICAgUHMgPSAwICAtPiBuZXZlciBoaWRlIHRoZSBwb2ludGVyLlxuLy8gICAgIFBzID0gMSAgLT4gaGlkZSBpZiB0aGUgbW91c2UgdHJhY2tpbmcgbW9kZSBpcyBub3QgZW5hYmxlZC5cbi8vICAgICBQcyA9IDIgIC0+IGFsd2F5cyBoaWRlIHRoZSBwb2ludGVyLiAgSWYgbm8gcGFyYW1ldGVyIGlzXG4vLyAgICAgZ2l2ZW4sIHh0ZXJtIHVzZXMgdGhlIGRlZmF1bHQsIHdoaWNoIGlzIDEgLlxuVGVybWluYWwucHJvdG90eXBlLnNldFBvaW50ZXJNb2RlID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gIDtcbn07XG5cbi8vIENTSSAhIHAgICBTb2Z0IHRlcm1pbmFsIHJlc2V0IChERUNTVFIpLlxuLy8gaHR0cDovL3Z0MTAwLm5ldC9kb2NzL3Z0MjIwLXJtL3RhYmxlNC0xMC5odG1sXG5UZXJtaW5hbC5wcm90b3R5cGUuc29mdFJlc2V0ID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gIHRoaXMuY3Vyc29ySGlkZGVuID0gZmFsc2U7XG4gIHRoaXMuaW5zZXJ0TW9kZSA9IGZhbHNlO1xuICB0aGlzLm9yaWdpbk1vZGUgPSBmYWxzZTtcbiAgdGhpcy53cmFwYXJvdW5kTW9kZSA9IGZhbHNlOyAvLyBhdXRvd3JhcFxuICB0aGlzLmFwcGxpY2F0aW9uS2V5cGFkID0gZmFsc2U7IC8vID9cbiAgdGhpcy5hcHBsaWNhdGlvbkN1cnNvciA9IGZhbHNlO1xuICB0aGlzLnNjcm9sbFRvcCA9IDA7XG4gIHRoaXMuc2Nyb2xsQm90dG9tID0gdGhpcy5yb3dzIC0gMTtcbiAgdGhpcy5jdXJBdHRyID0gdGhpcy5kZWZBdHRyO1xuICB0aGlzLnggPSB0aGlzLnkgPSAwOyAvLyA/XG4gIHRoaXMuY2hhcnNldCA9IG51bGw7XG4gIHRoaXMuZ2xldmVsID0gMDsgLy8gPz9cbiAgdGhpcy5jaGFyc2V0cyA9IFtudWxsXTsgLy8gPz9cbn07XG5cbi8vIENTSSBQcyQgcFxuLy8gICBSZXF1ZXN0IEFOU0kgbW9kZSAoREVDUlFNKS4gIEZvciBWVDMwMCBhbmQgdXAsIHJlcGx5IGlzXG4vLyAgICAgQ1NJIFBzOyBQbSQgeVxuLy8gICB3aGVyZSBQcyBpcyB0aGUgbW9kZSBudW1iZXIgYXMgaW4gUk0sIGFuZCBQbSBpcyB0aGUgbW9kZVxuLy8gICB2YWx1ZTpcbi8vICAgICAwIC0gbm90IHJlY29nbml6ZWRcbi8vICAgICAxIC0gc2V0XG4vLyAgICAgMiAtIHJlc2V0XG4vLyAgICAgMyAtIHBlcm1hbmVudGx5IHNldFxuLy8gICAgIDQgLSBwZXJtYW5lbnRseSByZXNldFxuVGVybWluYWwucHJvdG90eXBlLnJlcXVlc3RBbnNpTW9kZSA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICA7XG59O1xuXG4vLyBDU0kgPyBQcyQgcFxuLy8gICBSZXF1ZXN0IERFQyBwcml2YXRlIG1vZGUgKERFQ1JRTSkuICBGb3IgVlQzMDAgYW5kIHVwLCByZXBseSBpc1xuLy8gICAgIENTSSA/IFBzOyBQbSQgcFxuLy8gICB3aGVyZSBQcyBpcyB0aGUgbW9kZSBudW1iZXIgYXMgaW4gREVDU0VULCBQbSBpcyB0aGUgbW9kZSB2YWx1ZVxuLy8gICBhcyBpbiB0aGUgQU5TSSBERUNSUU0uXG5UZXJtaW5hbC5wcm90b3R5cGUucmVxdWVzdFByaXZhdGVNb2RlID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gIDtcbn07XG5cbi8vIENTSSBQcyA7IFBzIFwiIHBcbi8vICAgU2V0IGNvbmZvcm1hbmNlIGxldmVsIChERUNTQ0wpLiAgVmFsaWQgdmFsdWVzIGZvciB0aGUgZmlyc3Rcbi8vICAgcGFyYW1ldGVyOlxuLy8gICAgIFBzID0gNiAxICAtPiBWVDEwMC5cbi8vICAgICBQcyA9IDYgMiAgLT4gVlQyMDAuXG4vLyAgICAgUHMgPSA2IDMgIC0+IFZUMzAwLlxuLy8gICBWYWxpZCB2YWx1ZXMgZm9yIHRoZSBzZWNvbmQgcGFyYW1ldGVyOlxuLy8gICAgIFBzID0gMCAgLT4gOC1iaXQgY29udHJvbHMuXG4vLyAgICAgUHMgPSAxICAtPiA3LWJpdCBjb250cm9scyAoYWx3YXlzIHNldCBmb3IgVlQxMDApLlxuLy8gICAgIFBzID0gMiAgLT4gOC1iaXQgY29udHJvbHMuXG5UZXJtaW5hbC5wcm90b3R5cGUuc2V0Q29uZm9ybWFuY2VMZXZlbCA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICA7XG59O1xuXG4vLyBDU0kgUHMgcSAgTG9hZCBMRURzIChERUNMTCkuXG4vLyAgICAgUHMgPSAwICAtPiBDbGVhciBhbGwgTEVEUyAoZGVmYXVsdCkuXG4vLyAgICAgUHMgPSAxICAtPiBMaWdodCBOdW0gTG9jay5cbi8vICAgICBQcyA9IDIgIC0+IExpZ2h0IENhcHMgTG9jay5cbi8vICAgICBQcyA9IDMgIC0+IExpZ2h0IFNjcm9sbCBMb2NrLlxuLy8gICAgIFBzID0gMiAgMSAgLT4gRXh0aW5ndWlzaCBOdW0gTG9jay5cbi8vICAgICBQcyA9IDIgIDIgIC0+IEV4dGluZ3Vpc2ggQ2FwcyBMb2NrLlxuLy8gICAgIFBzID0gMiAgMyAgLT4gRXh0aW5ndWlzaCBTY3JvbGwgTG9jay5cblRlcm1pbmFsLnByb3RvdHlwZS5sb2FkTEVEcyA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICA7XG59O1xuXG4vLyBDU0kgUHMgU1AgcVxuLy8gICBTZXQgY3Vyc29yIHN0eWxlIChERUNTQ1VTUiwgVlQ1MjApLlxuLy8gICAgIFBzID0gMCAgLT4gYmxpbmtpbmcgYmxvY2suXG4vLyAgICAgUHMgPSAxICAtPiBibGlua2luZyBibG9jayAoZGVmYXVsdCkuXG4vLyAgICAgUHMgPSAyICAtPiBzdGVhZHkgYmxvY2suXG4vLyAgICAgUHMgPSAzICAtPiBibGlua2luZyB1bmRlcmxpbmUuXG4vLyAgICAgUHMgPSA0ICAtPiBzdGVhZHkgdW5kZXJsaW5lLlxuVGVybWluYWwucHJvdG90eXBlLnNldEN1cnNvclN0eWxlID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gIDtcbn07XG5cbi8vIENTSSBQcyBcIiBxXG4vLyAgIFNlbGVjdCBjaGFyYWN0ZXIgcHJvdGVjdGlvbiBhdHRyaWJ1dGUgKERFQ1NDQSkuICBWYWxpZCB2YWx1ZXNcbi8vICAgZm9yIHRoZSBwYXJhbWV0ZXI6XG4vLyAgICAgUHMgPSAwICAtPiBERUNTRUQgYW5kIERFQ1NFTCBjYW4gZXJhc2UgKGRlZmF1bHQpLlxuLy8gICAgIFBzID0gMSAgLT4gREVDU0VEIGFuZCBERUNTRUwgY2Fubm90IGVyYXNlLlxuLy8gICAgIFBzID0gMiAgLT4gREVDU0VEIGFuZCBERUNTRUwgY2FuIGVyYXNlLlxuVGVybWluYWwucHJvdG90eXBlLnNldENoYXJQcm90ZWN0aW9uQXR0ciA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICA7XG59O1xuXG4vLyBDU0kgPyBQbSByXG4vLyAgIFJlc3RvcmUgREVDIFByaXZhdGUgTW9kZSBWYWx1ZXMuICBUaGUgdmFsdWUgb2YgUHMgcHJldmlvdXNseVxuLy8gICBzYXZlZCBpcyByZXN0b3JlZC4gIFBzIHZhbHVlcyBhcmUgdGhlIHNhbWUgYXMgZm9yIERFQ1NFVC5cblRlcm1pbmFsLnByb3RvdHlwZS5yZXN0b3JlUHJpdmF0ZVZhbHVlcyA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICA7XG59O1xuXG4vLyBDU0kgUHQ7IFBsOyBQYjsgUHI7IFBzJCByXG4vLyAgIENoYW5nZSBBdHRyaWJ1dGVzIGluIFJlY3Rhbmd1bGFyIEFyZWEgKERFQ0NBUkEpLCBWVDQwMCBhbmQgdXAuXG4vLyAgICAgUHQ7IFBsOyBQYjsgUHIgZGVub3RlcyB0aGUgcmVjdGFuZ2xlLlxuLy8gICAgIFBzIGRlbm90ZXMgdGhlIFNHUiBhdHRyaWJ1dGVzIHRvIGNoYW5nZTogMCwgMSwgNCwgNSwgNy5cbi8vIE5PVEU6IHh0ZXJtIGRvZXNuJ3QgZW5hYmxlIHRoaXMgY29kZSBieSBkZWZhdWx0LlxuVGVybWluYWwucHJvdG90eXBlLnNldEF0dHJJblJlY3RhbmdsZSA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICB2YXIgdCA9IHBhcmFtc1swXVxuICAgICwgbCA9IHBhcmFtc1sxXVxuICAgICwgYiA9IHBhcmFtc1syXVxuICAgICwgciA9IHBhcmFtc1szXVxuICAgICwgYXR0ciA9IHBhcmFtc1s0XTtcblxuICB2YXIgbGluZVxuICAgICwgaTtcblxuICBmb3IgKDsgdCA8IGIgKyAxOyB0KyspIHtcbiAgICBsaW5lID0gdGhpcy5saW5lc1t0aGlzLnliYXNlICsgdF07XG4gICAgZm9yIChpID0gbDsgaSA8IHI7IGkrKykge1xuICAgICAgbGluZVtpXSA9IFthdHRyLCBsaW5lW2ldWzFdXTtcbiAgICB9XG4gIH1cblxuICAvLyB0aGlzLm1heFJhbmdlKCk7XG4gIHRoaXMudXBkYXRlUmFuZ2UocGFyYW1zWzBdKTtcbiAgdGhpcy51cGRhdGVSYW5nZShwYXJhbXNbMl0pO1xufTtcblxuLy8gQ1NJID8gUG0gc1xuLy8gICBTYXZlIERFQyBQcml2YXRlIE1vZGUgVmFsdWVzLiAgUHMgdmFsdWVzIGFyZSB0aGUgc2FtZSBhcyBmb3Jcbi8vICAgREVDU0VULlxuVGVybWluYWwucHJvdG90eXBlLnNhdmVQcml2YXRlVmFsdWVzID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gIDtcbn07XG5cbi8vIENTSSBQcyA7IFBzIDsgUHMgdFxuLy8gICBXaW5kb3cgbWFuaXB1bGF0aW9uIChmcm9tIGR0dGVybSwgYXMgd2VsbCBhcyBleHRlbnNpb25zKS5cbi8vICAgVGhlc2UgY29udHJvbHMgbWF5IGJlIGRpc2FibGVkIHVzaW5nIHRoZSBhbGxvd1dpbmRvd09wc1xuLy8gICByZXNvdXJjZS4gIFZhbGlkIHZhbHVlcyBmb3IgdGhlIGZpcnN0IChhbmQgYW55IGFkZGl0aW9uYWxcbi8vICAgcGFyYW1ldGVycykgYXJlOlxuLy8gICAgIFBzID0gMSAgLT4gRGUtaWNvbmlmeSB3aW5kb3cuXG4vLyAgICAgUHMgPSAyICAtPiBJY29uaWZ5IHdpbmRvdy5cbi8vICAgICBQcyA9IDMgIDsgIHggOyAgeSAtPiBNb3ZlIHdpbmRvdyB0byBbeCwgeV0uXG4vLyAgICAgUHMgPSA0ICA7ICBoZWlnaHQgOyAgd2lkdGggLT4gUmVzaXplIHRoZSB4dGVybSB3aW5kb3cgdG9cbi8vICAgICBoZWlnaHQgYW5kIHdpZHRoIGluIHBpeGVscy5cbi8vICAgICBQcyA9IDUgIC0+IFJhaXNlIHRoZSB4dGVybSB3aW5kb3cgdG8gdGhlIGZyb250IG9mIHRoZSBzdGFjay1cbi8vICAgICBpbmcgb3JkZXIuXG4vLyAgICAgUHMgPSA2ICAtPiBMb3dlciB0aGUgeHRlcm0gd2luZG93IHRvIHRoZSBib3R0b20gb2YgdGhlXG4vLyAgICAgc3RhY2tpbmcgb3JkZXIuXG4vLyAgICAgUHMgPSA3ICAtPiBSZWZyZXNoIHRoZSB4dGVybSB3aW5kb3cuXG4vLyAgICAgUHMgPSA4ICA7ICBoZWlnaHQgOyAgd2lkdGggLT4gUmVzaXplIHRoZSB0ZXh0IGFyZWEgdG9cbi8vICAgICBbaGVpZ2h0O3dpZHRoXSBpbiBjaGFyYWN0ZXJzLlxuLy8gICAgIFBzID0gOSAgOyAgMCAgLT4gUmVzdG9yZSBtYXhpbWl6ZWQgd2luZG93LlxuLy8gICAgIFBzID0gOSAgOyAgMSAgLT4gTWF4aW1pemUgd2luZG93IChpLmUuLCByZXNpemUgdG8gc2NyZWVuXG4vLyAgICAgc2l6ZSkuXG4vLyAgICAgUHMgPSAxIDAgIDsgIDAgIC0+IFVuZG8gZnVsbC1zY3JlZW4gbW9kZS5cbi8vICAgICBQcyA9IDEgMCAgOyAgMSAgLT4gQ2hhbmdlIHRvIGZ1bGwtc2NyZWVuLlxuLy8gICAgIFBzID0gMSAxICAtPiBSZXBvcnQgeHRlcm0gd2luZG93IHN0YXRlLiAgSWYgdGhlIHh0ZXJtIHdpbmRvd1xuLy8gICAgIGlzIG9wZW4gKG5vbi1pY29uaWZpZWQpLCBpdCByZXR1cm5zIENTSSAxIHQgLiAgSWYgdGhlIHh0ZXJtXG4vLyAgICAgd2luZG93IGlzIGljb25pZmllZCwgaXQgcmV0dXJucyBDU0kgMiB0IC5cbi8vICAgICBQcyA9IDEgMyAgLT4gUmVwb3J0IHh0ZXJtIHdpbmRvdyBwb3NpdGlvbi4gIFJlc3VsdCBpcyBDU0kgM1xuLy8gICAgIDsgeCA7IHkgdFxuLy8gICAgIFBzID0gMSA0ICAtPiBSZXBvcnQgeHRlcm0gd2luZG93IGluIHBpeGVscy4gIFJlc3VsdCBpcyBDU0lcbi8vICAgICA0ICA7ICBoZWlnaHQgOyAgd2lkdGggdFxuLy8gICAgIFBzID0gMSA4ICAtPiBSZXBvcnQgdGhlIHNpemUgb2YgdGhlIHRleHQgYXJlYSBpbiBjaGFyYWN0ZXJzLlxuLy8gICAgIFJlc3VsdCBpcyBDU0kgIDggIDsgIGhlaWdodCA7ICB3aWR0aCB0XG4vLyAgICAgUHMgPSAxIDkgIC0+IFJlcG9ydCB0aGUgc2l6ZSBvZiB0aGUgc2NyZWVuIGluIGNoYXJhY3RlcnMuXG4vLyAgICAgUmVzdWx0IGlzIENTSSAgOSAgOyAgaGVpZ2h0IDsgIHdpZHRoIHRcbi8vICAgICBQcyA9IDIgMCAgLT4gUmVwb3J0IHh0ZXJtIHdpbmRvdydzIGljb24gbGFiZWwuICBSZXN1bHQgaXNcbi8vICAgICBPU0MgIEwgIGxhYmVsIFNUXG4vLyAgICAgUHMgPSAyIDEgIC0+IFJlcG9ydCB4dGVybSB3aW5kb3cncyB0aXRsZS4gIFJlc3VsdCBpcyBPU0MgIGxcbi8vICAgICBsYWJlbCBTVFxuLy8gICAgIFBzID0gMiAyICA7ICAwICAtPiBTYXZlIHh0ZXJtIGljb24gYW5kIHdpbmRvdyB0aXRsZSBvblxuLy8gICAgIHN0YWNrLlxuLy8gICAgIFBzID0gMiAyICA7ICAxICAtPiBTYXZlIHh0ZXJtIGljb24gdGl0bGUgb24gc3RhY2suXG4vLyAgICAgUHMgPSAyIDIgIDsgIDIgIC0+IFNhdmUgeHRlcm0gd2luZG93IHRpdGxlIG9uIHN0YWNrLlxuLy8gICAgIFBzID0gMiAzICA7ICAwICAtPiBSZXN0b3JlIHh0ZXJtIGljb24gYW5kIHdpbmRvdyB0aXRsZSBmcm9tXG4vLyAgICAgc3RhY2suXG4vLyAgICAgUHMgPSAyIDMgIDsgIDEgIC0+IFJlc3RvcmUgeHRlcm0gaWNvbiB0aXRsZSBmcm9tIHN0YWNrLlxuLy8gICAgIFBzID0gMiAzICA7ICAyICAtPiBSZXN0b3JlIHh0ZXJtIHdpbmRvdyB0aXRsZSBmcm9tIHN0YWNrLlxuLy8gICAgIFBzID49IDIgNCAgLT4gUmVzaXplIHRvIFBzIGxpbmVzIChERUNTTFBQKS5cblRlcm1pbmFsLnByb3RvdHlwZS5tYW5pcHVsYXRlV2luZG93ID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gIDtcbn07XG5cbi8vIENTSSBQdDsgUGw7IFBiOyBQcjsgUHMkIHRcbi8vICAgUmV2ZXJzZSBBdHRyaWJ1dGVzIGluIFJlY3Rhbmd1bGFyIEFyZWEgKERFQ1JBUkEpLCBWVDQwMCBhbmRcbi8vICAgdXAuXG4vLyAgICAgUHQ7IFBsOyBQYjsgUHIgZGVub3RlcyB0aGUgcmVjdGFuZ2xlLlxuLy8gICAgIFBzIGRlbm90ZXMgdGhlIGF0dHJpYnV0ZXMgdG8gcmV2ZXJzZSwgaS5lLiwgIDEsIDQsIDUsIDcuXG4vLyBOT1RFOiB4dGVybSBkb2Vzbid0IGVuYWJsZSB0aGlzIGNvZGUgYnkgZGVmYXVsdC5cblRlcm1pbmFsLnByb3RvdHlwZS5yZXZlcnNlQXR0ckluUmVjdGFuZ2xlID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gIDtcbn07XG5cbi8vIENTSSA+IFBzOyBQcyB0XG4vLyAgIFNldCBvbmUgb3IgbW9yZSBmZWF0dXJlcyBvZiB0aGUgdGl0bGUgbW9kZXMuICBFYWNoIHBhcmFtZXRlclxuLy8gICBlbmFibGVzIGEgc2luZ2xlIGZlYXR1cmUuXG4vLyAgICAgUHMgPSAwICAtPiBTZXQgd2luZG93L2ljb24gbGFiZWxzIHVzaW5nIGhleGFkZWNpbWFsLlxuLy8gICAgIFBzID0gMSAgLT4gUXVlcnkgd2luZG93L2ljb24gbGFiZWxzIHVzaW5nIGhleGFkZWNpbWFsLlxuLy8gICAgIFBzID0gMiAgLT4gU2V0IHdpbmRvdy9pY29uIGxhYmVscyB1c2luZyBVVEYtOC5cbi8vICAgICBQcyA9IDMgIC0+IFF1ZXJ5IHdpbmRvdy9pY29uIGxhYmVscyB1c2luZyBVVEYtOC4gIChTZWUgZGlzLVxuLy8gICAgIGN1c3Npb24gb2YgXCJUaXRsZSBNb2Rlc1wiKVxuVGVybWluYWwucHJvdG90eXBlLnNldFRpdGxlTW9kZUZlYXR1cmUgPSBmdW5jdGlvbihwYXJhbXMpIHtcbiAgO1xufTtcblxuLy8gQ1NJIFBzIFNQIHRcbi8vICAgU2V0IHdhcm5pbmctYmVsbCB2b2x1bWUgKERFQ1NXQlYsIFZUNTIwKS5cbi8vICAgICBQcyA9IDAgIG9yIDEgIC0+IG9mZi5cbi8vICAgICBQcyA9IDIgLCAzICBvciA0ICAtPiBsb3cuXG4vLyAgICAgUHMgPSA1ICwgNiAsIDcgLCBvciA4ICAtPiBoaWdoLlxuVGVybWluYWwucHJvdG90eXBlLnNldFdhcm5pbmdCZWxsVm9sdW1lID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gIDtcbn07XG5cbi8vIENTSSBQcyBTUCB1XG4vLyAgIFNldCBtYXJnaW4tYmVsbCB2b2x1bWUgKERFQ1NNQlYsIFZUNTIwKS5cbi8vICAgICBQcyA9IDEgIC0+IG9mZi5cbi8vICAgICBQcyA9IDIgLCAzICBvciA0ICAtPiBsb3cuXG4vLyAgICAgUHMgPSAwICwgNSAsIDYgLCA3ICwgb3IgOCAgLT4gaGlnaC5cblRlcm1pbmFsLnByb3RvdHlwZS5zZXRNYXJnaW5CZWxsVm9sdW1lID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gIDtcbn07XG5cbi8vIENTSSBQdDsgUGw7IFBiOyBQcjsgUHA7IFB0OyBQbDsgUHAkIHZcbi8vICAgQ29weSBSZWN0YW5ndWxhciBBcmVhIChERUNDUkEsIFZUNDAwIGFuZCB1cCkuXG4vLyAgICAgUHQ7IFBsOyBQYjsgUHIgZGVub3RlcyB0aGUgcmVjdGFuZ2xlLlxuLy8gICAgIFBwIGRlbm90ZXMgdGhlIHNvdXJjZSBwYWdlLlxuLy8gICAgIFB0OyBQbCBkZW5vdGVzIHRoZSB0YXJnZXQgbG9jYXRpb24uXG4vLyAgICAgUHAgZGVub3RlcyB0aGUgdGFyZ2V0IHBhZ2UuXG4vLyBOT1RFOiB4dGVybSBkb2Vzbid0IGVuYWJsZSB0aGlzIGNvZGUgYnkgZGVmYXVsdC5cblRlcm1pbmFsLnByb3RvdHlwZS5jb3B5UmVjdGFuZ2xlID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gIDtcbn07XG5cbi8vIENTSSBQdCA7IFBsIDsgUGIgOyBQciAnIHdcbi8vICAgRW5hYmxlIEZpbHRlciBSZWN0YW5nbGUgKERFQ0VGUiksIFZUNDIwIGFuZCB1cC5cbi8vICAgUGFyYW1ldGVycyBhcmUgW3RvcDtsZWZ0O2JvdHRvbTtyaWdodF0uXG4vLyAgIERlZmluZXMgdGhlIGNvb3JkaW5hdGVzIG9mIGEgZmlsdGVyIHJlY3RhbmdsZSBhbmQgYWN0aXZhdGVzXG4vLyAgIGl0LiAgQW55dGltZSB0aGUgbG9jYXRvciBpcyBkZXRlY3RlZCBvdXRzaWRlIG9mIHRoZSBmaWx0ZXJcbi8vICAgcmVjdGFuZ2xlLCBhbiBvdXRzaWRlIHJlY3RhbmdsZSBldmVudCBpcyBnZW5lcmF0ZWQgYW5kIHRoZVxuLy8gICByZWN0YW5nbGUgaXMgZGlzYWJsZWQuICBGaWx0ZXIgcmVjdGFuZ2xlcyBhcmUgYWx3YXlzIHRyZWF0ZWRcbi8vICAgYXMgXCJvbmUtc2hvdFwiIGV2ZW50cy4gIEFueSBwYXJhbWV0ZXJzIHRoYXQgYXJlIG9taXR0ZWQgZGVmYXVsdFxuLy8gICB0byB0aGUgY3VycmVudCBsb2NhdG9yIHBvc2l0aW9uLiAgSWYgYWxsIHBhcmFtZXRlcnMgYXJlIG9taXQtXG4vLyAgIHRlZCwgYW55IGxvY2F0b3IgbW90aW9uIHdpbGwgYmUgcmVwb3J0ZWQuICBERUNFTFIgYWx3YXlzIGNhbi1cbi8vICAgY2VscyBhbnkgcHJldm91cyByZWN0YW5nbGUgZGVmaW5pdGlvbi5cblRlcm1pbmFsLnByb3RvdHlwZS5lbmFibGVGaWx0ZXJSZWN0YW5nbGUgPSBmdW5jdGlvbihwYXJhbXMpIHtcbiAgO1xufTtcblxuLy8gQ1NJIFBzIHggIFJlcXVlc3QgVGVybWluYWwgUGFyYW1ldGVycyAoREVDUkVRVFBBUk0pLlxuLy8gICBpZiBQcyBpcyBhIFwiMFwiIChkZWZhdWx0KSBvciBcIjFcIiwgYW5kIHh0ZXJtIGlzIGVtdWxhdGluZyBWVDEwMCxcbi8vICAgdGhlIGNvbnRyb2wgc2VxdWVuY2UgZWxpY2l0cyBhIHJlc3BvbnNlIG9mIHRoZSBzYW1lIGZvcm0gd2hvc2Vcbi8vICAgcGFyYW1ldGVycyBkZXNjcmliZSB0aGUgdGVybWluYWw6XG4vLyAgICAgUHMgLT4gdGhlIGdpdmVuIFBzIGluY3JlbWVudGVkIGJ5IDIuXG4vLyAgICAgUG4gPSAxICA8LSBubyBwYXJpdHkuXG4vLyAgICAgUG4gPSAxICA8LSBlaWdodCBiaXRzLlxuLy8gICAgIFBuID0gMSAgPC0gMiAgOCAgdHJhbnNtaXQgMzguNGsgYmF1ZC5cbi8vICAgICBQbiA9IDEgIDwtIDIgIDggIHJlY2VpdmUgMzguNGsgYmF1ZC5cbi8vICAgICBQbiA9IDEgIDwtIGNsb2NrIG11bHRpcGxpZXIuXG4vLyAgICAgUG4gPSAwICA8LSBTVFAgZmxhZ3MuXG5UZXJtaW5hbC5wcm90b3R5cGUucmVxdWVzdFBhcmFtZXRlcnMgPSBmdW5jdGlvbihwYXJhbXMpIHtcbiAgO1xufTtcblxuLy8gQ1NJIFBzIHggIFNlbGVjdCBBdHRyaWJ1dGUgQ2hhbmdlIEV4dGVudCAoREVDU0FDRSkuXG4vLyAgICAgUHMgPSAwICAtPiBmcm9tIHN0YXJ0IHRvIGVuZCBwb3NpdGlvbiwgd3JhcHBlZC5cbi8vICAgICBQcyA9IDEgIC0+IGZyb20gc3RhcnQgdG8gZW5kIHBvc2l0aW9uLCB3cmFwcGVkLlxuLy8gICAgIFBzID0gMiAgLT4gcmVjdGFuZ2xlIChleGFjdCkuXG5UZXJtaW5hbC5wcm90b3R5cGUuc2VsZWN0Q2hhbmdlRXh0ZW50ID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gIDtcbn07XG5cbi8vIENTSSBQYzsgUHQ7IFBsOyBQYjsgUHIkIHhcbi8vICAgRmlsbCBSZWN0YW5ndWxhciBBcmVhIChERUNGUkEpLCBWVDQyMCBhbmQgdXAuXG4vLyAgICAgUGMgaXMgdGhlIGNoYXJhY3RlciB0byB1c2UuXG4vLyAgICAgUHQ7IFBsOyBQYjsgUHIgZGVub3RlcyB0aGUgcmVjdGFuZ2xlLlxuLy8gTk9URTogeHRlcm0gZG9lc24ndCBlbmFibGUgdGhpcyBjb2RlIGJ5IGRlZmF1bHQuXG5UZXJtaW5hbC5wcm90b3R5cGUuZmlsbFJlY3RhbmdsZSA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICB2YXIgY2ggPSBwYXJhbXNbMF1cbiAgICAsIHQgPSBwYXJhbXNbMV1cbiAgICAsIGwgPSBwYXJhbXNbMl1cbiAgICAsIGIgPSBwYXJhbXNbM11cbiAgICAsIHIgPSBwYXJhbXNbNF07XG5cbiAgdmFyIGxpbmVcbiAgICAsIGk7XG5cbiAgZm9yICg7IHQgPCBiICsgMTsgdCsrKSB7XG4gICAgbGluZSA9IHRoaXMubGluZXNbdGhpcy55YmFzZSArIHRdO1xuICAgIGZvciAoaSA9IGw7IGkgPCByOyBpKyspIHtcbiAgICAgIGxpbmVbaV0gPSBbbGluZVtpXVswXSwgU3RyaW5nLmZyb21DaGFyQ29kZShjaCldO1xuICAgIH1cbiAgfVxuXG4gIC8vIHRoaXMubWF4UmFuZ2UoKTtcbiAgdGhpcy51cGRhdGVSYW5nZShwYXJhbXNbMV0pO1xuICB0aGlzLnVwZGF0ZVJhbmdlKHBhcmFtc1szXSk7XG59O1xuXG4vLyBDU0kgUHMgOyBQdSAnIHpcbi8vICAgRW5hYmxlIExvY2F0b3IgUmVwb3J0aW5nIChERUNFTFIpLlxuLy8gICBWYWxpZCB2YWx1ZXMgZm9yIHRoZSBmaXJzdCBwYXJhbWV0ZXI6XG4vLyAgICAgUHMgPSAwICAtPiBMb2NhdG9yIGRpc2FibGVkIChkZWZhdWx0KS5cbi8vICAgICBQcyA9IDEgIC0+IExvY2F0b3IgZW5hYmxlZC5cbi8vICAgICBQcyA9IDIgIC0+IExvY2F0b3IgZW5hYmxlZCBmb3Igb25lIHJlcG9ydCwgdGhlbiBkaXNhYmxlZC5cbi8vICAgVGhlIHNlY29uZCBwYXJhbWV0ZXIgc3BlY2lmaWVzIHRoZSBjb29yZGluYXRlIHVuaXQgZm9yIGxvY2F0b3Jcbi8vICAgcmVwb3J0cy5cbi8vICAgVmFsaWQgdmFsdWVzIGZvciB0aGUgc2Vjb25kIHBhcmFtZXRlcjpcbi8vICAgICBQdSA9IDAgIDwtIG9yIG9taXR0ZWQgLT4gZGVmYXVsdCB0byBjaGFyYWN0ZXIgY2VsbHMuXG4vLyAgICAgUHUgPSAxICA8LSBkZXZpY2UgcGh5c2ljYWwgcGl4ZWxzLlxuLy8gICAgIFB1ID0gMiAgPC0gY2hhcmFjdGVyIGNlbGxzLlxuVGVybWluYWwucHJvdG90eXBlLmVuYWJsZUxvY2F0b3JSZXBvcnRpbmcgPSBmdW5jdGlvbihwYXJhbXMpIHtcbiAgdmFyIHZhbCA9IHBhcmFtc1swXSA+IDA7XG4gIC8vdGhpcy5tb3VzZUV2ZW50cyA9IHZhbDtcbiAgLy90aGlzLmRlY0xvY2F0b3IgPSB2YWw7XG59O1xuXG4vLyBDU0kgUHQ7IFBsOyBQYjsgUHIkIHpcbi8vICAgRXJhc2UgUmVjdGFuZ3VsYXIgQXJlYSAoREVDRVJBKSwgVlQ0MDAgYW5kIHVwLlxuLy8gICAgIFB0OyBQbDsgUGI7IFByIGRlbm90ZXMgdGhlIHJlY3RhbmdsZS5cbi8vIE5PVEU6IHh0ZXJtIGRvZXNuJ3QgZW5hYmxlIHRoaXMgY29kZSBieSBkZWZhdWx0LlxuVGVybWluYWwucHJvdG90eXBlLmVyYXNlUmVjdGFuZ2xlID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gIHZhciB0ID0gcGFyYW1zWzBdXG4gICAgLCBsID0gcGFyYW1zWzFdXG4gICAgLCBiID0gcGFyYW1zWzJdXG4gICAgLCByID0gcGFyYW1zWzNdO1xuXG4gIHZhciBsaW5lXG4gICAgLCBpXG4gICAgLCBjaDtcblxuICBjaCA9IFt0aGlzLmVyYXNlQXR0cigpLCAnICddOyAvLyB4dGVybT9cblxuICBmb3IgKDsgdCA8IGIgKyAxOyB0KyspIHtcbiAgICBsaW5lID0gdGhpcy5saW5lc1t0aGlzLnliYXNlICsgdF07XG4gICAgZm9yIChpID0gbDsgaSA8IHI7IGkrKykge1xuICAgICAgbGluZVtpXSA9IGNoO1xuICAgIH1cbiAgfVxuXG4gIC8vIHRoaXMubWF4UmFuZ2UoKTtcbiAgdGhpcy51cGRhdGVSYW5nZShwYXJhbXNbMF0pO1xuICB0aGlzLnVwZGF0ZVJhbmdlKHBhcmFtc1syXSk7XG59O1xuXG4vLyBDU0kgUG0gJyB7XG4vLyAgIFNlbGVjdCBMb2NhdG9yIEV2ZW50cyAoREVDU0xFKS5cbi8vICAgVmFsaWQgdmFsdWVzIGZvciB0aGUgZmlyc3QgKGFuZCBhbnkgYWRkaXRpb25hbCBwYXJhbWV0ZXJzKVxuLy8gICBhcmU6XG4vLyAgICAgUHMgPSAwICAtPiBvbmx5IHJlc3BvbmQgdG8gZXhwbGljaXQgaG9zdCByZXF1ZXN0cyAoREVDUlFMUCkuXG4vLyAgICAgICAgICAgICAgICAoVGhpcyBpcyBkZWZhdWx0KS4gIEl0IGFsc28gY2FuY2VscyBhbnkgZmlsdGVyXG4vLyAgIHJlY3RhbmdsZS5cbi8vICAgICBQcyA9IDEgIC0+IHJlcG9ydCBidXR0b24gZG93biB0cmFuc2l0aW9ucy5cbi8vICAgICBQcyA9IDIgIC0+IGRvIG5vdCByZXBvcnQgYnV0dG9uIGRvd24gdHJhbnNpdGlvbnMuXG4vLyAgICAgUHMgPSAzICAtPiByZXBvcnQgYnV0dG9uIHVwIHRyYW5zaXRpb25zLlxuLy8gICAgIFBzID0gNCAgLT4gZG8gbm90IHJlcG9ydCBidXR0b24gdXAgdHJhbnNpdGlvbnMuXG5UZXJtaW5hbC5wcm90b3R5cGUuc2V0TG9jYXRvckV2ZW50cyA9IGZ1bmN0aW9uKHBhcmFtcykge1xuICA7XG59O1xuXG4vLyBDU0kgUHQ7IFBsOyBQYjsgUHIkIHtcbi8vICAgU2VsZWN0aXZlIEVyYXNlIFJlY3Rhbmd1bGFyIEFyZWEgKERFQ1NFUkEpLCBWVDQwMCBhbmQgdXAuXG4vLyAgICAgUHQ7IFBsOyBQYjsgUHIgZGVub3RlcyB0aGUgcmVjdGFuZ2xlLlxuVGVybWluYWwucHJvdG90eXBlLnNlbGVjdGl2ZUVyYXNlUmVjdGFuZ2xlID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gIDtcbn07XG5cbi8vIENTSSBQcyAnIHxcbi8vICAgUmVxdWVzdCBMb2NhdG9yIFBvc2l0aW9uIChERUNSUUxQKS5cbi8vICAgVmFsaWQgdmFsdWVzIGZvciB0aGUgcGFyYW1ldGVyIGFyZTpcbi8vICAgICBQcyA9IDAgLCAxIG9yIG9taXR0ZWQgLT4gdHJhbnNtaXQgYSBzaW5nbGUgREVDTFJQIGxvY2F0b3Jcbi8vICAgICByZXBvcnQuXG5cbi8vICAgSWYgTG9jYXRvciBSZXBvcnRpbmcgaGFzIGJlZW4gZW5hYmxlZCBieSBhIERFQ0VMUiwgeHRlcm0gd2lsbFxuLy8gICByZXNwb25kIHdpdGggYSBERUNMUlAgTG9jYXRvciBSZXBvcnQuICBUaGlzIHJlcG9ydCBpcyBhbHNvXG4vLyAgIGdlbmVyYXRlZCBvbiBidXR0b24gdXAgYW5kIGRvd24gZXZlbnRzIGlmIHRoZXkgaGF2ZSBiZWVuXG4vLyAgIGVuYWJsZWQgd2l0aCBhIERFQ1NMRSwgb3Igd2hlbiB0aGUgbG9jYXRvciBpcyBkZXRlY3RlZCBvdXRzaWRlXG4vLyAgIG9mIGEgZmlsdGVyIHJlY3RhbmdsZSwgaWYgZmlsdGVyIHJlY3RhbmdsZXMgaGF2ZSBiZWVuIGVuYWJsZWRcbi8vICAgd2l0aCBhIERFQ0VGUi5cblxuLy8gICAgIC0+IENTSSBQZSA7IFBiIDsgUHIgOyBQYyA7IFBwICYgIHdcblxuLy8gICBQYXJhbWV0ZXJzIGFyZSBbZXZlbnQ7YnV0dG9uO3Jvdztjb2x1bW47cGFnZV0uXG4vLyAgIFZhbGlkIHZhbHVlcyBmb3IgdGhlIGV2ZW50OlxuLy8gICAgIFBlID0gMCAgLT4gbG9jYXRvciB1bmF2YWlsYWJsZSAtIG5vIG90aGVyIHBhcmFtZXRlcnMgc2VudC5cbi8vICAgICBQZSA9IDEgIC0+IHJlcXVlc3QgLSB4dGVybSByZWNlaXZlZCBhIERFQ1JRTFAuXG4vLyAgICAgUGUgPSAyICAtPiBsZWZ0IGJ1dHRvbiBkb3duLlxuLy8gICAgIFBlID0gMyAgLT4gbGVmdCBidXR0b24gdXAuXG4vLyAgICAgUGUgPSA0ICAtPiBtaWRkbGUgYnV0dG9uIGRvd24uXG4vLyAgICAgUGUgPSA1ICAtPiBtaWRkbGUgYnV0dG9uIHVwLlxuLy8gICAgIFBlID0gNiAgLT4gcmlnaHQgYnV0dG9uIGRvd24uXG4vLyAgICAgUGUgPSA3ICAtPiByaWdodCBidXR0b24gdXAuXG4vLyAgICAgUGUgPSA4ICAtPiBNNCBidXR0b24gZG93bi5cbi8vICAgICBQZSA9IDkgIC0+IE00IGJ1dHRvbiB1cC5cbi8vICAgICBQZSA9IDEgMCAgLT4gbG9jYXRvciBvdXRzaWRlIGZpbHRlciByZWN0YW5nbGUuXG4vLyAgIGBgYnV0dG9uJycgcGFyYW1ldGVyIGlzIGEgYml0bWFzayBpbmRpY2F0aW5nIHdoaWNoIGJ1dHRvbnMgYXJlXG4vLyAgICAgcHJlc3NlZDpcbi8vICAgICBQYiA9IDAgIDwtIG5vIGJ1dHRvbnMgZG93bi5cbi8vICAgICBQYiAmIDEgIDwtIHJpZ2h0IGJ1dHRvbiBkb3duLlxuLy8gICAgIFBiICYgMiAgPC0gbWlkZGxlIGJ1dHRvbiBkb3duLlxuLy8gICAgIFBiICYgNCAgPC0gbGVmdCBidXR0b24gZG93bi5cbi8vICAgICBQYiAmIDggIDwtIE00IGJ1dHRvbiBkb3duLlxuLy8gICBgYHJvdycnIGFuZCBgYGNvbHVtbicnIHBhcmFtZXRlcnMgYXJlIHRoZSBjb29yZGluYXRlcyBvZiB0aGVcbi8vICAgICBsb2NhdG9yIHBvc2l0aW9uIGluIHRoZSB4dGVybSB3aW5kb3csIGVuY29kZWQgYXMgQVNDSUkgZGVjaS1cbi8vICAgICBtYWwuXG4vLyAgIFRoZSBgYHBhZ2UnJyBwYXJhbWV0ZXIgaXMgbm90IHVzZWQgYnkgeHRlcm0sIGFuZCB3aWxsIGJlIG9taXQtXG4vLyAgIHRlZC5cblRlcm1pbmFsLnByb3RvdHlwZS5yZXF1ZXN0TG9jYXRvclBvc2l0aW9uID0gZnVuY3Rpb24ocGFyYW1zKSB7XG4gIDtcbn07XG5cbi8vIENTSSBQIG0gU1AgfVxuLy8gSW5zZXJ0IFAgcyBDb2x1bW4ocykgKGRlZmF1bHQgPSAxKSAoREVDSUMpLCBWVDQyMCBhbmQgdXAuXG4vLyBOT1RFOiB4dGVybSBkb2Vzbid0IGVuYWJsZSB0aGlzIGNvZGUgYnkgZGVmYXVsdC5cblRlcm1pbmFsLnByb3RvdHlwZS5pbnNlcnRDb2x1bW5zID0gZnVuY3Rpb24oKSB7XG4gIHZhciBwYXJhbSA9IHBhcmFtc1swXVxuICAgICwgbCA9IHRoaXMueWJhc2UgKyB0aGlzLnJvd3NcbiAgICAsIGNoID0gW3RoaXMuZXJhc2VBdHRyKCksICcgJ10gLy8geHRlcm0/XG4gICAgLCBpO1xuXG4gIHdoaWxlIChwYXJhbS0tKSB7XG4gICAgZm9yIChpID0gdGhpcy55YmFzZTsgaSA8IGw7IGkrKykge1xuICAgICAgdGhpcy5saW5lc1tpXS5zcGxpY2UodGhpcy54ICsgMSwgMCwgY2gpO1xuICAgICAgdGhpcy5saW5lc1tpXS5wb3AoKTtcbiAgICB9XG4gIH1cblxuICB0aGlzLm1heFJhbmdlKCk7XG59O1xuXG4vLyBDU0kgUCBtIFNQIH5cbi8vIERlbGV0ZSBQIHMgQ29sdW1uKHMpIChkZWZhdWx0ID0gMSkgKERFQ0RDKSwgVlQ0MjAgYW5kIHVwXG4vLyBOT1RFOiB4dGVybSBkb2Vzbid0IGVuYWJsZSB0aGlzIGNvZGUgYnkgZGVmYXVsdC5cblRlcm1pbmFsLnByb3RvdHlwZS5kZWxldGVDb2x1bW5zID0gZnVuY3Rpb24oKSB7XG4gIHZhciBwYXJhbSA9IHBhcmFtc1swXVxuICAgICwgbCA9IHRoaXMueWJhc2UgKyB0aGlzLnJvd3NcbiAgICAsIGNoID0gW3RoaXMuZXJhc2VBdHRyKCksICcgJ10gLy8geHRlcm0/XG4gICAgLCBpO1xuXG4gIHdoaWxlIChwYXJhbS0tKSB7XG4gICAgZm9yIChpID0gdGhpcy55YmFzZTsgaSA8IGw7IGkrKykge1xuICAgICAgdGhpcy5saW5lc1tpXS5zcGxpY2UodGhpcy54LCAxKTtcbiAgICAgIHRoaXMubGluZXNbaV0ucHVzaChjaCk7XG4gICAgfVxuICB9XG5cbiAgdGhpcy5tYXhSYW5nZSgpO1xufTtcblxuLyoqXG4gKiBQcmVmaXgvU2VsZWN0L1Zpc3VhbC9TZWFyY2ggTW9kZXNcbiAqL1xuXG5UZXJtaW5hbC5wcm90b3R5cGUuZW50ZXJQcmVmaXggPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5wcmVmaXhNb2RlID0gdHJ1ZTtcbn07XG5cblRlcm1pbmFsLnByb3RvdHlwZS5sZWF2ZVByZWZpeCA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLnByZWZpeE1vZGUgPSBmYWxzZTtcbn07XG5cblRlcm1pbmFsLnByb3RvdHlwZS5lbnRlclNlbGVjdCA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLl9yZWFsID0ge1xuICAgIHg6IHRoaXMueCxcbiAgICB5OiB0aGlzLnksXG4gICAgeWRpc3A6IHRoaXMueWRpc3AsXG4gICAgeWJhc2U6IHRoaXMueWJhc2UsXG4gICAgY3Vyc29ySGlkZGVuOiB0aGlzLmN1cnNvckhpZGRlbixcbiAgICBsaW5lczogdGhpcy5jb3B5QnVmZmVyKHRoaXMubGluZXMpLFxuICAgIHdyaXRlOiB0aGlzLndyaXRlXG4gIH07XG4gIHRoaXMud3JpdGUgPSBmdW5jdGlvbigpIHt9O1xuICB0aGlzLnNlbGVjdE1vZGUgPSB0cnVlO1xuICB0aGlzLnZpc3VhbE1vZGUgPSBmYWxzZTtcbiAgdGhpcy5jdXJzb3JIaWRkZW4gPSBmYWxzZTtcbiAgdGhpcy5yZWZyZXNoKHRoaXMueSwgdGhpcy55KTtcbn07XG5cblRlcm1pbmFsLnByb3RvdHlwZS5sZWF2ZVNlbGVjdCA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLnggPSB0aGlzLl9yZWFsLng7XG4gIHRoaXMueSA9IHRoaXMuX3JlYWwueTtcbiAgdGhpcy55ZGlzcCA9IHRoaXMuX3JlYWwueWRpc3A7XG4gIHRoaXMueWJhc2UgPSB0aGlzLl9yZWFsLnliYXNlO1xuICB0aGlzLmN1cnNvckhpZGRlbiA9IHRoaXMuX3JlYWwuY3Vyc29ySGlkZGVuO1xuICB0aGlzLmxpbmVzID0gdGhpcy5fcmVhbC5saW5lcztcbiAgdGhpcy53cml0ZSA9IHRoaXMuX3JlYWwud3JpdGU7XG4gIGRlbGV0ZSB0aGlzLl9yZWFsO1xuICB0aGlzLnNlbGVjdE1vZGUgPSBmYWxzZTtcbiAgdGhpcy52aXN1YWxNb2RlID0gZmFsc2U7XG4gIHRoaXMucmVmcmVzaCgwLCB0aGlzLnJvd3MgLSAxKTtcbn07XG5cblRlcm1pbmFsLnByb3RvdHlwZS5lbnRlclZpc3VhbCA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLl9yZWFsLnByZVZpc3VhbCA9IHRoaXMuY29weUJ1ZmZlcih0aGlzLmxpbmVzKTtcbiAgdGhpcy5zZWxlY3RUZXh0KHRoaXMueCwgdGhpcy54LCB0aGlzLnlkaXNwICsgdGhpcy55LCB0aGlzLnlkaXNwICsgdGhpcy55KTtcbiAgdGhpcy52aXN1YWxNb2RlID0gdHJ1ZTtcbn07XG5cblRlcm1pbmFsLnByb3RvdHlwZS5sZWF2ZVZpc3VhbCA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLmxpbmVzID0gdGhpcy5fcmVhbC5wcmVWaXN1YWw7XG4gIGRlbGV0ZSB0aGlzLl9yZWFsLnByZVZpc3VhbDtcbiAgZGVsZXRlIHRoaXMuX3NlbGVjdGVkO1xuICB0aGlzLnZpc3VhbE1vZGUgPSBmYWxzZTtcbiAgdGhpcy5yZWZyZXNoKDAsIHRoaXMucm93cyAtIDEpO1xufTtcblxuVGVybWluYWwucHJvdG90eXBlLmVudGVyU2VhcmNoID0gZnVuY3Rpb24oZG93bikge1xuICB0aGlzLmVudHJ5ID0gJyc7XG4gIHRoaXMuc2VhcmNoTW9kZSA9IHRydWU7XG4gIHRoaXMuc2VhcmNoRG93biA9IGRvd247XG4gIHRoaXMuX3JlYWwucHJlU2VhcmNoID0gdGhpcy5jb3B5QnVmZmVyKHRoaXMubGluZXMpO1xuICB0aGlzLl9yZWFsLnByZVNlYXJjaFggPSB0aGlzLng7XG4gIHRoaXMuX3JlYWwucHJlU2VhcmNoWSA9IHRoaXMueTtcblxuICB2YXIgYm90dG9tID0gdGhpcy55ZGlzcCArIHRoaXMucm93cyAtIDE7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5lbnRyeVByZWZpeC5sZW5ndGg7IGkrKykge1xuICAgIC8vdGhpcy5saW5lc1tib3R0b21dW2ldWzBdID0gKHRoaXMuZGVmQXR0ciAmIH4weDFmZikgfCA0O1xuICAgIC8vdGhpcy5saW5lc1tib3R0b21dW2ldWzFdID0gdGhpcy5lbnRyeVByZWZpeFtpXTtcbiAgICB0aGlzLmxpbmVzW2JvdHRvbV1baV0gPSBbXG4gICAgICAodGhpcy5kZWZBdHRyICYgfjB4MWZmKSB8IDQsXG4gICAgICB0aGlzLmVudHJ5UHJlZml4W2ldXG4gICAgXTtcbiAgfVxuXG4gIHRoaXMueSA9IHRoaXMucm93cyAtIDE7XG4gIHRoaXMueCA9IHRoaXMuZW50cnlQcmVmaXgubGVuZ3RoO1xuXG4gIHRoaXMucmVmcmVzaCh0aGlzLnJvd3MgLSAxLCB0aGlzLnJvd3MgLSAxKTtcbn07XG5cblRlcm1pbmFsLnByb3RvdHlwZS5sZWF2ZVNlYXJjaCA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLnNlYXJjaE1vZGUgPSBmYWxzZTtcblxuICBpZiAodGhpcy5fcmVhbC5wcmVTZWFyY2gpIHtcbiAgICB0aGlzLmxpbmVzID0gdGhpcy5fcmVhbC5wcmVTZWFyY2g7XG4gICAgdGhpcy54ID0gdGhpcy5fcmVhbC5wcmVTZWFyY2hYO1xuICAgIHRoaXMueSA9IHRoaXMuX3JlYWwucHJlU2VhcmNoWTtcbiAgICBkZWxldGUgdGhpcy5fcmVhbC5wcmVTZWFyY2g7XG4gICAgZGVsZXRlIHRoaXMuX3JlYWwucHJlU2VhcmNoWDtcbiAgICBkZWxldGUgdGhpcy5fcmVhbC5wcmVTZWFyY2hZO1xuICB9XG5cbiAgdGhpcy5yZWZyZXNoKHRoaXMucm93cyAtIDEsIHRoaXMucm93cyAtIDEpO1xufTtcblxuVGVybWluYWwucHJvdG90eXBlLmNvcHlCdWZmZXIgPSBmdW5jdGlvbihsaW5lcykge1xuICB2YXIgbGluZXMgPSBsaW5lcyB8fCB0aGlzLmxpbmVzXG4gICAgLCBvdXQgPSBbXTtcblxuICBmb3IgKHZhciB5ID0gMDsgeSA8IGxpbmVzLmxlbmd0aDsgeSsrKSB7XG4gICAgb3V0W3ldID0gW107XG4gICAgZm9yICh2YXIgeCA9IDA7IHggPCBsaW5lc1t5XS5sZW5ndGg7IHgrKykge1xuICAgICAgb3V0W3ldW3hdID0gW2xpbmVzW3ldW3hdWzBdLCBsaW5lc1t5XVt4XVsxXV07XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG91dDtcbn07XG5cblRlcm1pbmFsLnByb3RvdHlwZS5nZXRDb3B5VGV4dGFyZWEgPSBmdW5jdGlvbih0ZXh0KSB7XG4gIHZhciB0ZXh0YXJlYSA9IHRoaXMuX2NvcHlUZXh0YXJlYVxuICAgICwgZG9jdW1lbnQgPSB0aGlzLmRvY3VtZW50O1xuXG4gIGlmICghdGV4dGFyZWEpIHtcbiAgICB0ZXh0YXJlYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RleHRhcmVhJyk7XG4gICAgdGV4dGFyZWEuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuICAgIHRleHRhcmVhLnN0eWxlLmxlZnQgPSAnLTMyMDAwcHgnO1xuICAgIHRleHRhcmVhLnN0eWxlLnRvcCA9ICctMzIwMDBweCc7XG4gICAgdGV4dGFyZWEuc3R5bGUud2lkdGggPSAnMHB4JztcbiAgICB0ZXh0YXJlYS5zdHlsZS5oZWlnaHQgPSAnMHB4JztcbiAgICB0ZXh0YXJlYS5zdHlsZS5vcGFjaXR5ID0gJzAnO1xuICAgIHRleHRhcmVhLnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICd0cmFuc3BhcmVudCc7XG4gICAgdGV4dGFyZWEuc3R5bGUuYm9yZGVyU3R5bGUgPSAnbm9uZSc7XG4gICAgdGV4dGFyZWEuc3R5bGUub3V0bGluZVN0eWxlID0gJ25vbmUnO1xuXG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2JvZHknKVswXS5hcHBlbmRDaGlsZCh0ZXh0YXJlYSk7XG5cbiAgICB0aGlzLl9jb3B5VGV4dGFyZWEgPSB0ZXh0YXJlYTtcbiAgfVxuXG4gIHJldHVybiB0ZXh0YXJlYTtcbn07XG5cbi8vIE5PVEU6IE9ubHkgd29ya3MgZm9yIHByaW1hcnkgc2VsZWN0aW9uIG9uIFgxMS5cbi8vIE5vbi1YMTEgdXNlcnMgc2hvdWxkIHVzZSBDdHJsLUMgaW5zdGVhZC5cblRlcm1pbmFsLnByb3RvdHlwZS5jb3B5VGV4dCA9IGZ1bmN0aW9uKHRleHQpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gICAgLCB0ZXh0YXJlYSA9IHRoaXMuZ2V0Q29weVRleHRhcmVhKCk7XG5cbiAgdGhpcy5lbWl0KCdjb3B5JywgdGV4dCk7XG5cbiAgdGV4dGFyZWEuZm9jdXMoKTtcbiAgdGV4dGFyZWEudGV4dENvbnRlbnQgPSB0ZXh0O1xuICB0ZXh0YXJlYS52YWx1ZSA9IHRleHQ7XG4gIHRleHRhcmVhLnNldFNlbGVjdGlvblJhbmdlKDAsIHRleHQubGVuZ3RoKTtcblxuICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgIHNlbGYuZWxlbWVudC5mb2N1cygpO1xuICAgIHNlbGYuZm9jdXMoKTtcbiAgfSwgMSk7XG59O1xuXG5UZXJtaW5hbC5wcm90b3R5cGUuc2VsZWN0VGV4dCA9IGZ1bmN0aW9uKHgxLCB4MiwgeTEsIHkyKSB7XG4gIHZhciBveDFcbiAgICAsIG94MlxuICAgICwgb3kxXG4gICAgLCBveTJcbiAgICAsIHRtcFxuICAgICwgeFxuICAgICwgeVxuICAgICwgeGxcbiAgICAsIGF0dHI7XG5cbiAgaWYgKHRoaXMuX3NlbGVjdGVkKSB7XG4gICAgb3gxID0gdGhpcy5fc2VsZWN0ZWQueDE7XG4gICAgb3gyID0gdGhpcy5fc2VsZWN0ZWQueDI7XG4gICAgb3kxID0gdGhpcy5fc2VsZWN0ZWQueTE7XG4gICAgb3kyID0gdGhpcy5fc2VsZWN0ZWQueTI7XG5cbiAgICBpZiAob3kyIDwgb3kxKSB7XG4gICAgICB0bXAgPSBveDI7XG4gICAgICBveDIgPSBveDE7XG4gICAgICBveDEgPSB0bXA7XG4gICAgICB0bXAgPSBveTI7XG4gICAgICBveTIgPSBveTE7XG4gICAgICBveTEgPSB0bXA7XG4gICAgfVxuXG4gICAgaWYgKG94MiA8IG94MSAmJiBveTEgPT09IG95Mikge1xuICAgICAgdG1wID0gb3gyO1xuICAgICAgb3gyID0gb3gxO1xuICAgICAgb3gxID0gdG1wO1xuICAgIH1cblxuICAgIGZvciAoeSA9IG95MTsgeSA8PSBveTI7IHkrKykge1xuICAgICAgeCA9IDA7XG4gICAgICB4bCA9IHRoaXMuY29scyAtIDE7XG4gICAgICBpZiAoeSA9PT0gb3kxKSB7XG4gICAgICAgIHggPSBveDE7XG4gICAgICB9XG4gICAgICBpZiAoeSA9PT0gb3kyKSB7XG4gICAgICAgIHhsID0gb3gyO1xuICAgICAgfVxuICAgICAgZm9yICg7IHggPD0geGw7IHgrKykge1xuICAgICAgICBpZiAodGhpcy5saW5lc1t5XVt4XS5vbGQgIT0gbnVsbCkge1xuICAgICAgICAgIC8vdGhpcy5saW5lc1t5XVt4XVswXSA9IHRoaXMubGluZXNbeV1beF0ub2xkO1xuICAgICAgICAgIC8vZGVsZXRlIHRoaXMubGluZXNbeV1beF0ub2xkO1xuICAgICAgICAgIGF0dHIgPSB0aGlzLmxpbmVzW3ldW3hdLm9sZDtcbiAgICAgICAgICBkZWxldGUgdGhpcy5saW5lc1t5XVt4XS5vbGQ7XG4gICAgICAgICAgdGhpcy5saW5lc1t5XVt4XSA9IFthdHRyLCB0aGlzLmxpbmVzW3ldW3hdWzFdXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHkxID0gdGhpcy5fc2VsZWN0ZWQueTE7XG4gICAgeDEgPSB0aGlzLl9zZWxlY3RlZC54MTtcbiAgfVxuXG4gIHkxID0gTWF0aC5tYXgoeTEsIDApO1xuICB5MSA9IE1hdGgubWluKHkxLCB0aGlzLnlkaXNwICsgdGhpcy5yb3dzIC0gMSk7XG5cbiAgeTIgPSBNYXRoLm1heCh5MiwgMCk7XG4gIHkyID0gTWF0aC5taW4oeTIsIHRoaXMueWRpc3AgKyB0aGlzLnJvd3MgLSAxKTtcblxuICB0aGlzLl9zZWxlY3RlZCA9IHsgeDE6IHgxLCB4MjogeDIsIHkxOiB5MSwgeTI6IHkyIH07XG5cbiAgaWYgKHkyIDwgeTEpIHtcbiAgICB0bXAgPSB4MjtcbiAgICB4MiA9IHgxO1xuICAgIHgxID0gdG1wO1xuICAgIHRtcCA9IHkyO1xuICAgIHkyID0geTE7XG4gICAgeTEgPSB0bXA7XG4gIH1cblxuICBpZiAoeDIgPCB4MSAmJiB5MSA9PT0geTIpIHtcbiAgICB0bXAgPSB4MjtcbiAgICB4MiA9IHgxO1xuICAgIHgxID0gdG1wO1xuICB9XG5cbiAgZm9yICh5ID0geTE7IHkgPD0geTI7IHkrKykge1xuICAgIHggPSAwO1xuICAgIHhsID0gdGhpcy5jb2xzIC0gMTtcbiAgICBpZiAoeSA9PT0geTEpIHtcbiAgICAgIHggPSB4MTtcbiAgICB9XG4gICAgaWYgKHkgPT09IHkyKSB7XG4gICAgICB4bCA9IHgyO1xuICAgIH1cbiAgICBmb3IgKDsgeCA8PSB4bDsgeCsrKSB7XG4gICAgICAvL3RoaXMubGluZXNbeV1beF0ub2xkID0gdGhpcy5saW5lc1t5XVt4XVswXTtcbiAgICAgIC8vdGhpcy5saW5lc1t5XVt4XVswXSAmPSB+MHgxZmY7XG4gICAgICAvL3RoaXMubGluZXNbeV1beF1bMF0gfD0gKDB4MWZmIDw8IDkpIHwgNDtcbiAgICAgIGF0dHIgPSB0aGlzLmxpbmVzW3ldW3hdWzBdO1xuICAgICAgdGhpcy5saW5lc1t5XVt4XSA9IFtcbiAgICAgICAgKGF0dHIgJiB+MHgxZmYpIHwgKCgweDFmZiA8PCA5KSB8IDQpLFxuICAgICAgICB0aGlzLmxpbmVzW3ldW3hdWzFdXG4gICAgICBdO1xuICAgICAgdGhpcy5saW5lc1t5XVt4XS5vbGQgPSBhdHRyO1xuICAgIH1cbiAgfVxuXG4gIHkxID0geTEgLSB0aGlzLnlkaXNwO1xuICB5MiA9IHkyIC0gdGhpcy55ZGlzcDtcblxuICB5MSA9IE1hdGgubWF4KHkxLCAwKTtcbiAgeTEgPSBNYXRoLm1pbih5MSwgdGhpcy5yb3dzIC0gMSk7XG5cbiAgeTIgPSBNYXRoLm1heCh5MiwgMCk7XG4gIHkyID0gTWF0aC5taW4oeTIsIHRoaXMucm93cyAtIDEpO1xuXG4gIC8vdGhpcy5yZWZyZXNoKHkxLCB5Mik7XG4gIHRoaXMucmVmcmVzaCgwLCB0aGlzLnJvd3MgLSAxKTtcbn07XG5cblRlcm1pbmFsLnByb3RvdHlwZS5ncmFiVGV4dCA9IGZ1bmN0aW9uKHgxLCB4MiwgeTEsIHkyKSB7XG4gIHZhciBvdXQgPSAnJ1xuICAgICwgYnVmID0gJydcbiAgICAsIGNoXG4gICAgLCB4XG4gICAgLCB5XG4gICAgLCB4bFxuICAgICwgdG1wO1xuXG4gIGlmICh5MiA8IHkxKSB7XG4gICAgdG1wID0geDI7XG4gICAgeDIgPSB4MTtcbiAgICB4MSA9IHRtcDtcbiAgICB0bXAgPSB5MjtcbiAgICB5MiA9IHkxO1xuICAgIHkxID0gdG1wO1xuICB9XG5cbiAgaWYgKHgyIDwgeDEgJiYgeTEgPT09IHkyKSB7XG4gICAgdG1wID0geDI7XG4gICAgeDIgPSB4MTtcbiAgICB4MSA9IHRtcDtcbiAgfVxuXG4gIGZvciAoeSA9IHkxOyB5IDw9IHkyOyB5KyspIHtcbiAgICB4ID0gMDtcbiAgICB4bCA9IHRoaXMuY29scyAtIDE7XG4gICAgaWYgKHkgPT09IHkxKSB7XG4gICAgICB4ID0geDE7XG4gICAgfVxuICAgIGlmICh5ID09PSB5Mikge1xuICAgICAgeGwgPSB4MjtcbiAgICB9XG4gICAgZm9yICg7IHggPD0geGw7IHgrKykge1xuICAgICAgY2ggPSB0aGlzLmxpbmVzW3ldW3hdWzFdO1xuICAgICAgaWYgKGNoID09PSAnICcpIHtcbiAgICAgICAgYnVmICs9IGNoO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmIChidWYpIHtcbiAgICAgICAgb3V0ICs9IGJ1ZjtcbiAgICAgICAgYnVmID0gJyc7XG4gICAgICB9XG4gICAgICBvdXQgKz0gY2g7XG4gICAgICBpZiAoaXNXaWRlKGNoKSkgeCsrO1xuICAgIH1cbiAgICBidWYgPSAnJztcbiAgICBvdXQgKz0gJ1xcbic7XG4gIH1cblxuICAvLyBJZiB3ZSdyZSBub3QgYXQgdGhlIGVuZCBvZiB0aGVcbiAgLy8gbGluZSwgZG9uJ3QgYWRkIGEgbmV3bGluZS5cbiAgZm9yICh4ID0geDIsIHkgPSB5MjsgeCA8IHRoaXMuY29sczsgeCsrKSB7XG4gICAgaWYgKHRoaXMubGluZXNbeV1beF1bMV0gIT09ICcgJykge1xuICAgICAgb3V0ID0gb3V0LnNsaWNlKDAsIC0xKTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBvdXQ7XG59O1xuXG5UZXJtaW5hbC5wcm90b3R5cGUua2V5UHJlZml4ID0gZnVuY3Rpb24oZXYsIGtleSkge1xuICBpZiAoa2V5ID09PSAnaycgfHwga2V5ID09PSAnJicpIHtcbiAgICB0aGlzLmRlc3Ryb3koKTtcbiAgfSBlbHNlIGlmIChrZXkgPT09ICdwJyB8fCBrZXkgPT09ICddJykge1xuICAgIHRoaXMuZW1pdCgncmVxdWVzdCBwYXN0ZScpO1xuICB9IGVsc2UgaWYgKGtleSA9PT0gJ2MnKSB7XG4gICAgdGhpcy5lbWl0KCdyZXF1ZXN0IGNyZWF0ZScpO1xuICB9IGVsc2UgaWYgKGtleSA+PSAnMCcgJiYga2V5IDw9ICc5Jykge1xuICAgIGtleSA9ICtrZXkgLSAxO1xuICAgIGlmICghfmtleSkga2V5ID0gOTtcbiAgICB0aGlzLmVtaXQoJ3JlcXVlc3QgdGVybScsIGtleSk7XG4gIH0gZWxzZSBpZiAoa2V5ID09PSAnbicpIHtcbiAgICB0aGlzLmVtaXQoJ3JlcXVlc3QgdGVybSBuZXh0Jyk7XG4gIH0gZWxzZSBpZiAoa2V5ID09PSAnUCcpIHtcbiAgICB0aGlzLmVtaXQoJ3JlcXVlc3QgdGVybSBwcmV2aW91cycpO1xuICB9IGVsc2UgaWYgKGtleSA9PT0gJzonKSB7XG4gICAgdGhpcy5lbWl0KCdyZXF1ZXN0IGNvbW1hbmQgbW9kZScpO1xuICB9IGVsc2UgaWYgKGtleSA9PT0gJ1snKSB7XG4gICAgdGhpcy5lbnRlclNlbGVjdCgpO1xuICB9XG59O1xuXG5UZXJtaW5hbC5wcm90b3R5cGUua2V5U2VsZWN0ID0gZnVuY3Rpb24oZXYsIGtleSkge1xuICB0aGlzLnNob3dDdXJzb3IoKTtcblxuICBpZiAodGhpcy5zZWFyY2hNb2RlIHx8IGtleSA9PT0gJ24nIHx8IGtleSA9PT0gJ04nKSB7XG4gICAgcmV0dXJuIHRoaXMua2V5U2VhcmNoKGV2LCBrZXkpO1xuICB9XG5cbiAgaWYgKGtleSA9PT0gJ1xceDA0JykgeyAvLyBjdHJsLWRcbiAgICB2YXIgeSA9IHRoaXMueWRpc3AgKyB0aGlzLnk7XG4gICAgaWYgKHRoaXMueWRpc3AgPT09IHRoaXMueWJhc2UpIHtcbiAgICAgIC8vIE1pbWljIHZpbSBiZWhhdmlvclxuICAgICAgdGhpcy55ID0gTWF0aC5taW4odGhpcy55ICsgKHRoaXMucm93cyAtIDEpIC8gMiB8IDAsIHRoaXMucm93cyAtIDEpO1xuICAgICAgdGhpcy5yZWZyZXNoKDAsIHRoaXMucm93cyAtIDEpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnNjcm9sbERpc3AoKHRoaXMucm93cyAtIDEpIC8gMiB8IDApO1xuICAgIH1cbiAgICBpZiAodGhpcy52aXN1YWxNb2RlKSB7XG4gICAgICB0aGlzLnNlbGVjdFRleHQodGhpcy54LCB0aGlzLngsIHksIHRoaXMueWRpc3AgKyB0aGlzLnkpO1xuICAgIH1cbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoa2V5ID09PSAnXFx4MTUnKSB7IC8vIGN0cmwtdVxuICAgIHZhciB5ID0gdGhpcy55ZGlzcCArIHRoaXMueTtcbiAgICBpZiAodGhpcy55ZGlzcCA9PT0gMCkge1xuICAgICAgLy8gTWltaWMgdmltIGJlaGF2aW9yXG4gICAgICB0aGlzLnkgPSBNYXRoLm1heCh0aGlzLnkgLSAodGhpcy5yb3dzIC0gMSkgLyAyIHwgMCwgMCk7XG4gICAgICB0aGlzLnJlZnJlc2goMCwgdGhpcy5yb3dzIC0gMSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuc2Nyb2xsRGlzcCgtKHRoaXMucm93cyAtIDEpIC8gMiB8IDApO1xuICAgIH1cbiAgICBpZiAodGhpcy52aXN1YWxNb2RlKSB7XG4gICAgICB0aGlzLnNlbGVjdFRleHQodGhpcy54LCB0aGlzLngsIHksIHRoaXMueWRpc3AgKyB0aGlzLnkpO1xuICAgIH1cbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoa2V5ID09PSAnXFx4MDYnKSB7IC8vIGN0cmwtZlxuICAgIHZhciB5ID0gdGhpcy55ZGlzcCArIHRoaXMueTtcbiAgICB0aGlzLnNjcm9sbERpc3AodGhpcy5yb3dzIC0gMSk7XG4gICAgaWYgKHRoaXMudmlzdWFsTW9kZSkge1xuICAgICAgdGhpcy5zZWxlY3RUZXh0KHRoaXMueCwgdGhpcy54LCB5LCB0aGlzLnlkaXNwICsgdGhpcy55KTtcbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKGtleSA9PT0gJ1xceDAyJykgeyAvLyBjdHJsLWJcbiAgICB2YXIgeSA9IHRoaXMueWRpc3AgKyB0aGlzLnk7XG4gICAgdGhpcy5zY3JvbGxEaXNwKC0odGhpcy5yb3dzIC0gMSkpO1xuICAgIGlmICh0aGlzLnZpc3VhbE1vZGUpIHtcbiAgICAgIHRoaXMuc2VsZWN0VGV4dCh0aGlzLngsIHRoaXMueCwgeSwgdGhpcy55ZGlzcCArIHRoaXMueSk7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChrZXkgPT09ICdrJyB8fCBrZXkgPT09ICdcXHgxYltBJykge1xuICAgIHZhciB5ID0gdGhpcy55ZGlzcCArIHRoaXMueTtcbiAgICB0aGlzLnktLTtcbiAgICBpZiAodGhpcy55IDwgMCkge1xuICAgICAgdGhpcy55ID0gMDtcbiAgICAgIHRoaXMuc2Nyb2xsRGlzcCgtMSk7XG4gICAgfVxuICAgIGlmICh0aGlzLnZpc3VhbE1vZGUpIHtcbiAgICAgIHRoaXMuc2VsZWN0VGV4dCh0aGlzLngsIHRoaXMueCwgeSwgdGhpcy55ZGlzcCArIHRoaXMueSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMucmVmcmVzaCh0aGlzLnksIHRoaXMueSArIDEpO1xuICAgIH1cbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoa2V5ID09PSAnaicgfHwga2V5ID09PSAnXFx4MWJbQicpIHtcbiAgICB2YXIgeSA9IHRoaXMueWRpc3AgKyB0aGlzLnk7XG4gICAgdGhpcy55Kys7XG4gICAgaWYgKHRoaXMueSA+PSB0aGlzLnJvd3MpIHtcbiAgICAgIHRoaXMueSA9IHRoaXMucm93cyAtIDE7XG4gICAgICB0aGlzLnNjcm9sbERpc3AoMSk7XG4gICAgfVxuICAgIGlmICh0aGlzLnZpc3VhbE1vZGUpIHtcbiAgICAgIHRoaXMuc2VsZWN0VGV4dCh0aGlzLngsIHRoaXMueCwgeSwgdGhpcy55ZGlzcCArIHRoaXMueSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMucmVmcmVzaCh0aGlzLnkgLSAxLCB0aGlzLnkpO1xuICAgIH1cbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoa2V5ID09PSAnaCcgfHwga2V5ID09PSAnXFx4MWJbRCcpIHtcbiAgICB2YXIgeCA9IHRoaXMueDtcbiAgICB0aGlzLngtLTtcbiAgICBpZiAodGhpcy54IDwgMCkge1xuICAgICAgdGhpcy54ID0gMDtcbiAgICB9XG4gICAgaWYgKHRoaXMudmlzdWFsTW9kZSkge1xuICAgICAgdGhpcy5zZWxlY3RUZXh0KHgsIHRoaXMueCwgdGhpcy55ZGlzcCArIHRoaXMueSwgdGhpcy55ZGlzcCArIHRoaXMueSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMucmVmcmVzaCh0aGlzLnksIHRoaXMueSk7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChrZXkgPT09ICdsJyB8fCBrZXkgPT09ICdcXHgxYltDJykge1xuICAgIHZhciB4ID0gdGhpcy54O1xuICAgIHRoaXMueCsrO1xuICAgIGlmICh0aGlzLnggPj0gdGhpcy5jb2xzKSB7XG4gICAgICB0aGlzLnggPSB0aGlzLmNvbHMgLSAxO1xuICAgIH1cbiAgICBpZiAodGhpcy52aXN1YWxNb2RlKSB7XG4gICAgICB0aGlzLnNlbGVjdFRleHQoeCwgdGhpcy54LCB0aGlzLnlkaXNwICsgdGhpcy55LCB0aGlzLnlkaXNwICsgdGhpcy55KTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5yZWZyZXNoKHRoaXMueSwgdGhpcy55KTtcbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKGtleSA9PT0gJ3YnIHx8IGtleSA9PT0gJyAnKSB7XG4gICAgaWYgKCF0aGlzLnZpc3VhbE1vZGUpIHtcbiAgICAgIHRoaXMuZW50ZXJWaXN1YWwoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5sZWF2ZVZpc3VhbCgpO1xuICAgIH1cbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoa2V5ID09PSAneScpIHtcbiAgICBpZiAodGhpcy52aXN1YWxNb2RlKSB7XG4gICAgICB2YXIgdGV4dCA9IHRoaXMuZ3JhYlRleHQoXG4gICAgICAgIHRoaXMuX3NlbGVjdGVkLngxLCB0aGlzLl9zZWxlY3RlZC54MixcbiAgICAgICAgdGhpcy5fc2VsZWN0ZWQueTEsIHRoaXMuX3NlbGVjdGVkLnkyKTtcbiAgICAgIHRoaXMuY29weVRleHQodGV4dCk7XG4gICAgICB0aGlzLmxlYXZlVmlzdWFsKCk7XG4gICAgICAvLyB0aGlzLmxlYXZlU2VsZWN0KCk7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChrZXkgPT09ICdxJyB8fCBrZXkgPT09ICdcXHgxYicpIHtcbiAgICBpZiAodGhpcy52aXN1YWxNb2RlKSB7XG4gICAgICB0aGlzLmxlYXZlVmlzdWFsKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMubGVhdmVTZWxlY3QoKTtcbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKGtleSA9PT0gJ3cnIHx8IGtleSA9PT0gJ1cnKSB7XG4gICAgdmFyIG94ID0gdGhpcy54O1xuICAgIHZhciBveSA9IHRoaXMueTtcbiAgICB2YXIgb3lkID0gdGhpcy55ZGlzcDtcblxuICAgIHZhciB4ID0gdGhpcy54O1xuICAgIHZhciB5ID0gdGhpcy55O1xuICAgIHZhciB5YiA9IHRoaXMueWRpc3A7XG4gICAgdmFyIHNhd19zcGFjZSA9IGZhbHNlO1xuXG4gICAgZm9yICg7Oykge1xuICAgICAgdmFyIGxpbmUgPSB0aGlzLmxpbmVzW3liICsgeV07XG4gICAgICB3aGlsZSAoeCA8IHRoaXMuY29scykge1xuICAgICAgICBpZiAobGluZVt4XVsxXSA8PSAnICcpIHtcbiAgICAgICAgICBzYXdfc3BhY2UgPSB0cnVlO1xuICAgICAgICB9IGVsc2UgaWYgKHNhd19zcGFjZSkge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIHgrKztcbiAgICAgIH1cbiAgICAgIGlmICh4ID49IHRoaXMuY29scykgeCA9IHRoaXMuY29scyAtIDE7XG4gICAgICBpZiAoeCA9PT0gdGhpcy5jb2xzIC0gMSAmJiBsaW5lW3hdWzFdIDw9ICcgJykge1xuICAgICAgICB4ID0gMDtcbiAgICAgICAgaWYgKCsreSA+PSB0aGlzLnJvd3MpIHtcbiAgICAgICAgICB5LS07XG4gICAgICAgICAgaWYgKCsreWIgPiB0aGlzLnliYXNlKSB7XG4gICAgICAgICAgICB5YiA9IHRoaXMueWJhc2U7XG4gICAgICAgICAgICB4ID0gdGhpcy54O1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgdGhpcy54ID0geCwgdGhpcy55ID0geTtcbiAgICB0aGlzLnNjcm9sbERpc3AoLXRoaXMueWRpc3AgKyB5Yik7XG5cbiAgICBpZiAodGhpcy52aXN1YWxNb2RlKSB7XG4gICAgICB0aGlzLnNlbGVjdFRleHQob3gsIHRoaXMueCwgb3kgKyBveWQsIHRoaXMueWRpc3AgKyB0aGlzLnkpO1xuICAgIH1cbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoa2V5ID09PSAnYicgfHwga2V5ID09PSAnQicpIHtcbiAgICB2YXIgb3ggPSB0aGlzLng7XG4gICAgdmFyIG95ID0gdGhpcy55O1xuICAgIHZhciBveWQgPSB0aGlzLnlkaXNwO1xuXG4gICAgdmFyIHggPSB0aGlzLng7XG4gICAgdmFyIHkgPSB0aGlzLnk7XG4gICAgdmFyIHliID0gdGhpcy55ZGlzcDtcblxuICAgIGZvciAoOzspIHtcbiAgICAgIHZhciBsaW5lID0gdGhpcy5saW5lc1t5YiArIHldO1xuICAgICAgdmFyIHNhd19zcGFjZSA9IHggPiAwICYmIGxpbmVbeF1bMV0gPiAnICcgJiYgbGluZVt4IC0gMV1bMV0gPiAnICc7XG4gICAgICB3aGlsZSAoeCA+PSAwKSB7XG4gICAgICAgIGlmIChsaW5lW3hdWzFdIDw9ICcgJykge1xuICAgICAgICAgIGlmIChzYXdfc3BhY2UgJiYgKHggKyAxIDwgdGhpcy5jb2xzICYmIGxpbmVbeCArIDFdWzFdID4gJyAnKSkge1xuICAgICAgICAgICAgeCsrO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNhd19zcGFjZSA9IHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHgtLTtcbiAgICAgIH1cbiAgICAgIGlmICh4IDwgMCkgeCA9IDA7XG4gICAgICBpZiAoeCA9PT0gMCAmJiAobGluZVt4XVsxXSA8PSAnICcgfHwgIXNhd19zcGFjZSkpIHtcbiAgICAgICAgeCA9IHRoaXMuY29scyAtIDE7XG4gICAgICAgIGlmICgtLXkgPCAwKSB7XG4gICAgICAgICAgeSsrO1xuICAgICAgICAgIGlmICgtLXliIDwgMCkge1xuICAgICAgICAgICAgeWIrKztcbiAgICAgICAgICAgIHggPSAwO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgdGhpcy54ID0geCwgdGhpcy55ID0geTtcbiAgICB0aGlzLnNjcm9sbERpc3AoLXRoaXMueWRpc3AgKyB5Yik7XG5cbiAgICBpZiAodGhpcy52aXN1YWxNb2RlKSB7XG4gICAgICB0aGlzLnNlbGVjdFRleHQob3gsIHRoaXMueCwgb3kgKyBveWQsIHRoaXMueWRpc3AgKyB0aGlzLnkpO1xuICAgIH1cbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoa2V5ID09PSAnZScgfHwga2V5ID09PSAnRScpIHtcbiAgICB2YXIgeCA9IHRoaXMueCArIDE7XG4gICAgdmFyIHkgPSB0aGlzLnk7XG4gICAgdmFyIHliID0gdGhpcy55ZGlzcDtcbiAgICBpZiAoeCA+PSB0aGlzLmNvbHMpIHgtLTtcblxuICAgIGZvciAoOzspIHtcbiAgICAgIHZhciBsaW5lID0gdGhpcy5saW5lc1t5YiArIHldO1xuICAgICAgd2hpbGUgKHggPCB0aGlzLmNvbHMpIHtcbiAgICAgICAgaWYgKGxpbmVbeF1bMV0gPD0gJyAnKSB7XG4gICAgICAgICAgeCsrO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICB3aGlsZSAoeCA8IHRoaXMuY29scykge1xuICAgICAgICBpZiAobGluZVt4XVsxXSA8PSAnICcpIHtcbiAgICAgICAgICBpZiAoeCAtIDEgPj0gMCAmJiBsaW5lW3ggLSAxXVsxXSA+ICcgJykge1xuICAgICAgICAgICAgeC0tO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHgrKztcbiAgICAgIH1cbiAgICAgIGlmICh4ID49IHRoaXMuY29scykgeCA9IHRoaXMuY29scyAtIDE7XG4gICAgICBpZiAoeCA9PT0gdGhpcy5jb2xzIC0gMSAmJiBsaW5lW3hdWzFdIDw9ICcgJykge1xuICAgICAgICB4ID0gMDtcbiAgICAgICAgaWYgKCsreSA+PSB0aGlzLnJvd3MpIHtcbiAgICAgICAgICB5LS07XG4gICAgICAgICAgaWYgKCsreWIgPiB0aGlzLnliYXNlKSB7XG4gICAgICAgICAgICB5YiA9IHRoaXMueWJhc2U7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICB0aGlzLnggPSB4LCB0aGlzLnkgPSB5O1xuICAgIHRoaXMuc2Nyb2xsRGlzcCgtdGhpcy55ZGlzcCArIHliKTtcblxuICAgIGlmICh0aGlzLnZpc3VhbE1vZGUpIHtcbiAgICAgIHRoaXMuc2VsZWN0VGV4dChveCwgdGhpcy54LCBveSArIG95ZCwgdGhpcy55ZGlzcCArIHRoaXMueSk7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChrZXkgPT09ICdeJyB8fCBrZXkgPT09ICcwJykge1xuICAgIHZhciBveCA9IHRoaXMueDtcblxuICAgIGlmIChrZXkgPT09ICcwJykge1xuICAgICAgdGhpcy54ID0gMDtcbiAgICB9IGVsc2UgaWYgKGtleSA9PT0gJ14nKSB7XG4gICAgICB2YXIgbGluZSA9IHRoaXMubGluZXNbdGhpcy55ZGlzcCArIHRoaXMueV07XG4gICAgICB2YXIgeCA9IDA7XG4gICAgICB3aGlsZSAoeCA8IHRoaXMuY29scykge1xuICAgICAgICBpZiAobGluZVt4XVsxXSA+ICcgJykge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIHgrKztcbiAgICAgIH1cbiAgICAgIGlmICh4ID49IHRoaXMuY29scykgeCA9IHRoaXMuY29scyAtIDE7XG4gICAgICB0aGlzLnggPSB4O1xuICAgIH1cblxuICAgIGlmICh0aGlzLnZpc3VhbE1vZGUpIHtcbiAgICAgIHRoaXMuc2VsZWN0VGV4dChveCwgdGhpcy54LCB0aGlzLnlkaXNwICsgdGhpcy55LCB0aGlzLnlkaXNwICsgdGhpcy55KTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5yZWZyZXNoKHRoaXMueSwgdGhpcy55KTtcbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKGtleSA9PT0gJyQnKSB7XG4gICAgdmFyIG94ID0gdGhpcy54O1xuICAgIHZhciBsaW5lID0gdGhpcy5saW5lc1t0aGlzLnlkaXNwICsgdGhpcy55XTtcbiAgICB2YXIgeCA9IHRoaXMuY29scyAtIDE7XG4gICAgd2hpbGUgKHggPj0gMCkge1xuICAgICAgaWYgKGxpbmVbeF1bMV0gPiAnICcpIHtcbiAgICAgICAgaWYgKHRoaXMudmlzdWFsTW9kZSAmJiB4IDwgdGhpcy5jb2xzIC0gMSkgeCsrO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIHgtLTtcbiAgICB9XG4gICAgaWYgKHggPCAwKSB4ID0gMDtcbiAgICB0aGlzLnggPSB4O1xuICAgIGlmICh0aGlzLnZpc3VhbE1vZGUpIHtcbiAgICAgIHRoaXMuc2VsZWN0VGV4dChveCwgdGhpcy54LCB0aGlzLnlkaXNwICsgdGhpcy55LCB0aGlzLnlkaXNwICsgdGhpcy55KTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5yZWZyZXNoKHRoaXMueSwgdGhpcy55KTtcbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKGtleSA9PT0gJ2cnIHx8IGtleSA9PT0gJ0cnKSB7XG4gICAgdmFyIG94ID0gdGhpcy54O1xuICAgIHZhciBveSA9IHRoaXMueTtcbiAgICB2YXIgb3lkID0gdGhpcy55ZGlzcDtcbiAgICBpZiAoa2V5ID09PSAnZycpIHtcbiAgICAgIHRoaXMueCA9IDAsIHRoaXMueSA9IDA7XG4gICAgICB0aGlzLnNjcm9sbERpc3AoLXRoaXMueWRpc3ApO1xuICAgIH0gZWxzZSBpZiAoa2V5ID09PSAnRycpIHtcbiAgICAgIHRoaXMueCA9IDAsIHRoaXMueSA9IHRoaXMucm93cyAtIDE7XG4gICAgICB0aGlzLnNjcm9sbERpc3AodGhpcy55YmFzZSk7XG4gICAgfVxuICAgIGlmICh0aGlzLnZpc3VhbE1vZGUpIHtcbiAgICAgIHRoaXMuc2VsZWN0VGV4dChveCwgdGhpcy54LCBveSArIG95ZCwgdGhpcy55ZGlzcCArIHRoaXMueSk7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChrZXkgPT09ICdIJyB8fCBrZXkgPT09ICdNJyB8fCBrZXkgPT09ICdMJykge1xuICAgIHZhciBveCA9IHRoaXMueDtcbiAgICB2YXIgb3kgPSB0aGlzLnk7XG4gICAgaWYgKGtleSA9PT0gJ0gnKSB7XG4gICAgICB0aGlzLnggPSAwLCB0aGlzLnkgPSAwO1xuICAgIH0gZWxzZSBpZiAoa2V5ID09PSAnTScpIHtcbiAgICAgIHRoaXMueCA9IDAsIHRoaXMueSA9IHRoaXMucm93cyAvIDIgfCAwO1xuICAgIH0gZWxzZSBpZiAoa2V5ID09PSAnTCcpIHtcbiAgICAgIHRoaXMueCA9IDAsIHRoaXMueSA9IHRoaXMucm93cyAtIDE7XG4gICAgfVxuICAgIGlmICh0aGlzLnZpc3VhbE1vZGUpIHtcbiAgICAgIHRoaXMuc2VsZWN0VGV4dChveCwgdGhpcy54LCB0aGlzLnlkaXNwICsgb3ksIHRoaXMueWRpc3AgKyB0aGlzLnkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnJlZnJlc2gob3ksIG95KTtcbiAgICAgIHRoaXMucmVmcmVzaCh0aGlzLnksIHRoaXMueSk7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChrZXkgPT09ICd7JyB8fCBrZXkgPT09ICd9Jykge1xuICAgIHZhciBveCA9IHRoaXMueDtcbiAgICB2YXIgb3kgPSB0aGlzLnk7XG4gICAgdmFyIG95ZCA9IHRoaXMueWRpc3A7XG5cbiAgICB2YXIgbGluZTtcbiAgICB2YXIgc2F3X2Z1bGwgPSBmYWxzZTtcbiAgICB2YXIgZm91bmQgPSBmYWxzZTtcbiAgICB2YXIgZmlyc3RfaXNfc3BhY2UgPSAtMTtcbiAgICB2YXIgeSA9IHRoaXMueSArIChrZXkgPT09ICd7JyA/IC0xIDogMSk7XG4gICAgdmFyIHliID0gdGhpcy55ZGlzcDtcbiAgICB2YXIgaTtcblxuICAgIGlmIChrZXkgPT09ICd7Jykge1xuICAgICAgaWYgKHkgPCAwKSB7XG4gICAgICAgIHkrKztcbiAgICAgICAgaWYgKHliID4gMCkgeWItLTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGtleSA9PT0gJ30nKSB7XG4gICAgICBpZiAoeSA+PSB0aGlzLnJvd3MpIHtcbiAgICAgICAgeS0tO1xuICAgICAgICBpZiAoeWIgPCB0aGlzLnliYXNlKSB5YisrO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoOzspIHtcbiAgICAgIGxpbmUgPSB0aGlzLmxpbmVzW3liICsgeV07XG5cbiAgICAgIGZvciAoaSA9IDA7IGkgPCB0aGlzLmNvbHM7IGkrKykge1xuICAgICAgICBpZiAobGluZVtpXVsxXSA+ICcgJykge1xuICAgICAgICAgIGlmIChmaXJzdF9pc19zcGFjZSA9PT0gLTEpIHtcbiAgICAgICAgICAgIGZpcnN0X2lzX3NwYWNlID0gMDtcbiAgICAgICAgICB9XG4gICAgICAgICAgc2F3X2Z1bGwgPSB0cnVlO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9IGVsc2UgaWYgKGkgPT09IHRoaXMuY29scyAtIDEpIHtcbiAgICAgICAgICBpZiAoZmlyc3RfaXNfc3BhY2UgPT09IC0xKSB7XG4gICAgICAgICAgICBmaXJzdF9pc19zcGFjZSA9IDE7XG4gICAgICAgICAgfSBlbHNlIGlmIChmaXJzdF9pc19zcGFjZSA9PT0gMCkge1xuICAgICAgICAgICAgZm91bmQgPSB0cnVlO1xuICAgICAgICAgIH0gZWxzZSBpZiAoZmlyc3RfaXNfc3BhY2UgPT09IDEpIHtcbiAgICAgICAgICAgIGlmIChzYXdfZnVsbCkgZm91bmQgPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoZm91bmQpIGJyZWFrO1xuXG4gICAgICBpZiAoa2V5ID09PSAneycpIHtcbiAgICAgICAgeS0tO1xuICAgICAgICBpZiAoeSA8IDApIHtcbiAgICAgICAgICB5Kys7XG4gICAgICAgICAgaWYgKHliID4gMCkgeWItLTtcbiAgICAgICAgICBlbHNlIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGtleSA9PT0gJ30nKSB7XG4gICAgICAgIHkrKztcbiAgICAgICAgaWYgKHkgPj0gdGhpcy5yb3dzKSB7XG4gICAgICAgICAgeS0tO1xuICAgICAgICAgIGlmICh5YiA8IHRoaXMueWJhc2UpIHliKys7XG4gICAgICAgICAgZWxzZSBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmICghZm91bmQpIHtcbiAgICAgIGlmIChrZXkgPT09ICd7Jykge1xuICAgICAgICB5ID0gMDtcbiAgICAgICAgeWIgPSAwO1xuICAgICAgfSBlbHNlIGlmIChrZXkgPT09ICd9Jykge1xuICAgICAgICB5ID0gdGhpcy5yb3dzIC0gMTtcbiAgICAgICAgeWIgPSB0aGlzLnliYXNlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMueCA9IDAsIHRoaXMueSA9IHk7XG4gICAgdGhpcy5zY3JvbGxEaXNwKC10aGlzLnlkaXNwICsgeWIpO1xuXG4gICAgaWYgKHRoaXMudmlzdWFsTW9kZSkge1xuICAgICAgdGhpcy5zZWxlY3RUZXh0KG94LCB0aGlzLngsIG95ICsgb3lkLCB0aGlzLnlkaXNwICsgdGhpcy55KTtcbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKGtleSA9PT0gJy8nIHx8IGtleSA9PT0gJz8nKSB7XG4gICAgaWYgKCF0aGlzLnZpc3VhbE1vZGUpIHtcbiAgICAgIHRoaXMuZW50ZXJTZWFyY2goa2V5ID09PSAnLycpO1xuICAgIH1cbiAgICByZXR1cm47XG4gIH1cblxuICByZXR1cm4gZmFsc2U7XG59O1xuXG5UZXJtaW5hbC5wcm90b3R5cGUua2V5U2VhcmNoID0gZnVuY3Rpb24oZXYsIGtleSkge1xuICBpZiAoa2V5ID09PSAnXFx4MWInKSB7XG4gICAgdGhpcy5sZWF2ZVNlYXJjaCgpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChrZXkgPT09ICdcXHInIHx8ICghdGhpcy5zZWFyY2hNb2RlICYmIChrZXkgPT09ICduJyB8fCBrZXkgPT09ICdOJykpKSB7XG4gICAgdGhpcy5sZWF2ZVNlYXJjaCgpO1xuXG4gICAgdmFyIGVudHJ5ID0gdGhpcy5lbnRyeTtcblxuICAgIGlmICghZW50cnkpIHtcbiAgICAgIHRoaXMucmVmcmVzaCgwLCB0aGlzLnJvd3MgLSAxKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgb3ggPSB0aGlzLng7XG4gICAgdmFyIG95ID0gdGhpcy55O1xuICAgIHZhciBveWQgPSB0aGlzLnlkaXNwO1xuXG4gICAgdmFyIGxpbmU7XG4gICAgdmFyIGZvdW5kID0gZmFsc2U7XG4gICAgdmFyIHdyYXBwZWQgPSBmYWxzZTtcbiAgICB2YXIgeCA9IHRoaXMueCArIDE7XG4gICAgdmFyIHkgPSB0aGlzLnlkaXNwICsgdGhpcy55O1xuICAgIHZhciB5YiwgaTtcbiAgICB2YXIgdXAgPSBrZXkgPT09ICdOJ1xuICAgICAgPyB0aGlzLnNlYXJjaERvd25cbiAgICAgIDogIXRoaXMuc2VhcmNoRG93bjtcblxuICAgIGZvciAoOzspIHtcbiAgICAgIGxpbmUgPSB0aGlzLmxpbmVzW3ldO1xuXG4gICAgICB3aGlsZSAoeCA8IHRoaXMuY29scykge1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgZW50cnkubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBpZiAoeCArIGkgPj0gdGhpcy5jb2xzKSBicmVhaztcbiAgICAgICAgICBpZiAobGluZVt4ICsgaV1bMV0gIT09IGVudHJ5W2ldKSB7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9IGVsc2UgaWYgKGxpbmVbeCArIGldWzFdID09PSBlbnRyeVtpXSAmJiBpID09PSBlbnRyeS5sZW5ndGggLSAxKSB7XG4gICAgICAgICAgICBmb3VuZCA9IHRydWU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZvdW5kKSBicmVhaztcbiAgICAgICAgeCArPSBpICsgMTtcbiAgICAgIH1cbiAgICAgIGlmIChmb3VuZCkgYnJlYWs7XG5cbiAgICAgIHggPSAwO1xuXG4gICAgICBpZiAoIXVwKSB7XG4gICAgICAgIHkrKztcbiAgICAgICAgaWYgKHkgPiB0aGlzLnliYXNlICsgdGhpcy5yb3dzIC0gMSkge1xuICAgICAgICAgIGlmICh3cmFwcGVkKSBicmVhaztcbiAgICAgICAgICAvLyB0aGlzLnNldE1lc3NhZ2UoJ1NlYXJjaCB3cmFwcGVkLiBDb250aW51aW5nIGF0IFRPUC4nKTtcbiAgICAgICAgICB3cmFwcGVkID0gdHJ1ZTtcbiAgICAgICAgICB5ID0gMDtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgeS0tO1xuICAgICAgICBpZiAoeSA8IDApIHtcbiAgICAgICAgICBpZiAod3JhcHBlZCkgYnJlYWs7XG4gICAgICAgICAgLy8gdGhpcy5zZXRNZXNzYWdlKCdTZWFyY2ggd3JhcHBlZC4gQ29udGludWluZyBhdCBCT1RUT00uJyk7XG4gICAgICAgICAgd3JhcHBlZCA9IHRydWU7XG4gICAgICAgICAgeSA9IHRoaXMueWJhc2UgKyB0aGlzLnJvd3MgLSAxO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGZvdW5kKSB7XG4gICAgICBpZiAoeSAtIHRoaXMueWJhc2UgPCAwKSB7XG4gICAgICAgIHliID0geTtcbiAgICAgICAgeSA9IDA7XG4gICAgICAgIGlmICh5YiA+IHRoaXMueWJhc2UpIHtcbiAgICAgICAgICB5ID0geWIgLSB0aGlzLnliYXNlO1xuICAgICAgICAgIHliID0gdGhpcy55YmFzZTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgeWIgPSB0aGlzLnliYXNlO1xuICAgICAgICB5IC09IHRoaXMueWJhc2U7XG4gICAgICB9XG5cbiAgICAgIHRoaXMueCA9IHgsIHRoaXMueSA9IHk7XG4gICAgICB0aGlzLnNjcm9sbERpc3AoLXRoaXMueWRpc3AgKyB5Yik7XG5cbiAgICAgIGlmICh0aGlzLnZpc3VhbE1vZGUpIHtcbiAgICAgICAgdGhpcy5zZWxlY3RUZXh0KG94LCB0aGlzLngsIG95ICsgb3lkLCB0aGlzLnlkaXNwICsgdGhpcy55KTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyB0aGlzLnNldE1lc3NhZ2UoXCJObyBtYXRjaGVzIGZvdW5kLlwiKTtcbiAgICB0aGlzLnJlZnJlc2goMCwgdGhpcy5yb3dzIC0gMSk7XG5cbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoa2V5ID09PSAnXFxiJyB8fCBrZXkgPT09ICdcXHg3ZicpIHtcbiAgICBpZiAodGhpcy5lbnRyeS5sZW5ndGggPT09IDApIHJldHVybjtcbiAgICB2YXIgYm90dG9tID0gdGhpcy55ZGlzcCArIHRoaXMucm93cyAtIDE7XG4gICAgdGhpcy5lbnRyeSA9IHRoaXMuZW50cnkuc2xpY2UoMCwgLTEpO1xuICAgIHZhciBpID0gdGhpcy5lbnRyeVByZWZpeC5sZW5ndGggKyB0aGlzLmVudHJ5Lmxlbmd0aDtcbiAgICAvL3RoaXMubGluZXNbYm90dG9tXVtpXVsxXSA9ICcgJztcbiAgICB0aGlzLmxpbmVzW2JvdHRvbV1baV0gPSBbXG4gICAgICB0aGlzLmxpbmVzW2JvdHRvbV1baV1bMF0sXG4gICAgICAnICdcbiAgICBdO1xuICAgIHRoaXMueC0tO1xuICAgIHRoaXMucmVmcmVzaCh0aGlzLnJvd3MgLSAxLCB0aGlzLnJvd3MgLSAxKTtcbiAgICB0aGlzLnJlZnJlc2godGhpcy55LCB0aGlzLnkpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChrZXkubGVuZ3RoID09PSAxICYmIGtleSA+PSAnICcgJiYga2V5IDw9ICd+Jykge1xuICAgIHZhciBib3R0b20gPSB0aGlzLnlkaXNwICsgdGhpcy5yb3dzIC0gMTtcbiAgICB0aGlzLmVudHJ5ICs9IGtleTtcbiAgICB2YXIgaSA9IHRoaXMuZW50cnlQcmVmaXgubGVuZ3RoICsgdGhpcy5lbnRyeS5sZW5ndGggLSAxO1xuICAgIC8vdGhpcy5saW5lc1tib3R0b21dW2ldWzBdID0gKHRoaXMuZGVmQXR0ciAmIH4weDFmZikgfCA0O1xuICAgIC8vdGhpcy5saW5lc1tib3R0b21dW2ldWzFdID0ga2V5O1xuICAgIHRoaXMubGluZXNbYm90dG9tXVtpXSA9IFtcbiAgICAgICh0aGlzLmRlZkF0dHIgJiB+MHgxZmYpIHwgNCxcbiAgICAgIGtleVxuICAgIF07XG4gICAgdGhpcy54Kys7XG4gICAgdGhpcy5yZWZyZXNoKHRoaXMucm93cyAtIDEsIHRoaXMucm93cyAtIDEpO1xuICAgIHRoaXMucmVmcmVzaCh0aGlzLnksIHRoaXMueSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgcmV0dXJuIGZhbHNlO1xufTtcblxuLyoqXG4gKiBDaGFyYWN0ZXIgU2V0c1xuICovXG5cblRlcm1pbmFsLmNoYXJzZXRzID0ge307XG5cbi8vIERFQyBTcGVjaWFsIENoYXJhY3RlciBhbmQgTGluZSBEcmF3aW5nIFNldC5cbi8vIGh0dHA6Ly92dDEwMC5uZXQvZG9jcy92dDEwMi11Zy90YWJsZTUtMTMuaHRtbFxuLy8gQSBsb3Qgb2YgY3Vyc2VzIGFwcHMgdXNlIHRoaXMgaWYgdGhleSBzZWUgVEVSTT14dGVybS5cbi8vIHRlc3Rpbmc6IGVjaG8gLWUgJ1xcZSgwYVxcZShCJ1xuLy8gVGhlIHh0ZXJtIG91dHB1dCBzb21ldGltZXMgc2VlbXMgdG8gY29uZmxpY3Qgd2l0aCB0aGVcbi8vIHJlZmVyZW5jZSBhYm92ZS4geHRlcm0gc2VlbXMgaW4gbGluZSB3aXRoIHRoZSByZWZlcmVuY2Vcbi8vIHdoZW4gcnVubmluZyB2dHRlc3QgaG93ZXZlci5cbi8vIFRoZSB0YWJsZSBiZWxvdyBub3cgdXNlcyB4dGVybSdzIG91dHB1dCBmcm9tIHZ0dGVzdC5cblRlcm1pbmFsLmNoYXJzZXRzLlNDTEQgPSB7IC8vICgwXG4gICdgJzogJ1xcdTI1YzYnLCAvLyAn4peGJ1xuICAnYSc6ICdcXHUyNTkyJywgLy8gJ+KWkidcbiAgJ2InOiAnXFx1MDAwOScsIC8vICdcXHQnXG4gICdjJzogJ1xcdTAwMGMnLCAvLyAnXFxmJ1xuICAnZCc6ICdcXHUwMDBkJywgLy8gJ1xccidcbiAgJ2UnOiAnXFx1MDAwYScsIC8vICdcXG4nXG4gICdmJzogJ1xcdTAwYjAnLCAvLyAnwrAnXG4gICdnJzogJ1xcdTAwYjEnLCAvLyAnwrEnXG4gICdoJzogJ1xcdTI0MjQnLCAvLyAnXFx1MjQyNCcgKE5MKVxuICAnaSc6ICdcXHUwMDBiJywgLy8gJ1xcdidcbiAgJ2onOiAnXFx1MjUxOCcsIC8vICfilJgnXG4gICdrJzogJ1xcdTI1MTAnLCAvLyAn4pSQJ1xuICAnbCc6ICdcXHUyNTBjJywgLy8gJ+KUjCdcbiAgJ20nOiAnXFx1MjUxNCcsIC8vICfilJQnXG4gICduJzogJ1xcdTI1M2MnLCAvLyAn4pS8J1xuICAnbyc6ICdcXHUyM2JhJywgLy8gJ+KOuidcbiAgJ3AnOiAnXFx1MjNiYicsIC8vICfijrsnXG4gICdxJzogJ1xcdTI1MDAnLCAvLyAn4pSAJ1xuICAncic6ICdcXHUyM2JjJywgLy8gJ+KOvCdcbiAgJ3MnOiAnXFx1MjNiZCcsIC8vICfijr0nXG4gICd0JzogJ1xcdTI1MWMnLCAvLyAn4pScJ1xuICAndSc6ICdcXHUyNTI0JywgLy8gJ+KUpCdcbiAgJ3YnOiAnXFx1MjUzNCcsIC8vICfilLQnXG4gICd3JzogJ1xcdTI1MmMnLCAvLyAn4pSsJ1xuICAneCc6ICdcXHUyNTAyJywgLy8gJ+KUgidcbiAgJ3knOiAnXFx1MjI2NCcsIC8vICfiiaQnXG4gICd6JzogJ1xcdTIyNjUnLCAvLyAn4omlJ1xuICAneyc6ICdcXHUwM2MwJywgLy8gJ8+AJ1xuICAnfCc6ICdcXHUyMjYwJywgLy8gJ+KJoCdcbiAgJ30nOiAnXFx1MDBhMycsIC8vICfCoydcbiAgJ34nOiAnXFx1MDBiNycgIC8vICfCtydcbn07XG5cblRlcm1pbmFsLmNoYXJzZXRzLlVLID0gbnVsbDsgLy8gKEFcblRlcm1pbmFsLmNoYXJzZXRzLlVTID0gbnVsbDsgLy8gKEIgKFVTQVNDSUkpXG5UZXJtaW5hbC5jaGFyc2V0cy5EdXRjaCA9IG51bGw7IC8vICg0XG5UZXJtaW5hbC5jaGFyc2V0cy5GaW5uaXNoID0gbnVsbDsgLy8gKEMgb3IgKDVcblRlcm1pbmFsLmNoYXJzZXRzLkZyZW5jaCA9IG51bGw7IC8vIChSXG5UZXJtaW5hbC5jaGFyc2V0cy5GcmVuY2hDYW5hZGlhbiA9IG51bGw7IC8vIChRXG5UZXJtaW5hbC5jaGFyc2V0cy5HZXJtYW4gPSBudWxsOyAvLyAoS1xuVGVybWluYWwuY2hhcnNldHMuSXRhbGlhbiA9IG51bGw7IC8vIChZXG5UZXJtaW5hbC5jaGFyc2V0cy5Ob3J3ZWdpYW5EYW5pc2ggPSBudWxsOyAvLyAoRSBvciAoNlxuVGVybWluYWwuY2hhcnNldHMuU3BhbmlzaCA9IG51bGw7IC8vIChaXG5UZXJtaW5hbC5jaGFyc2V0cy5Td2VkaXNoID0gbnVsbDsgLy8gKEggb3IgKDdcblRlcm1pbmFsLmNoYXJzZXRzLlN3aXNzID0gbnVsbDsgLy8gKD1cblRlcm1pbmFsLmNoYXJzZXRzLklTT0xhdGluID0gbnVsbDsgLy8gL0FcblxuLyoqXG4gKiBIZWxwZXJzXG4gKi9cblxuZnVuY3Rpb24gb24oZWwsIHR5cGUsIGhhbmRsZXIsIGNhcHR1cmUpIHtcbiAgZWwuYWRkRXZlbnRMaXN0ZW5lcih0eXBlLCBoYW5kbGVyLCBjYXB0dXJlIHx8IGZhbHNlKTtcbn1cblxuZnVuY3Rpb24gb2ZmKGVsLCB0eXBlLCBoYW5kbGVyLCBjYXB0dXJlKSB7XG4gIGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIodHlwZSwgaGFuZGxlciwgY2FwdHVyZSB8fCBmYWxzZSk7XG59XG5cbmZ1bmN0aW9uIGNhbmNlbChldikge1xuICBpZiAoZXYucHJldmVudERlZmF1bHQpIGV2LnByZXZlbnREZWZhdWx0KCk7XG4gIGV2LnJldHVyblZhbHVlID0gZmFsc2U7XG4gIGlmIChldi5zdG9wUHJvcGFnYXRpb24pIGV2LnN0b3BQcm9wYWdhdGlvbigpO1xuICBldi5jYW5jZWxCdWJibGUgPSB0cnVlO1xuICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGluaGVyaXRzKGNoaWxkLCBwYXJlbnQpIHtcbiAgZnVuY3Rpb24gZigpIHtcbiAgICB0aGlzLmNvbnN0cnVjdG9yID0gY2hpbGQ7XG4gIH1cbiAgZi5wcm90b3R5cGUgPSBwYXJlbnQucHJvdG90eXBlO1xuICBjaGlsZC5wcm90b3R5cGUgPSBuZXcgZjtcbn1cblxuLy8gaWYgYm9sZCBpcyBicm9rZW4sIHdlIGNhbid0XG4vLyB1c2UgaXQgaW4gdGhlIHRlcm1pbmFsLlxuZnVuY3Rpb24gaXNCb2xkQnJva2VuKGRvY3VtZW50KSB7XG4gIHZhciBib2R5ID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2JvZHknKVswXTtcbiAgdmFyIGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICBlbC5pbm5lckhUTUwgPSAnaGVsbG8gd29ybGQnO1xuICBib2R5LmFwcGVuZENoaWxkKGVsKTtcbiAgdmFyIHcxID0gZWwuc2Nyb2xsV2lkdGg7XG4gIGVsLnN0eWxlLmZvbnRXZWlnaHQgPSAnYm9sZCc7XG4gIHZhciB3MiA9IGVsLnNjcm9sbFdpZHRoO1xuICBib2R5LnJlbW92ZUNoaWxkKGVsKTtcbiAgcmV0dXJuIHcxICE9PSB3Mjtcbn1cblxudmFyIFN0cmluZyA9IHRoaXMuU3RyaW5nO1xudmFyIHNldFRpbWVvdXQgPSB0aGlzLnNldFRpbWVvdXQ7XG52YXIgc2V0SW50ZXJ2YWwgPSB0aGlzLnNldEludGVydmFsO1xuXG5mdW5jdGlvbiBpbmRleE9mKG9iaiwgZWwpIHtcbiAgdmFyIGkgPSBvYmoubGVuZ3RoO1xuICB3aGlsZSAoaS0tKSB7XG4gICAgaWYgKG9ialtpXSA9PT0gZWwpIHJldHVybiBpO1xuICB9XG4gIHJldHVybiAtMTtcbn1cblxuZnVuY3Rpb24gaXNXaWRlKGNoKSB7XG4gIGlmIChjaCA8PSAnXFx1ZmYwMCcpIHJldHVybiBmYWxzZTtcbiAgcmV0dXJuIChjaCA+PSAnXFx1ZmYwMScgJiYgY2ggPD0gJ1xcdWZmYmUnKVxuICAgICAgfHwgKGNoID49ICdcXHVmZmMyJyAmJiBjaCA8PSAnXFx1ZmZjNycpXG4gICAgICB8fCAoY2ggPj0gJ1xcdWZmY2EnICYmIGNoIDw9ICdcXHVmZmNmJylcbiAgICAgIHx8IChjaCA+PSAnXFx1ZmZkMicgJiYgY2ggPD0gJ1xcdWZmZDcnKVxuICAgICAgfHwgKGNoID49ICdcXHVmZmRhJyAmJiBjaCA8PSAnXFx1ZmZkYycpXG4gICAgICB8fCAoY2ggPj0gJ1xcdWZmZTAnICYmIGNoIDw9ICdcXHVmZmU2JylcbiAgICAgIHx8IChjaCA+PSAnXFx1ZmZlOCcgJiYgY2ggPD0gJ1xcdWZmZWUnKTtcbn1cblxuZnVuY3Rpb24gbWF0Y2hDb2xvcihyMSwgZzEsIGIxKSB7XG4gIHZhciBoYXNoID0gKHIxIDw8IDE2KSB8IChnMSA8PCA4KSB8IGIxO1xuXG4gIGlmIChtYXRjaENvbG9yLl9jYWNoZVtoYXNoXSAhPSBudWxsKSB7XG4gICAgcmV0dXJuIG1hdGNoQ29sb3IuX2NhY2hlW2hhc2hdO1xuICB9XG5cbiAgdmFyIGxkaWZmID0gSW5maW5pdHlcbiAgICAsIGxpID0gLTFcbiAgICAsIGkgPSAwXG4gICAgLCBjXG4gICAgLCByMlxuICAgICwgZzJcbiAgICAsIGIyXG4gICAgLCBkaWZmO1xuXG4gIGZvciAoOyBpIDwgVGVybWluYWwudmNvbG9ycy5sZW5ndGg7IGkrKykge1xuICAgIGMgPSBUZXJtaW5hbC52Y29sb3JzW2ldO1xuICAgIHIyID0gY1swXTtcbiAgICBnMiA9IGNbMV07XG4gICAgYjIgPSBjWzJdO1xuXG4gICAgZGlmZiA9IG1hdGNoQ29sb3IuZGlzdGFuY2UocjEsIGcxLCBiMSwgcjIsIGcyLCBiMik7XG5cbiAgICBpZiAoZGlmZiA9PT0gMCkge1xuICAgICAgbGkgPSBpO1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgaWYgKGRpZmYgPCBsZGlmZikge1xuICAgICAgbGRpZmYgPSBkaWZmO1xuICAgICAgbGkgPSBpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBtYXRjaENvbG9yLl9jYWNoZVtoYXNoXSA9IGxpO1xufVxuXG5tYXRjaENvbG9yLl9jYWNoZSA9IHt9O1xuXG4vLyBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vcXVlc3Rpb25zLzE2MzM4Mjhcbm1hdGNoQ29sb3IuZGlzdGFuY2UgPSBmdW5jdGlvbihyMSwgZzEsIGIxLCByMiwgZzIsIGIyKSB7XG4gIHJldHVybiBNYXRoLnBvdygzMCAqIChyMSAtIHIyKSwgMilcbiAgICArIE1hdGgucG93KDU5ICogKGcxIC0gZzIpLCAyKVxuICAgICsgTWF0aC5wb3coMTEgKiAoYjEgLSBiMiksIDIpO1xufTtcblxuZnVuY3Rpb24gZWFjaChvYmosIGl0ZXIsIGNvbikge1xuICBpZiAob2JqLmZvckVhY2gpIHJldHVybiBvYmouZm9yRWFjaChpdGVyLCBjb24pO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IG9iai5sZW5ndGg7IGkrKykge1xuICAgIGl0ZXIuY2FsbChjb24sIG9ialtpXSwgaSwgb2JqKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBrZXlzKG9iaikge1xuICBpZiAoT2JqZWN0LmtleXMpIHJldHVybiBPYmplY3Qua2V5cyhvYmopO1xuICB2YXIga2V5LCBrZXlzID0gW107XG4gIGZvciAoa2V5IGluIG9iaikge1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpKSB7XG4gICAgICBrZXlzLnB1c2goa2V5KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGtleXM7XG59XG5cbi8qKlxuICogRXhwb3NlXG4gKi9cblxuVGVybWluYWwuRXZlbnRFbWl0dGVyID0gRXZlbnRFbWl0dGVyO1xuVGVybWluYWwuaW5oZXJpdHMgPSBpbmhlcml0cztcblRlcm1pbmFsLm9uID0gb247XG5UZXJtaW5hbC5vZmYgPSBvZmY7XG5UZXJtaW5hbC5jYW5jZWwgPSBjYW5jZWw7XG5cbmlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJykge1xuICBtb2R1bGUuZXhwb3J0cyA9IFRlcm1pbmFsO1xufSBlbHNlIHtcbiAgdGhpcy5UZXJtaW5hbCA9IFRlcm1pbmFsO1xufVxuXG59KS5jYWxsKGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcyB8fCAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB3aW5kb3cgOiBnbG9iYWwpO1xufSgpKTtcbiIsInZhciBQbGF5ZXIgPSByZXF1aXJlKCcuL2xpYi9wbGF5ZXIuanMnKTtcbnZhciBQYXJzZXIgPSByZXF1aXJlKCcuL2xpYi9wYXJzZXIuanMnKTtcbnZhciBFZGl0b3IgPSByZXF1aXJlKCcuL2xpYi9lZGl0b3IuanMnKTtcbnZhciBUZXJtaW5hbCA9IHJlcXVpcmUoJy4vZXh0L3Rlcm0uanMnKTtcblxud2luZG93LlRUWVBsYXllciA9IG1vZHVsZS5leHBvcnRzID0ge1xuICAgIFBhcnNlcjogUGFyc2VyLFxuICAgIFBsYXllcjogUGxheWVyLFxuICAgIEVkaXRvcjogRWRpdG9yLFxuICAgIFRlcm1pbmFsOiBUZXJtaW5hbCxcbn07XG4iLCJmdW5jdGlvbiBlbChuYW1lLCBhdHRycywgY2hpbGRyZW4pIHtcbiAgICB2YXIgZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQobmFtZSk7XG4gICAgT2JqZWN0LmtleXMoYXR0cnMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgICBlLnNldEF0dHJpYnV0ZShrZXksIGF0dHJzW2tleV0pO1xuICAgIH0pO1xuICAgIGNoaWxkcmVuLmZvckVhY2goZnVuY3Rpb24gKGNoaWxkKSB7XG4gICAgICAgIGUuYXBwZW5kQ2hpbGQoY2hpbGQpO1xuICAgIH0pO1xuICAgIHJldHVybiBlO1xufVxuXG5mdW5jdGlvbiB0eHQoc3RyKSB7XG4gICAgcmV0dXJuIGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKHN0cik7XG59XG5cbmZ1bmN0aW9uIHFzYShyb290LCBzZWxlY3Rvcikge1xuICAgIHJldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChyb290LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpLCAwKTtcbn1cblxuZnVuY3Rpb24gcXMocm9vdCwgc2VsZWN0b3IpIHtcbiAgICByZXR1cm4gcm9vdC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcbn1cblxuZnVuY3Rpb24gb24ocm9vdCwgZXZlbnRTZWxlY3RvckhhbmRsZXJzKSB7XG4gICAgT2JqZWN0LmtleXMoZXZlbnRTZWxlY3RvckhhbmRsZXJzKS5mb3JFYWNoKGZ1bmN0aW9uIChldmVudE5hbWUpIHtcbiAgICAgICAgcm9vdC5hZGRFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICBPYmplY3Qua2V5cyhldmVudFNlbGVjdG9ySGFuZGxlcnNbZXZlbnROYW1lXSkuZm9yRWFjaChmdW5jdGlvbiAoc2VsZWN0b3IpIHtcbiAgICAgICAgICAgICAgICB2YXIgcG9zc2libGUgPSBxc2Eocm9vdCwgc2VsZWN0b3IpO1xuICAgICAgICAgICAgICAgIHZhciBoaXQ7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwb3NzaWJsZS5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAocG9zc2libGVbaV0uY29udGFpbnMoZXZlbnQuY3VycmVudFRhcmdldCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGhpdCA9IHBvc3NpYmxlW2ldO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IFxuICAgICAgICAgICAgICAgIGlmIChoaXQpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHdyYXBwZWRFdmVudCA9IE9iamVjdC5jcmVhdGUoZXZlbnQpO1xuICAgICAgICAgICAgICAgICAgICB3cmFwcGVkRXZlbnQuY3VycmVudFRhcmdldCA9IGhpdDtcbiAgICAgICAgICAgICAgICAgICAgZXZlbnRTZWxlY3RvckhhbmRsZXJzW2V2ZW50TmFtZV1bc2VsZWN0b3JdKHdyYXBwZWRFdmVudCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBjc3Mobm9kZSwgYXR0cnMpIHtcbiAgICBPYmplY3Qua2V5cyhhdHRycykuZm9yRWFjaChmdW5jdGlvbiAoYXR0cikge1xuICAgICAgICBub2RlLnN0eWxlW2F0dHJdID0gYXR0cnNbYXR0cl07XG4gICAgfSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIGVsOiBlbCxcbiAgICB0eHQ6IHR4dCxcbiAgICBxc2E6IHFzYSxcbiAgICBxczogcXMsXG4gICAgb246IG9uLFxuICAgIGNzczogY3NzXG59O1xuIiwidmFyIGRvbSA9IHJlcXVpcmUoJy4vZG9tLmpzJyk7XG5mdW5jdGlvbiBFZGl0b3IoY2h1bmtzKSB7XG4gICAgdGhpcy5jaHVua3MgPSBjaHVua3M7XG4gICAgdGhpcy5zdGF0ZSA9IHtcbiAgICAgICAgc2NydWJiZXI6IDAsXG4gICAgICAgIHpvb206IGZhbHNlLFxuICAgICAgICB6b29tU3RhcnQ6IG51bGwsXG4gICAgICAgIHpvb21FbmQ6IG51bGwsXG4gICAgfTtcbiAgICB0aGlzLmVsID0gZG9tLmVsKCdkaXYnLCB7XG4gICAgICAgIGNsYXNzOiAndHR5LWVkaXRvcicsXG4gICAgfSwgW1xuICAgICAgICAodGhpcy5jYW52YXNFbCA9IGRvbS5lbCgnY2FudmFzJywge1xuICAgICAgICAgICAgd2lkdGg6IDY0MCxcbiAgICAgICAgICAgIGhlaWdodDogODhcbiAgICAgICAgfSwgW10pKSxcbiAgICAgICAgZG9tLmVsKCdkaXYnLCB7fSwgW1xuICAgICAgICAgICAgKHRoaXMuY3V0RWwgPSBkb20uZWwoJ2J1dHRvbicsIHtcbiAgICAgICAgICAgICAgICBcImRpc2FibGVkXCI6IFwiXCJcbiAgICAgICAgICAgIH0sIFtcbiAgICAgICAgICAgICAgICB0eHQoJ+Kcgu+4jicpXG4gICAgICAgICAgICBdKSlcbiAgICAgICAgXSksXG4gICAgXSk7XG4gICAgdGhpcy5jYW52YXNFbC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCB0aGlzLm9uRG93bi5iaW5kKHRoaXMpKTtcbiAgICB0aGlzLmNhbnZhc0VsLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCB0aGlzLm9uVXAuYmluZCh0aGlzKSk7XG4gICAgdGhpcy5jYW52YXNFbC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW91dCcsIHRoaXMub25PdXQuYmluZCh0aGlzKSk7XG4gICAgdGhpcy5jYW52YXNFbC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCB0aGlzLm9uTW92ZS5iaW5kKHRoaXMpKTtcbiAgICB0aGlzLmNhbnZhc0VsLmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoc3RhcnQnLCB0aGlzLm9uRG93bi5iaW5kKHRoaXMpKTtcbiAgICB0aGlzLmNhbnZhc0VsLmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoZW5kJywgdGhpcy5vblVwLmJpbmQodGhpcykpO1xuICAgIHRoaXMuY2FudmFzRWwuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2hjYW5jZWwnLCB0aGlzLm9uT3V0LmJpbmQodGhpcykpO1xuICAgIHRoaXMuY2FudmFzRWwuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2htb3ZlJywgdGhpcy5vbk1vdmUuYmluZCh0aGlzKSk7XG59XG5FZGl0b3IucHJvdG90eXBlLmF0dGFjaCA9IGZ1bmN0aW9uICh0YXJnZXQpIHtcbiAgICB0YXJnZXQuYXBwZW5kQ2hpbGQodGhpcy5lbCk7XG4gICAgdGhpcy5jYW52YXNFbC53aWR0aCA9IHRhcmdldC5jbGllbnRXaWR0aCgpO1xuICAgIHRoaXMucmVkcmF3KCk7XG59O1xuRWRpdG9yLnByb3RvdHlwZS5vbkRvd24gPSBmdW5jdGlvbiAoZXZlbnQpIHtcbn07XG5FZGl0b3IucHJvdG90eXBlLm9uVXAgPSBmdW5jdGlvbiAoZXZlbnQpIHtcbn07XG5FZGl0b3IucHJvdG90eXBlLm9uTW92ZSA9IGZ1bmN0aW9uIChldmVudCkge1xufTtcbkVkaXRvci5wcm90b3R5cGUub25PdXQgPSBmdW5jdGlvbiAoZXZlbnQpIHtcbn07XG4iLCIvLyBUcmFkZW9mZjogdGhlIGJyb3dzZXIgYWxsb3dzIGZvciBVVEYtOCBkZWNvZGluZyBvZiBiaW5hcnkgZGF0YSB0aHJvdWdoIHRoZVxuLy8gQmxvYiBhbmQgRmlsZVJlYWRlciBpbnRlcmZhY2UsIGJ1dCB0aGlzIGlzIGFuIGFzeW5jaHJvbm91cyBBUEkuXG4vLyBUaGlzIHN5bmNocm9ub3VzIFVURi04IGRlY29kZXIgaXMgdGhlIG1vc3QgcmVhc29uYWJsZSBwYXRoIGZvcndhcmQuXG5mdW5jdGlvbiBkZWNvZGVVdGY4KGFycikge1xuICAgIHZhciByZXN1bHQgPSAnJztcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyci5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgY29kZSA9IGFycltpXTtcbiAgICAgICAgdmFyIG47XG4gICAgICAgIGlmIChjb2RlICYgMHg4MCkge1xuICAgICAgICAgICAgbiA9IDA7XG4gICAgICAgICAgICBpZiAgICAgICgoYXJyW2ldICYgMHg0MCkgPT09IDApIHsgdGhyb3cgbmV3IEVycm9yKCdCYWQgVVRGLTggU2VxdWVuY2U6IG1pc21hdGNoJyk7IH1cbiAgICAgICAgICAgIGVsc2UgaWYgKChhcnJbaV0gJiAweDIwKSA9PT0gMCkgeyBuID0gMTsgY29kZSA9IGFycltpXSAmIDB4MUY7IH1cbiAgICAgICAgICAgIGVsc2UgaWYgKChhcnJbaV0gJiAweDEwKSA9PT0gMCkgeyBuID0gMjsgY29kZSA9IGFycltpXSAmIDB4MEY7IH1cbiAgICAgICAgICAgIGVsc2UgaWYgKChhcnJbaV0gJiAweDA4KSA9PT0gMCkgeyBuID0gMzsgY29kZSA9IGFycltpXSAmIDB4MDc7IH1cbiAgICAgICAgICAgIGVsc2UgdGhyb3cgbmV3IEVycm9yKCdCYWQgVVRGLTggU2VxdWVuY2U6IG1vcmUgdGhhbiA2IGFkZGl0aW9uYWwgY2hhcnMnKTtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgbjsgKytqKSB7XG4gICAgICAgICAgICAgICAgaSsrO1xuICAgICAgICAgICAgICAgIGlmIChpID49IGFyci5sZW5ndGgpIHRocm93IG5ldyBFcnJvcignQmFkIFVURi04IFNlcXVlbmNlOiBuZWVkIG1vcmUgZGF0YScpO1xuICAgICAgICAgICAgICAgIGNvZGUgPSAoY29kZSA8PCA2KSB8IGFycltpXSAmIDB4M0Y7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoY29kZSA+IDB4MTBGRkZGKSB0aHJvdyBuZXcgRXJyb3IoJ0JhZCBVVEYtOCBTZXF1ZW5jZTogY29kZSBwb2ludCB0b28gbGFyZ2UnKTtcbiAgICAgICAgICAgIGlmIChjb2RlID4gMHhGRkZGKSB7XG4gICAgICAgICAgICAgICAgdmFyIHN1cnJvZ2F0ZSA9IGNvZGUgLSAweDAxMDAwMDtcbiAgICAgICAgICAgICAgICB2YXIgaGlnaCA9IDB4RDgwMCArICgoc3Vycm9nYXRlICYgMHhGRkMwMCkgPj4gMTApO1xuICAgICAgICAgICAgICAgIHZhciBsb3cgID0gMHhEQzAwICsgKHN1cnJvZ2F0ZSAmIDB4MDAzRkYpO1xuICAgICAgICAgICAgICAgIHJlc3VsdCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGhpZ2gpICsgU3RyaW5nLmZyb21DaGFyQ29kZShsb3cpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXN1bHQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShjb2RlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3VsdCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGNvZGUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIFBhcnNlcigpIHtcbn1cblBhcnNlci5wcm90b3R5cGUucGFyc2UgPSBmdW5jdGlvbiAoYnVmZmVyKSB7XG4gICAgLy8gYnVmZmVyIGlzIGEgbGlzdCBvZiBoZWFkZXIgY2h1bmtzIGZvbGxvd2VkIGJ5IGRhdGEgY2h1bmtzLiBcbiAgICAvLyBBIGhlYWRlciBjaHVuayBpcyB0d28gMzItYnl0ZSBsaXR0bGUtZW5kaWFuIHVuc2lnbmVkIGludGVnZXJzOlxuICAgIC8vIC0gc2Vjb25kc1xuICAgIC8vIC0gbWljcm9zZWNvbmRzXG4gICAgLy8gQSBkYXRhIGNodW5rIGlzIG9uZSAzMi1ieXRlIGxpdHRsZS1lbmRpYW4gdW5zaWduZWQgaW50ZWdlcjpcbiAgICAvLyAtIGxlbmd0aFxuICAgIC8vIGZvbGxvd2VkIGJ5IGBsZW5ndGhgIGJ5dGVzIG9mIHRlcm1pbmFsIGlucHV0IGRhdGEuXG4gICAgLy8gV2UgYXNzdW1lIHRoaXMgZGF0YSBpcyBVVEYtOCBlbmNvZGVkLlxuICAgIHZhciBjaHVua3MgPSBbXTtcbiAgICB2YXIgc3RhcnRUaW1lID0gbnVsbDtcbiAgICBmb3IgKHZhciBvZmZzZXQgPSAwOyBvZmZzZXQgPCBidWZmZXIuYnl0ZUxlbmd0aDsgKSB7XG4gICAgICAgIHZhciBoZWFkZXIgPSBuZXcgVWludDMyQXJyYXkoYnVmZmVyLnNsaWNlKG9mZnNldCArIDAsIG9mZnNldCArIDEyKSk7XG4gICAgICAgIHZhciBzZWMgPSBoZWFkZXJbMF07XG4gICAgICAgIHZhciB1c2VjID0gaGVhZGVyWzFdO1xuICAgICAgICB2YXIgbGVuID0gaGVhZGVyWzJdO1xuICAgICAgICB2YXIgbXM7XG4gICAgICAgIGlmIChzdGFydFRpbWUgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHN0YXJ0VGltZSA9IChzZWMgKiAxMDAwKSArICh1c2VjIC8gMTAwMCk7XG4gICAgICAgICAgICBtcyA9IDA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBtcyA9IChzZWMgKiAxMDAwKSArICh1c2VjIC8gMTAwMCkgLSBzdGFydFRpbWU7XG4gICAgICAgIH1cbiAgICAgICAgb2Zmc2V0ICs9IDEyO1xuICAgICAgICB2YXIgZGF0YSA9IGRlY29kZVV0ZjgobmV3IFVpbnQ4QXJyYXkoYnVmZmVyLnNsaWNlKG9mZnNldCArIDAsIG9mZnNldCArIGxlbikpKTtcbiAgICAgICAgb2Zmc2V0ICs9IGxlbjtcbiAgICAgICAgY2h1bmtzLnB1c2goe1xuICAgICAgICAgICAgbXM6IG1zLFxuICAgICAgICAgICAgZGF0YTogZGF0YVxuICAgICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIGNodW5rcztcbn07XG5tb2R1bGUuZXhwb3J0cyA9IFBhcnNlcjtcbiIsImZ1bmN0aW9uIFBsYXllcigpIHtcbiAgICB0aGlzLl9jaHVua3MgPSBudWxsO1xuICAgIHRoaXMuX2ZyYW1lID0gMDtcbiAgICB0aGlzLl90aWNrSGFuZGxlID0gbnVsbDtcbiAgICB0aGlzLmxpc3RlbmVycyA9IFtdO1xufVxuUGxheWVyLnByb3RvdHlwZS5sb2FkID0gZnVuY3Rpb24gKGNodW5rcykge1xuICAgIHRoaXMucmV3aW5kKCk7XG4gICAgdGhpcy5fY2h1bmtzID0gY2h1bmtzO1xufTtcblBsYXllci5wcm90b3R5cGUuYWRkTGlzdGVuZXIgPSBmdW5jdGlvbiAoZikge1xuICAgIHRoaXMubGlzdGVuZXJzLnB1c2goZik7XG59O1xuUGxheWVyLnByb3RvdHlwZS5yZW1vdmVMaXN0ZW5lciA9IGZ1bmN0aW9uIChmKSB7XG4gICAgdGhpcy5saXN0ZW5lcnMgPSB0aGlzLmxpc3RlbmVycy5maWx0ZXIoZnVuY3Rpb24gKGVsZW0pIHtcbiAgICAgICAgcmV0dXJuIGYgIT09IGVsZW07XG4gICAgfSk7XG59O1xuUGxheWVyLnByb3RvdHlwZS5wbGF5ID0gZnVuY3Rpb24gcGxheSgpIHtcbiAgICBpZiAodGhpcy5fdGlja0hhbmRsZSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgaWYgKHRoaXMuX2ZyYW1lID49IHRoaXMuX2NodW5rcy5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHRoaXMuX2VtaXQoJ3BsYXknKTtcbiAgICB0aGlzLl9zdGVwKCk7XG4gICAgcmV0dXJuIGZhbHNlO1xufTtcblBsYXllci5wcm90b3R5cGUuX2VtaXQgPSBmdW5jdGlvbiBfZW1pdCh0eXBlLCBkYXRhKSB7XG4gICAgdGhpcy5saXN0ZW5lcnMuZm9yRWFjaChmdW5jdGlvbiAoZikge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgZih7XG4gICAgICAgICAgICAgICAgdHlwZTogdHlwZSxcbiAgICAgICAgICAgICAgICBkYXRhOiBkYXRhXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgLy8gdGhyb3cgbGlzdGVuZXIgZmFpbHVyZSBvdXQtb2YtYmFuZFxuICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7IHRocm93IGU7IH0sIDApO1xuICAgICAgICB9XG4gICAgfS5iaW5kKHRoaXMpKTtcbn07XG5QbGF5ZXIucHJvdG90eXBlLnBhdXNlID0gZnVuY3Rpb24gcGF1c2UoKSB7XG4gICAgaWYgKHRoaXMuX3RpY2tIYW5kbGUpIHtcbiAgICAgICAgdGhpcy5fZW1pdCgncGF1c2UnKTtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuX3RpY2tIYW5kbGUpO1xuICAgICAgICB0aGlzLl90aWNrSGFuZGxlID0gbnVsbDtcbiAgICB9XG59O1xuUGxheWVyLnByb3RvdHlwZS5yZXdpbmQgPSBmdW5jdGlvbiByZXdpbmQoKSB7XG4gICAgdGhpcy5wYXVzZSgpO1xuICAgIHRoaXMuX2VtaXQoJ3Jld2luZCcpO1xuICAgIHRoaXMuX2ZyYW1lID0gMDtcbn07XG5QbGF5ZXIucHJvdG90eXBlLl9zdGVwID0gZnVuY3Rpb24gX3N0ZXAoKSB7XG4gICAgdmFyIGZyYW1lID0gdGhpcy5fZnJhbWU7XG4gICAgdmFyIGN1cnJlbnRDaHVuayA9IHRoaXMuX2NodW5rc1t0aGlzLl9mcmFtZV07XG4gICAgdGhpcy5fZW1pdCgnZGF0YScsIHtcbiAgICAgICAgZGF0YTogY3VycmVudENodW5rLmRhdGEsIFxuICAgICAgICBmcmFtZTogZnJhbWUsXG4gICAgICAgIG1zOiBjdXJyZW50Q2h1bmsubXNcbiAgICB9KTtcblxuICAgIHRoaXMuX2ZyYW1lKys7XG4gICAgaWYgKHRoaXMuX2ZyYW1lIDwgdGhpcy5fY2h1bmtzLmxlbmd0aCkge1xuICAgICAgICB2YXIgbmV4dENodW5rID0gdGhpcy5fY2h1bmtzW3RoaXMuX2ZyYW1lXTtcbiAgICAgICAgdGhpcy5fdGlja0hhbmRsZSA9IHNldFRpbWVvdXQodGhpcy5fc3RlcC5iaW5kKHRoaXMpLCBuZXh0Q2h1bmsubXMgLSBjdXJyZW50Q2h1bmsubXMpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuX2VtaXQoJ2VuZCcpO1xuICAgIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gUGxheWVyO1xuIl19
