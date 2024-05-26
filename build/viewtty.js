(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // ext/term.cjs
  var require_term = __commonJS({
    "ext/term.cjs"(exports, module) {
      "use strict";
      (function() {
        "use strict";
        var window2 = this, document = this.document;
        function EventEmitter() {
          this._events = this._events || {};
        }
        EventEmitter.prototype.addListener = function(type, listener) {
          this._events[type] = this._events[type] || [];
          this._events[type].push(listener);
        };
        EventEmitter.prototype.on = EventEmitter.prototype.addListener;
        EventEmitter.prototype.removeListener = function(type, listener) {
          if (!this._events[type])
            return;
          var obj = this._events[type], i = obj.length;
          while (i--) {
            if (obj[i] === listener || obj[i].listener === listener) {
              obj.splice(i, 1);
              return;
            }
          }
        };
        EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
        EventEmitter.prototype.removeAllListeners = function(type) {
          if (this._events[type])
            delete this._events[type];
        };
        EventEmitter.prototype.once = function(type, listener) {
          function on2() {
            var args = Array.prototype.slice.call(arguments);
            this.removeListener(type, on2);
            return listener.apply(this, args);
          }
          on2.listener = listener;
          return this.on(type, on2);
        };
        EventEmitter.prototype.emit = function(type) {
          if (!this._events[type])
            return;
          var args = Array.prototype.slice.call(arguments, 1), obj = this._events[type], l = obj.length, i = 0;
          for (; i < l; i++) {
            obj[i].apply(this, args);
          }
        };
        EventEmitter.prototype.listeners = function(type) {
          return this._events[type] = this._events[type] || [];
        };
        var normal = 0, escaped = 1, csi = 2, osc = 3, charset = 4, dcs = 5, ignore = 6;
        function Terminal2(options) {
          var self = this;
          if (!(this instanceof Terminal2)) {
            return new Terminal2(arguments[0], arguments[1], arguments[2]);
          }
          EventEmitter.call(this);
          if (typeof options === "number") {
            options = {
              cols: arguments[0],
              rows: arguments[1],
              handler: arguments[2]
            };
          }
          options = options || {};
          each(keys(Terminal2.defaults), function(key) {
            if (options[key] == null) {
              options[key] = Terminal2.options[key];
              if (Terminal2[key] !== Terminal2.defaults[key]) {
                options[key] = Terminal2[key];
              }
            }
            self[key] = options[key];
          });
          if (options.colors.length === 8) {
            options.colors = options.colors.concat(Terminal2._colors.slice(8));
          } else if (options.colors.length === 16) {
            options.colors = options.colors.concat(Terminal2._colors.slice(16));
          } else if (options.colors.length === 10) {
            options.colors = options.colors.slice(0, -2).concat(
              Terminal2._colors.slice(8, -2),
              options.colors.slice(-2)
            );
          } else if (options.colors.length === 18) {
            options.colors = options.colors.slice(0, -2).concat(
              Terminal2._colors.slice(16, -2),
              options.colors.slice(-2)
            );
          }
          this.colors = options.colors;
          this.options = options;
          this.parent = options.body || options.parent || (document ? document.getElementsByTagName("body")[0] : null);
          this.cols = options.cols || options.geometry[0];
          this.rows = options.rows || options.geometry[1];
          if (options.handler) {
            this.on("data", options.handler);
          }
          this.ybase = 0;
          this.ydisp = 0;
          this.x = 0;
          this.y = 0;
          this.cursorState = 0;
          this.cursorHidden = false;
          this.convertEol;
          this.state = 0;
          this.queue = "";
          this.scrollTop = 0;
          this.scrollBottom = this.rows - 1;
          this.applicationKeypad = false;
          this.applicationCursor = false;
          this.originMode = false;
          this.insertMode = false;
          this.wraparoundMode = false;
          this.normal = null;
          this.prefixMode = false;
          this.selectMode = false;
          this.visualMode = false;
          this.searchMode = false;
          this.searchDown;
          this.entry = "";
          this.entryPrefix = "Search: ";
          this._real;
          this._selected;
          this._textarea;
          this.charset = null;
          this.gcharset = null;
          this.glevel = 0;
          this.charsets = [null];
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
          this.element;
          this.children;
          this.refreshStart;
          this.refreshEnd;
          this.savedX;
          this.savedY;
          this.savedCols;
          this.readable = true;
          this.writable = true;
          this.defAttr = 0 << 18 | 257 << 9 | 256 << 0;
          this.curAttr = this.defAttr;
          this.params = [];
          this.currentParam = 0;
          this.prefix = "";
          this.postfix = "";
          this.lines = [];
          var i = this.rows;
          while (i--) {
            this.lines.push(this.blankLine());
          }
          this.tabs;
          this.setupStops();
        }
        inherits(Terminal2, EventEmitter);
        Terminal2.prototype.eraseAttr = function() {
          return this.defAttr & ~511 | this.curAttr & 511;
        };
        Terminal2.tangoColors = [
          // dark:
          "#2e3436",
          "#cc0000",
          "#4e9a06",
          "#c4a000",
          "#3465a4",
          "#75507b",
          "#06989a",
          "#d3d7cf",
          // bright:
          "#555753",
          "#ef2929",
          "#8ae234",
          "#fce94f",
          "#729fcf",
          "#ad7fa8",
          "#34e2e2",
          "#eeeeec"
        ];
        Terminal2.xtermColors = [
          // dark:
          "#000000",
          // black
          "#cd0000",
          // red3
          "#00cd00",
          // green3
          "#cdcd00",
          // yellow3
          "#0000ee",
          // blue2
          "#cd00cd",
          // magenta3
          "#00cdcd",
          // cyan3
          "#e5e5e5",
          // gray90
          // bright:
          "#7f7f7f",
          // gray50
          "#ff0000",
          // red
          "#00ff00",
          // green
          "#ffff00",
          // yellow
          "#5c5cff",
          // rgb:5c/5c/ff
          "#ff00ff",
          // magenta
          "#00ffff",
          // cyan
          "#ffffff"
          // white
        ];
        Terminal2.colors = function() {
          var colors = Terminal2.tangoColors.slice(), r = [0, 95, 135, 175, 215, 255], i;
          i = 0;
          for (; i < 216; i++) {
            out(r[i / 36 % 6 | 0], r[i / 6 % 6 | 0], r[i % 6]);
          }
          i = 0;
          for (; i < 24; i++) {
            r = 8 + i * 10;
            out(r, r, r);
          }
          function out(r2, g, b) {
            colors.push("#" + hex(r2) + hex(g) + hex(b));
          }
          function hex(c) {
            c = c.toString(16);
            return c.length < 2 ? "0" + c : c;
          }
          return colors;
        }();
        Terminal2.colors[256] = "#000000";
        Terminal2.colors[257] = "#f0f0f0";
        Terminal2._colors = Terminal2.colors.slice();
        Terminal2.vcolors = function() {
          var out = [], colors = Terminal2.colors, i = 0, color;
          for (; i < 256; i++) {
            color = parseInt(colors[i].substring(1), 16);
            out.push([
              color >> 16 & 255,
              color >> 8 & 255,
              color & 255
            ]);
          }
          return out;
        }();
        Terminal2.defaults = {
          colors: Terminal2.colors,
          convertEol: false,
          termName: "xterm",
          geometry: [80, 24],
          cursorBlink: true,
          visualBell: false,
          popOnBell: false,
          scrollback: 1e3,
          screenKeys: false,
          debug: false,
          useStyle: false
          // programFeatures: false,
          // focusKeys: false,
        };
        Terminal2.options = {};
        each(keys(Terminal2.defaults), function(key) {
          Terminal2[key] = Terminal2.defaults[key];
          Terminal2.options[key] = Terminal2.defaults[key];
        });
        Terminal2.focus = null;
        Terminal2.prototype.focus = function() {
          if (Terminal2.focus === this)
            return;
          if (Terminal2.focus) {
            Terminal2.focus.blur();
          }
          if (this.sendFocus)
            this.send("\x1B[I");
          this.showCursor();
          Terminal2.focus = this;
        };
        Terminal2.prototype.blur = function() {
          if (Terminal2.focus !== this)
            return;
          this.cursorState = 0;
          this.refresh(this.y, this.y);
          if (this.sendFocus)
            this.send("\x1B[O");
          Terminal2.focus = null;
        };
        Terminal2.prototype.initGlobal = function() {
          var document2 = this.document;
          Terminal2._boundDocs = Terminal2._boundDocs || [];
          if (~indexOf(Terminal2._boundDocs, document2)) {
            return;
          }
          Terminal2._boundDocs.push(document2);
          Terminal2.bindPaste(document2);
          Terminal2.bindKeys(document2);
          Terminal2.bindCopy(document2);
          if (this.isMobile) {
            this.fixMobile(document2);
          }
          if (this.useStyle) {
            Terminal2.insertStyle(document2, this.colors[256], this.colors[257]);
          }
        };
        Terminal2.bindPaste = function(document2) {
          var window3 = document2.defaultView;
          on(window3, "paste", function(ev) {
            var term = Terminal2.focus;
            if (!term)
              return;
            if (ev.clipboardData) {
              term.send(ev.clipboardData.getData("text/plain"));
            } else if (term.context.clipboardData) {
              term.send(term.context.clipboardData.getData("Text"));
            }
            term.element.contentEditable = "inherit";
            return cancel(ev);
          });
        };
        Terminal2.bindKeys = function(document2) {
          on(document2, "keydown", function(ev) {
            if (!Terminal2.focus)
              return;
            var target = ev.target || ev.srcElement;
            if (!target)
              return;
            if (target === Terminal2.focus.element || target === Terminal2.focus.context || target === Terminal2.focus.document || target === Terminal2.focus.body || target === Terminal2._textarea || target === Terminal2.focus.parent) {
              return Terminal2.focus.keyDown(ev);
            }
          }, true);
          on(document2, "keypress", function(ev) {
            if (!Terminal2.focus)
              return;
            var target = ev.target || ev.srcElement;
            if (!target)
              return;
            if (target === Terminal2.focus.element || target === Terminal2.focus.context || target === Terminal2.focus.document || target === Terminal2.focus.body || target === Terminal2._textarea || target === Terminal2.focus.parent) {
              return Terminal2.focus.keyPress(ev);
            }
          }, true);
          on(document2, "mousedown", function(ev) {
            if (!Terminal2.focus)
              return;
            var el = ev.target || ev.srcElement;
            if (!el)
              return;
            do {
              if (el === Terminal2.focus.element)
                return;
            } while (el = el.parentNode);
            Terminal2.focus.blur();
          });
        };
        Terminal2.bindCopy = function(document2) {
          var window3 = document2.defaultView;
          on(window3, "copy", function(ev) {
            var term = Terminal2.focus;
            if (!term)
              return;
            if (!term._selected)
              return;
            var textarea = term.getCopyTextarea();
            var text = term.grabText(
              term._selected.x1,
              term._selected.x2,
              term._selected.y1,
              term._selected.y2
            );
            term.emit("copy", text);
            textarea.focus();
            textarea.textContent = text;
            textarea.value = text;
            textarea.setSelectionRange(0, text.length);
            setTimeout2(function() {
              term.element.focus();
              term.focus();
            }, 1);
          });
        };
        Terminal2.prototype.fixMobile = function(document2) {
          var self = this;
          var textarea = document2.createElement("textarea");
          textarea.style.position = "absolute";
          textarea.style.left = "-32000px";
          textarea.style.top = "-32000px";
          textarea.style.width = "0px";
          textarea.style.height = "0px";
          textarea.style.opacity = "0";
          textarea.style.backgroundColor = "transparent";
          textarea.style.borderStyle = "none";
          textarea.style.outlineStyle = "none";
          textarea.autocapitalize = "none";
          textarea.autocorrect = "off";
          document2.getElementsByTagName("body")[0].appendChild(textarea);
          Terminal2._textarea = textarea;
          setTimeout2(function() {
            textarea.focus();
          }, 1e3);
          if (this.isAndroid) {
            on(textarea, "change", function() {
              var value = textarea.textContent || textarea.value;
              textarea.value = "";
              textarea.textContent = "";
              self.send(value + "\r");
            });
          }
        };
        Terminal2.insertStyle = function(document2, bg, fg) {
          var style = document2.getElementById("term-style");
          if (style)
            return;
          var head = document2.getElementsByTagName("head")[0];
          if (!head)
            return;
          var style = document2.createElement("style");
          style.id = "term-style";
          style.innerHTML = ".terminal {\n  float: left;\n  border: " + bg + ' solid 5px;\n  font-family: "DejaVu Sans Mono", "Liberation Mono", monospace;\n  font-size: 11px;\n  color: ' + fg + ";\n  background: " + bg + ";\n}\n\n.terminal-cursor {\n  color: " + bg + ";\n  background: " + fg + ";\n}\n";
          head.insertBefore(style, head.firstChild);
        };
        Terminal2.prototype.open = function(parent) {
          var self = this, i = 0, div;
          this.parent = parent || this.parent;
          if (!this.parent) {
            throw new Error("Terminal requires a parent element.");
          }
          this.context = this.parent.ownerDocument.defaultView;
          this.document = this.parent.ownerDocument;
          this.body = this.document.getElementsByTagName("body")[0];
          if (this.context.navigator && this.context.navigator.userAgent) {
            this.isMac = !!~this.context.navigator.userAgent.indexOf("Mac");
            this.isIpad = !!~this.context.navigator.userAgent.indexOf("iPad");
            this.isIphone = !!~this.context.navigator.userAgent.indexOf("iPhone");
            this.isAndroid = !!~this.context.navigator.userAgent.indexOf("Android");
            this.isMobile = this.isIpad || this.isIphone || this.isAndroid;
            this.isMSIE = !!~this.context.navigator.userAgent.indexOf("MSIE");
          }
          this.element = this.document.createElement("div");
          this.element.className = "terminal";
          this.element.style.outline = "none";
          this.element.setAttribute("tabindex", 0);
          this.element.setAttribute("spellcheck", "false");
          this.element.style.backgroundColor = this.colors[256];
          this.element.style.color = this.colors[257];
          this.children = [];
          for (; i < this.rows; i++) {
            div = this.document.createElement("div");
            this.element.appendChild(div);
            this.children.push(div);
          }
          this.parent.appendChild(this.element);
          this.refresh(0, this.rows - 1);
          if (this.options.noEvents) {
            this.initGlobal();
          }
          if (!this.options.noFocus) {
            this.focus();
            this.startBlink();
            on(this.element, "focus", function() {
              self.focus();
              if (self.isMobile) {
                Terminal2._textarea.focus();
              }
            });
            on(this.element, "mousedown", function() {
              self.focus();
            });
            on(this.element, "mousedown", function(ev) {
              var button = ev.button != null ? +ev.button : ev.which != null ? ev.which - 1 : null;
              if (self.isMSIE) {
                button = button === 1 ? 0 : button === 4 ? 1 : button;
              }
              if (button !== 2)
                return;
              self.element.contentEditable = "true";
              setTimeout2(function() {
                self.element.contentEditable = "inherit";
              }, 1);
            }, true);
          }
          if (this.options.noMouse) {
            this.bindMouse();
          }
          if (!this.options.noFocus) {
            setTimeout2(function() {
              self.element.focus();
            }, 100);
          }
          if (Terminal2.brokenBold == null) {
            Terminal2.brokenBold = isBoldBroken(this.document);
          }
        };
        Terminal2.prototype.bindMouse = function() {
          var el = this.element, self = this, pressed = 32;
          var wheelEvent = "onmousewheel" in this.context ? "mousewheel" : "DOMMouseScroll";
          function sendButton(ev) {
            var button, pos;
            button = getButton(ev);
            pos = getCoords(ev);
            if (!pos)
              return;
            sendEvent(button, pos);
            switch (ev.type) {
              case "mousedown":
                pressed = button;
                break;
              case "mouseup":
                pressed = 32;
                break;
              case wheelEvent:
                break;
            }
          }
          function sendMove(ev) {
            var button = pressed, pos;
            pos = getCoords(ev);
            if (!pos)
              return;
            button += 32;
            sendEvent(button, pos);
          }
          function encode(data, ch) {
            if (!self.utfMouse) {
              if (ch === 255)
                return data.push(0);
              if (ch > 127)
                ch = 127;
              data.push(ch);
            } else {
              if (ch === 2047)
                return data.push(0);
              if (ch < 127) {
                data.push(ch);
              } else {
                if (ch > 2047)
                  ch = 2047;
                data.push(192 | ch >> 6);
                data.push(128 | ch & 63);
              }
            }
          }
          function sendEvent(button, pos) {
            if (self.vt300Mouse) {
              button &= 3;
              pos.x -= 32;
              pos.y -= 32;
              var data = "\x1B[24";
              if (button === 0)
                data += "1";
              else if (button === 1)
                data += "3";
              else if (button === 2)
                data += "5";
              else if (button === 3)
                return;
              else
                data += "0";
              data += "~[" + pos.x + "," + pos.y + "]\r";
              self.send(data);
              return;
            }
            if (self.decLocator) {
              button &= 3;
              pos.x -= 32;
              pos.y -= 32;
              if (button === 0)
                button = 2;
              else if (button === 1)
                button = 4;
              else if (button === 2)
                button = 6;
              else if (button === 3)
                button = 3;
              self.send("\x1B[" + button + ";" + (button === 3 ? 4 : 0) + ";" + pos.y + ";" + pos.x + ";" + (pos.page || 0) + "&w");
              return;
            }
            if (self.urxvtMouse) {
              pos.x -= 32;
              pos.y -= 32;
              pos.x++;
              pos.y++;
              self.send("\x1B[" + button + ";" + pos.x + ";" + pos.y + "M");
              return;
            }
            if (self.sgrMouse) {
              pos.x -= 32;
              pos.y -= 32;
              self.send("\x1B[<" + ((button & 3) === 3 ? button & ~3 : button) + ";" + pos.x + ";" + pos.y + ((button & 3) === 3 ? "m" : "M"));
              return;
            }
            var data = [];
            encode(data, button);
            encode(data, pos.x);
            encode(data, pos.y);
            self.send("\x1B[M" + String2.fromCharCode.apply(String2, data));
          }
          function getButton(ev) {
            var button, shift, meta, ctrl, mod;
            switch (ev.type) {
              case "mousedown":
                button = ev.button != null ? +ev.button : ev.which != null ? ev.which - 1 : null;
                if (self.isMSIE) {
                  button = button === 1 ? 0 : button === 4 ? 1 : button;
                }
                break;
              case "mouseup":
                button = 3;
                break;
              case "DOMMouseScroll":
                button = ev.detail < 0 ? 64 : 65;
                break;
              case "mousewheel":
                button = ev.wheelDeltaY > 0 ? 64 : 65;
                break;
            }
            shift = ev.shiftKey ? 4 : 0;
            meta = ev.metaKey ? 8 : 0;
            ctrl = ev.ctrlKey ? 16 : 0;
            mod = shift | meta | ctrl;
            if (self.vt200Mouse) {
              mod &= ctrl;
            } else if (!self.normalMouse) {
              mod = 0;
            }
            button = 32 + (mod << 2) + button;
            return button;
          }
          function getCoords(ev) {
            var x, y, w, h, el2;
            if (ev.pageX == null)
              return;
            x = ev.pageX;
            y = ev.pageY;
            el2 = self.element;
            while (el2 && el2 !== self.document.documentElement) {
              x -= el2.offsetLeft;
              y -= el2.offsetTop;
              el2 = "offsetParent" in el2 ? el2.offsetParent : el2.parentNode;
            }
            w = self.element.clientWidth;
            h = self.element.clientHeight;
            x = Math.round(x / w * self.cols);
            y = Math.round(y / h * self.rows);
            if (x < 0)
              x = 0;
            if (x > self.cols)
              x = self.cols;
            if (y < 0)
              y = 0;
            if (y > self.rows)
              y = self.rows;
            x += 32;
            y += 32;
            return {
              x,
              y,
              type: ev.type === wheelEvent ? "mousewheel" : ev.type
            };
          }
          on(el, "mousedown", function(ev) {
            if (!self.mouseEvents)
              return;
            sendButton(ev);
            self.focus();
            if (self.vt200Mouse) {
              sendButton({ __proto__: ev, type: "mouseup" });
              return cancel(ev);
            }
            if (self.normalMouse)
              on(self.document, "mousemove", sendMove);
            if (!self.x10Mouse) {
              on(self.document, "mouseup", function up(ev2) {
                sendButton(ev2);
                if (self.normalMouse)
                  off(self.document, "mousemove", sendMove);
                off(self.document, "mouseup", up);
                return cancel(ev2);
              });
            }
            return cancel(ev);
          });
          on(el, wheelEvent, function(ev) {
            if (!self.mouseEvents)
              return;
            if (self.x10Mouse || self.vt300Mouse || self.decLocator)
              return;
            sendButton(ev);
            return cancel(ev);
          });
          on(el, wheelEvent, function(ev) {
            if (self.mouseEvents)
              return;
            if (self.applicationKeypad)
              return;
            if (ev.type === "DOMMouseScroll") {
              self.scrollDisp(ev.detail < 0 ? -5 : 5);
            } else {
              self.scrollDisp(ev.wheelDeltaY > 0 ? -5 : 5);
            }
            return cancel(ev);
          });
        };
        Terminal2.prototype.destroy = function() {
          this.readable = false;
          this.writable = false;
          this._events = {};
          this.handler = function() {
          };
          this.write = function() {
          };
          if (this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
          }
        };
        Terminal2.prototype.refresh = function(start, end) {
          var x, y, i, line, out, ch, width, data, attr, bg, fg, flags, row, parent;
          if (end - start >= this.rows / 2) {
            parent = this.element.parentNode;
            if (parent)
              parent.removeChild(this.element);
          }
          width = this.cols;
          y = start;
          if (end >= this.lines.length) {
            this.log("`end` is too large. Most likely a bad CSR.");
            end = this.lines.length - 1;
          }
          for (; y <= end; y++) {
            row = y + this.ydisp;
            line = this.lines[row];
            out = "";
            if (y === this.y && this.cursorState && (this.ydisp === this.ybase || this.selectMode) && !this.cursorHidden) {
              x = this.x;
            } else {
              x = -1;
            }
            attr = this.defAttr;
            i = 0;
            for (; i < width; i++) {
              data = line[i][0];
              ch = line[i][1];
              if (i === x)
                data = -1;
              if (data !== attr) {
                if (attr !== this.defAttr) {
                  out += "</span>";
                }
                if (data !== this.defAttr) {
                  if (data === -1) {
                    out += '<span class="reverse-video terminal-cursor">';
                  } else {
                    out += '<span style="';
                    bg = data & 511;
                    fg = data >> 9 & 511;
                    flags = data >> 18;
                    if (flags & 1) {
                      if (!Terminal2.brokenBold) {
                        out += "font-weight:bold;";
                      }
                      if (fg < 8)
                        fg += 8;
                    }
                    if (flags & 2) {
                      out += "text-decoration:underline;";
                    }
                    if (flags & 4) {
                      if (flags & 2) {
                        out = out.slice(0, -1);
                        out += " blink;";
                      } else {
                        out += "text-decoration:blink;";
                      }
                    }
                    if (flags & 8) {
                      bg = data >> 9 & 511;
                      fg = data & 511;
                      if (flags & 1 && fg < 8)
                        fg += 8;
                    }
                    if (flags & 16) {
                      out += "visibility:hidden;";
                    }
                    if (bg !== 256) {
                      out += "background-color:" + this.colors[bg] + ";";
                    }
                    if (fg !== 257) {
                      out += "color:" + this.colors[fg] + ";";
                    }
                    out += '">';
                  }
                }
              }
              switch (ch) {
                case "&":
                  out += "&amp;";
                  break;
                case "<":
                  out += "&lt;";
                  break;
                case ">":
                  out += "&gt;";
                  break;
                default:
                  if (ch <= " ") {
                    out += "&nbsp;";
                  } else {
                    if (isWide(ch))
                      i++;
                    out += ch;
                  }
                  break;
              }
              attr = data;
            }
            if (attr !== this.defAttr) {
              out += "</span>";
            }
            this.children[y].innerHTML = out;
          }
          if (parent)
            parent.appendChild(this.element);
        };
        Terminal2.prototype._cursorBlink = function() {
          if (Terminal2.focus !== this)
            return;
          this.cursorState ^= 1;
          this.refresh(this.y, this.y);
        };
        Terminal2.prototype.showCursor = function() {
          if (!this.cursorState) {
            this.cursorState = 1;
            this.refresh(this.y, this.y);
          } else {
          }
        };
        Terminal2.prototype.startBlink = function() {
          if (!this.cursorBlink)
            return;
          var self = this;
          this._blinker = function() {
            self._cursorBlink();
          };
          this._blink = setInterval(this._blinker, 500);
        };
        Terminal2.prototype.refreshBlink = function() {
          if (!this.cursorBlink)
            return;
          clearInterval(this._blink);
          this._blink = setInterval(this._blinker, 500);
        };
        Terminal2.prototype.scroll = function() {
          var row;
          if (++this.ybase === this.scrollback) {
            this.ybase = this.ybase / 2 | 0;
            this.lines = this.lines.slice(-(this.ybase + this.rows) + 1);
          }
          this.ydisp = this.ybase;
          row = this.ybase + this.rows - 1;
          row -= this.rows - 1 - this.scrollBottom;
          if (row === this.lines.length) {
            this.lines.push(this.blankLine());
          } else {
            this.lines.splice(row, 0, this.blankLine());
          }
          if (this.scrollTop !== 0) {
            if (this.ybase !== 0) {
              this.ybase--;
              this.ydisp = this.ybase;
            }
            this.lines.splice(this.ybase + this.scrollTop, 1);
          }
          this.updateRange(this.scrollTop);
          this.updateRange(this.scrollBottom);
        };
        Terminal2.prototype.scrollDisp = function(disp) {
          this.ydisp += disp;
          if (this.ydisp > this.ybase) {
            this.ydisp = this.ybase;
          } else if (this.ydisp < 0) {
            this.ydisp = 0;
          }
          this.refresh(0, this.rows - 1);
        };
        Terminal2.prototype.write = function(data) {
          var l = data.length, i = 0, j, cs, ch;
          this.refreshStart = this.y;
          this.refreshEnd = this.y;
          if (this.ybase !== this.ydisp) {
            this.ydisp = this.ybase;
            this.maxRange();
          }
          for (; i < l; i++) {
            ch = data[i];
            switch (this.state) {
              case normal:
                switch (ch) {
                  case "\x07":
                    this.bell();
                    break;
                  case "\n":
                  case "\v":
                  case "\f":
                    if (this.convertEol) {
                      this.x = 0;
                    }
                    this.y++;
                    if (this.y > this.scrollBottom) {
                      this.y--;
                      this.scroll();
                    }
                    break;
                  case "\r":
                    this.x = 0;
                    break;
                  case "\b":
                    if (this.x > 0) {
                      this.x--;
                    }
                    break;
                  case "	":
                    this.x = this.nextStop();
                    break;
                  case "":
                    this.setgLevel(1);
                    break;
                  case "":
                    this.setgLevel(0);
                    break;
                  case "\x1B":
                    this.state = escaped;
                    break;
                  default:
                    if (ch >= " ") {
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
                          this.lines[j][this.x - 1] = [this.curAttr, " "];
                          break;
                        }
                        this.lines[j][this.x] = [this.curAttr, " "];
                        this.x++;
                      }
                    }
                    break;
                }
                break;
              case escaped:
                switch (ch) {
                  case "[":
                    this.params = [];
                    this.currentParam = 0;
                    this.state = csi;
                    break;
                  case "]":
                    this.params = [];
                    this.currentParam = 0;
                    this.state = osc;
                    break;
                  case "P":
                    this.params = [];
                    this.currentParam = 0;
                    this.state = dcs;
                    break;
                  case "_":
                    this.state = ignore;
                    break;
                  case "^":
                    this.state = ignore;
                    break;
                  case "c":
                    this.reset();
                    break;
                  case "E":
                    this.x = 0;
                    ;
                  case "D":
                    this.index();
                    break;
                  case "M":
                    this.reverseIndex();
                    break;
                  case "%":
                    this.setgLevel(0);
                    this.setgCharset(0, Terminal2.charsets.US);
                    this.state = normal;
                    i++;
                    break;
                  case "(":
                  case ")":
                  case "*":
                  case "+":
                  case "-":
                  case ".":
                    switch (ch) {
                      case "(":
                        this.gcharset = 0;
                        break;
                      case ")":
                        this.gcharset = 1;
                        break;
                      case "*":
                        this.gcharset = 2;
                        break;
                      case "+":
                        this.gcharset = 3;
                        break;
                      case "-":
                        this.gcharset = 1;
                        break;
                      case ".":
                        this.gcharset = 2;
                        break;
                    }
                    this.state = charset;
                    break;
                  case "/":
                    this.gcharset = 3;
                    this.state = charset;
                    i--;
                    break;
                  case "N":
                    break;
                  case "O":
                    break;
                  case "n":
                    this.setgLevel(2);
                    break;
                  case "o":
                    this.setgLevel(3);
                    break;
                  case "|":
                    this.setgLevel(3);
                    break;
                  case "}":
                    this.setgLevel(2);
                    break;
                  case "~":
                    this.setgLevel(1);
                    break;
                  case "7":
                    this.saveCursor();
                    this.state = normal;
                    break;
                  case "8":
                    this.restoreCursor();
                    this.state = normal;
                    break;
                  case "#":
                    this.state = normal;
                    i++;
                    break;
                  case "H":
                    this.tabSet();
                    break;
                  case "=":
                    this.log("Serial port requested application keypad.");
                    this.applicationKeypad = true;
                    this.state = normal;
                    break;
                  case ">":
                    this.log("Switching back to normal keypad.");
                    this.applicationKeypad = false;
                    this.state = normal;
                    break;
                  default:
                    this.state = normal;
                    this.error("Unknown ESC control: %s.", ch);
                    break;
                }
                break;
              case charset:
                switch (ch) {
                  case "0":
                    cs = Terminal2.charsets.SCLD;
                    break;
                  case "A":
                    cs = Terminal2.charsets.UK;
                    break;
                  case "B":
                    cs = Terminal2.charsets.US;
                    break;
                  case "4":
                    cs = Terminal2.charsets.Dutch;
                    break;
                  case "C":
                  case "5":
                    cs = Terminal2.charsets.Finnish;
                    break;
                  case "R":
                    cs = Terminal2.charsets.French;
                    break;
                  case "Q":
                    cs = Terminal2.charsets.FrenchCanadian;
                    break;
                  case "K":
                    cs = Terminal2.charsets.German;
                    break;
                  case "Y":
                    cs = Terminal2.charsets.Italian;
                    break;
                  case "E":
                  case "6":
                    cs = Terminal2.charsets.NorwegianDanish;
                    break;
                  case "Z":
                    cs = Terminal2.charsets.Spanish;
                    break;
                  case "H":
                  case "7":
                    cs = Terminal2.charsets.Swedish;
                    break;
                  case "=":
                    cs = Terminal2.charsets.Swiss;
                    break;
                  case "/":
                    cs = Terminal2.charsets.ISOLatin;
                    i++;
                    break;
                  default:
                    cs = Terminal2.charsets.US;
                    break;
                }
                this.setgCharset(this.gcharset, cs);
                this.gcharset = null;
                this.state = normal;
                break;
              case osc:
                if (ch === "\x1B" || ch === "\x07") {
                  if (ch === "\x1B")
                    i++;
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
                      break;
                    case 4:
                    case 5:
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
                      break;
                    case 46:
                      break;
                    case 50:
                      break;
                    case 51:
                      break;
                    case 52:
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
                      break;
                  }
                  this.params = [];
                  this.currentParam = 0;
                  this.state = normal;
                } else {
                  if (!this.params.length) {
                    if (ch >= "0" && ch <= "9") {
                      this.currentParam = this.currentParam * 10 + ch.charCodeAt(0) - 48;
                    } else if (ch === ";") {
                      this.params.push(this.currentParam);
                      this.currentParam = "";
                    }
                  } else {
                    this.currentParam += ch;
                  }
                }
                break;
              case csi:
                if (ch === "?" || ch === ">" || ch === "!") {
                  this.prefix = ch;
                  break;
                }
                if (ch >= "0" && ch <= "9") {
                  this.currentParam = this.currentParam * 10 + ch.charCodeAt(0) - 48;
                  break;
                }
                if (ch === "$" || ch === '"' || ch === " " || ch === "'") {
                  this.postfix = ch;
                  break;
                }
                this.params.push(this.currentParam);
                this.currentParam = 0;
                if (ch === ";")
                  break;
                this.state = normal;
                switch (ch) {
                  case "A":
                    this.cursorUp(this.params);
                    break;
                  case "B":
                    this.cursorDown(this.params);
                    break;
                  case "C":
                    this.cursorForward(this.params);
                    break;
                  case "D":
                    this.cursorBackward(this.params);
                    break;
                  case "H":
                    this.cursorPos(this.params);
                    break;
                  case "J":
                    this.eraseInDisplay(this.params);
                    break;
                  case "K":
                    this.eraseInLine(this.params);
                    break;
                  case "m":
                    if (!this.prefix) {
                      this.charAttributes(this.params);
                    }
                    break;
                  case "n":
                    if (!this.prefix) {
                      this.deviceStatus(this.params);
                    }
                    break;
                  case "@":
                    this.insertChars(this.params);
                    break;
                  case "E":
                    this.cursorNextLine(this.params);
                    break;
                  case "F":
                    this.cursorPrecedingLine(this.params);
                    break;
                  case "G":
                    this.cursorCharAbsolute(this.params);
                    break;
                  case "L":
                    this.insertLines(this.params);
                    break;
                  case "M":
                    this.deleteLines(this.params);
                    break;
                  case "P":
                    this.deleteChars(this.params);
                    break;
                  case "X":
                    this.eraseChars(this.params);
                    break;
                  case "`":
                    this.charPosAbsolute(this.params);
                    break;
                  case "a":
                    this.HPositionRelative(this.params);
                    break;
                  case "c":
                    this.sendDeviceAttributes(this.params);
                    break;
                  case "d":
                    this.linePosAbsolute(this.params);
                    break;
                  case "e":
                    this.VPositionRelative(this.params);
                    break;
                  case "f":
                    this.HVPosition(this.params);
                    break;
                  case "h":
                    this.setMode(this.params);
                    break;
                  case "l":
                    this.resetMode(this.params);
                    break;
                  case "r":
                    this.setScrollRegion(this.params);
                    break;
                  case "s":
                    this.saveCursor(this.params);
                    break;
                  case "u":
                    this.restoreCursor(this.params);
                    break;
                  case "I":
                    this.cursorForwardTab(this.params);
                    break;
                  case "S":
                    this.scrollUp(this.params);
                    break;
                  case "T":
                    if (this.params.length < 2 && !this.prefix) {
                      this.scrollDown(this.params);
                    }
                    break;
                  case "Z":
                    this.cursorBackwardTab(this.params);
                    break;
                  case "b":
                    this.repeatPrecedingCharacter(this.params);
                    break;
                  case "g":
                    this.tabClear(this.params);
                    break;
                  case "p":
                    switch (this.prefix) {
                      case "!":
                        this.softReset(this.params);
                        break;
                    }
                    break;
                  default:
                    this.error("Unknown CSI code: %s.", ch);
                    break;
                }
                this.prefix = "";
                this.postfix = "";
                break;
              case dcs:
                if (ch === "\x1B" || ch === "\x07") {
                  if (ch === "\x1B")
                    i++;
                  switch (this.prefix) {
                    case "":
                      break;
                    case "$q":
                      var pt = this.currentParam, valid = false;
                      switch (pt) {
                        case '"q':
                          pt = '0"q';
                          break;
                        case '"p':
                          pt = '61"p';
                          break;
                        case "r":
                          pt = "" + (this.scrollTop + 1) + ";" + (this.scrollBottom + 1) + "r";
                          break;
                        case "m":
                          pt = "0m";
                          break;
                        default:
                          this.error("Unknown DCS Pt: %s.", pt);
                          pt = "";
                          break;
                      }
                      this.send("\x1BP" + +valid + "$r" + pt + "\x1B\\");
                      break;
                    case "+p":
                      break;
                    case "+q":
                      var pt = this.currentParam, valid = false;
                      this.send("\x1BP" + +valid + "+r" + pt + "\x1B\\");
                      break;
                    default:
                      this.error("Unknown DCS prefix: %s.", this.prefix);
                      break;
                  }
                  this.currentParam = 0;
                  this.prefix = "";
                  this.state = normal;
                } else if (!this.currentParam) {
                  if (!this.prefix && ch !== "$" && ch !== "+") {
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
                if (ch === "\x1B" || ch === "\x07") {
                  if (ch === "\x1B")
                    i++;
                  this.state = normal;
                }
                break;
            }
          }
          this.updateRange(this.y);
          this.refresh(this.refreshStart, this.refreshEnd);
        };
        Terminal2.prototype.writeln = function(data) {
          this.write(data + "\r\n");
        };
        Terminal2.prototype.keyDown = function(ev) {
          var self = this, key;
          switch (ev.keyCode) {
            case 8:
              if (ev.shiftKey) {
                key = "\b";
                break;
              }
              key = "\x7F";
              break;
            case 9:
              if (ev.shiftKey) {
                key = "\x1B[Z";
                break;
              }
              key = "	";
              break;
            case 13:
              key = "\r";
              break;
            case 27:
              key = "\x1B";
              break;
            case 37:
              if (this.applicationCursor) {
                key = "\x1BOD";
                break;
              }
              key = "\x1B[D";
              break;
            case 39:
              if (this.applicationCursor) {
                key = "\x1BOC";
                break;
              }
              key = "\x1B[C";
              break;
            case 38:
              if (this.applicationCursor) {
                key = "\x1BOA";
                break;
              }
              if (ev.ctrlKey) {
                this.scrollDisp(-1);
                return cancel(ev);
              } else {
                key = "\x1B[A";
              }
              break;
            case 40:
              if (this.applicationCursor) {
                key = "\x1BOB";
                break;
              }
              if (ev.ctrlKey) {
                this.scrollDisp(1);
                return cancel(ev);
              } else {
                key = "\x1B[B";
              }
              break;
            case 46:
              key = "\x1B[3~";
              break;
            case 45:
              key = "\x1B[2~";
              break;
            case 36:
              if (this.applicationKeypad) {
                key = "\x1BOH";
                break;
              }
              key = "\x1BOH";
              break;
            case 35:
              if (this.applicationKeypad) {
                key = "\x1BOF";
                break;
              }
              key = "\x1BOF";
              break;
            case 33:
              if (ev.shiftKey) {
                this.scrollDisp(-(this.rows - 1));
                return cancel(ev);
              } else {
                key = "\x1B[5~";
              }
              break;
            case 34:
              if (ev.shiftKey) {
                this.scrollDisp(this.rows - 1);
                return cancel(ev);
              } else {
                key = "\x1B[6~";
              }
              break;
            case 112:
              key = "\x1BOP";
              break;
            case 113:
              key = "\x1BOQ";
              break;
            case 114:
              key = "\x1BOR";
              break;
            case 115:
              key = "\x1BOS";
              break;
            case 116:
              key = "\x1B[15~";
              break;
            case 117:
              key = "\x1B[17~";
              break;
            case 118:
              key = "\x1B[18~";
              break;
            case 119:
              key = "\x1B[19~";
              break;
            case 120:
              key = "\x1B[20~";
              break;
            case 121:
              key = "\x1B[21~";
              break;
            case 122:
              key = "\x1B[23~";
              break;
            case 123:
              key = "\x1B[24~";
              break;
            default:
              if (ev.ctrlKey) {
                if (ev.keyCode >= 65 && ev.keyCode <= 90) {
                  if (this.screenKeys) {
                    if (!this.prefixMode && !this.selectMode && ev.keyCode === 65) {
                      this.enterPrefix();
                      return cancel(ev);
                    }
                  }
                  if (this.prefixMode && ev.keyCode === 86) {
                    this.leavePrefix();
                    return;
                  }
                  if ((this.prefixMode || this.selectMode) && ev.keyCode === 67) {
                    if (this.visualMode) {
                      setTimeout2(function() {
                        self.leaveVisual();
                      }, 1);
                    }
                    return;
                  }
                  key = String2.fromCharCode(ev.keyCode - 64);
                } else if (ev.keyCode === 32) {
                  key = String2.fromCharCode(0);
                } else if (ev.keyCode >= 51 && ev.keyCode <= 55) {
                  key = String2.fromCharCode(ev.keyCode - 51 + 27);
                } else if (ev.keyCode === 56) {
                  key = String2.fromCharCode(127);
                } else if (ev.keyCode === 219) {
                  key = String2.fromCharCode(27);
                } else if (ev.keyCode === 221) {
                  key = String2.fromCharCode(29);
                }
              } else if (!this.isMac && ev.altKey || this.isMac && ev.metaKey) {
                if (ev.keyCode >= 65 && ev.keyCode <= 90) {
                  key = "\x1B" + String2.fromCharCode(ev.keyCode + 32);
                } else if (ev.keyCode === 192) {
                  key = "\x1B`";
                } else if (ev.keyCode >= 48 && ev.keyCode <= 57) {
                  key = "\x1B" + (ev.keyCode - 48);
                }
              }
              break;
          }
          if (!key)
            return true;
          if (this.prefixMode) {
            this.leavePrefix();
            return cancel(ev);
          }
          if (this.selectMode) {
            this.keySelect(ev, key);
            return cancel(ev);
          }
          this.emit("keydown", ev);
          this.emit("key", key, ev);
          this.showCursor();
          this.handler(key);
          return cancel(ev);
        };
        Terminal2.prototype.setgLevel = function(g) {
          this.glevel = g;
          this.charset = this.charsets[g];
        };
        Terminal2.prototype.setgCharset = function(g, charset2) {
          this.charsets[g] = charset2;
          if (this.glevel === g) {
            this.charset = charset2;
          }
        };
        Terminal2.prototype.keyPress = function(ev) {
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
          if (!key || ev.ctrlKey || ev.altKey || ev.metaKey)
            return false;
          key = String2.fromCharCode(key);
          if (this.prefixMode) {
            this.leavePrefix();
            this.keyPrefix(ev, key);
            return false;
          }
          if (this.selectMode) {
            this.keySelect(ev, key);
            return false;
          }
          this.emit("keypress", key, ev);
          this.emit("key", key, ev);
          this.showCursor();
          this.handler(key);
          return false;
        };
        Terminal2.prototype.send = function(data) {
          var self = this;
          if (!this.queue) {
            setTimeout2(function() {
              self.handler(self.queue);
              self.queue = "";
            }, 1);
          }
          this.queue += data;
        };
        Terminal2.prototype.bell = function() {
          this.emit("bell");
          if (!this.visualBell)
            return;
          var self = this;
          this.element.style.borderColor = "white";
          setTimeout2(function() {
            self.element.style.borderColor = "";
          }, 10);
          if (this.popOnBell)
            this.focus();
        };
        Terminal2.prototype.log = function() {
          if (!this.debug)
            return;
          if (!this.context.console || !this.context.console.log)
            return;
          var args = Array.prototype.slice.call(arguments);
          this.context.console.log.apply(this.context.console, args);
        };
        Terminal2.prototype.error = function() {
          if (!this.debug)
            return;
          if (!this.context.console || !this.context.console.error)
            return;
          var args = Array.prototype.slice.call(arguments);
          this.context.console.error.apply(this.context.console, args);
        };
        Terminal2.prototype.resize = function(x, y) {
          var line, el, i, j, ch;
          if (x < 1)
            x = 1;
          if (y < 1)
            y = 1;
          j = this.cols;
          if (j < x) {
            ch = [this.defAttr, " "];
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
          j = this.rows;
          if (j < y) {
            el = this.element;
            while (j++ < y) {
              if (this.lines.length < y + this.ybase) {
                this.lines.push(this.blankLine());
              }
              if (this.children.length < y) {
                line = this.document.createElement("div");
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
                if (!el)
                  continue;
                el.parentNode.removeChild(el);
              }
            }
          }
          this.rows = y;
          if (this.y >= y)
            this.y = y - 1;
          if (this.x >= x)
            this.x = x - 1;
          this.scrollTop = 0;
          this.scrollBottom = y - 1;
          this.refresh(0, this.rows - 1);
          this.normal = null;
        };
        Terminal2.prototype.updateRange = function(y) {
          if (y < this.refreshStart)
            this.refreshStart = y;
          if (y > this.refreshEnd)
            this.refreshEnd = y;
        };
        Terminal2.prototype.maxRange = function() {
          this.refreshStart = 0;
          this.refreshEnd = this.rows - 1;
        };
        Terminal2.prototype.setupStops = function(i) {
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
        Terminal2.prototype.prevStop = function(x) {
          if (x == null)
            x = this.x;
          while (!this.tabs[--x] && x > 0)
            ;
          return x >= this.cols ? this.cols - 1 : x < 0 ? 0 : x;
        };
        Terminal2.prototype.nextStop = function(x) {
          if (x == null)
            x = this.x;
          while (!this.tabs[++x] && x < this.cols)
            ;
          return x >= this.cols ? this.cols - 1 : x < 0 ? 0 : x;
        };
        Terminal2.prototype.eraseRight = function(x, y) {
          var line = this.lines[this.ybase + y], ch = [this.eraseAttr(), " "];
          for (; x < this.cols; x++) {
            line[x] = ch;
          }
          this.updateRange(y);
        };
        Terminal2.prototype.eraseLeft = function(x, y) {
          var line = this.lines[this.ybase + y], ch = [this.eraseAttr(), " "];
          x++;
          while (x--)
            line[x] = ch;
          this.updateRange(y);
        };
        Terminal2.prototype.eraseLine = function(y) {
          this.eraseRight(0, y);
        };
        Terminal2.prototype.blankLine = function(cur) {
          var attr = cur ? this.eraseAttr() : this.defAttr;
          var ch = [attr, " "], line = [], i = 0;
          for (; i < this.cols; i++) {
            line[i] = ch;
          }
          return line;
        };
        Terminal2.prototype.ch = function(cur) {
          return cur ? [this.eraseAttr(), " "] : [this.defAttr, " "];
        };
        Terminal2.prototype.is = function(term) {
          var name = this.termName;
          return (name + "").indexOf(term) === 0;
        };
        Terminal2.prototype.handler = function(data) {
          this.emit("data", data);
        };
        Terminal2.prototype.handleTitle = function(title) {
          this.emit("title", title);
        };
        Terminal2.prototype.index = function() {
          this.y++;
          if (this.y > this.scrollBottom) {
            this.y--;
            this.scroll();
          }
          this.state = normal;
        };
        Terminal2.prototype.reverseIndex = function() {
          var j;
          this.y--;
          if (this.y < this.scrollTop) {
            this.y++;
            this.lines.splice(this.y + this.ybase, 0, this.blankLine(true));
            j = this.rows - 1 - this.scrollBottom;
            this.lines.splice(this.rows - 1 + this.ybase - j + 1, 1);
            this.updateRange(this.scrollTop);
            this.updateRange(this.scrollBottom);
          }
          this.state = normal;
        };
        Terminal2.prototype.reset = function() {
          this.options.rows = this.rows;
          this.options.cols = this.cols;
          Terminal2.call(this, this.options);
          this.refresh(0, this.rows - 1);
        };
        Terminal2.prototype.tabSet = function() {
          this.tabs[this.x] = true;
          this.state = normal;
        };
        Terminal2.prototype.cursorUp = function(params2) {
          var param = params2[0];
          if (param < 1)
            param = 1;
          this.y -= param;
          if (this.y < 0)
            this.y = 0;
        };
        Terminal2.prototype.cursorDown = function(params2) {
          var param = params2[0];
          if (param < 1)
            param = 1;
          this.y += param;
          if (this.y >= this.rows) {
            this.y = this.rows - 1;
          }
        };
        Terminal2.prototype.cursorForward = function(params2) {
          var param = params2[0];
          if (param < 1)
            param = 1;
          this.x += param;
          if (this.x >= this.cols) {
            this.x = this.cols - 1;
          }
        };
        Terminal2.prototype.cursorBackward = function(params2) {
          var param = params2[0];
          if (param < 1)
            param = 1;
          this.x -= param;
          if (this.x < 0)
            this.x = 0;
        };
        Terminal2.prototype.cursorPos = function(params2) {
          var row, col;
          row = params2[0] - 1;
          if (params2.length >= 2) {
            col = params2[1] - 1;
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
        Terminal2.prototype.eraseInDisplay = function(params2) {
          var j;
          switch (params2[0]) {
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
              while (j--)
                this.eraseLine(j);
              break;
            case 3:
              ;
              break;
          }
        };
        Terminal2.prototype.eraseInLine = function(params2) {
          switch (params2[0]) {
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
        Terminal2.prototype.charAttributes = function(params2) {
          if (params2.length === 1 && params2[0] === 0) {
            this.curAttr = this.defAttr;
            return;
          }
          var l = params2.length, i = 0, flags = this.curAttr >> 18, fg = this.curAttr >> 9 & 511, bg = this.curAttr & 511, p;
          for (; i < l; i++) {
            p = params2[i];
            if (p >= 30 && p <= 37) {
              fg = p - 30;
            } else if (p >= 40 && p <= 47) {
              bg = p - 40;
            } else if (p >= 90 && p <= 97) {
              p += 8;
              fg = p - 90;
            } else if (p >= 100 && p <= 107) {
              p += 8;
              bg = p - 100;
            } else if (p === 0) {
              flags = this.defAttr >> 18;
              fg = this.defAttr >> 9 & 511;
              bg = this.defAttr & 511;
            } else if (p === 1) {
              flags |= 1;
            } else if (p === 4) {
              flags |= 2;
            } else if (p === 5) {
              flags |= 4;
            } else if (p === 7) {
              flags |= 8;
            } else if (p === 8) {
              flags |= 16;
            } else if (p === 22) {
              flags &= ~1;
            } else if (p === 24) {
              flags &= ~2;
            } else if (p === 25) {
              flags &= ~4;
            } else if (p === 27) {
              flags &= ~8;
            } else if (p === 28) {
              flags &= ~16;
            } else if (p === 39) {
              fg = this.defAttr >> 9 & 511;
            } else if (p === 49) {
              bg = this.defAttr & 511;
            } else if (p === 38) {
              if (params2[i + 1] === 2) {
                i += 2;
                fg = matchColor(
                  params2[i] & 255,
                  params2[i + 1] & 255,
                  params2[i + 2] & 255
                );
                if (fg === -1)
                  fg = 511;
                i += 2;
              } else if (params2[i + 1] === 5) {
                i += 2;
                p = params2[i] & 255;
                fg = p;
              }
            } else if (p === 48) {
              if (params2[i + 1] === 2) {
                i += 2;
                bg = matchColor(
                  params2[i] & 255,
                  params2[i + 1] & 255,
                  params2[i + 2] & 255
                );
                if (bg === -1)
                  bg = 511;
                i += 2;
              } else if (params2[i + 1] === 5) {
                i += 2;
                p = params2[i] & 255;
                bg = p;
              }
            } else if (p === 100) {
              fg = this.defAttr >> 9 & 511;
              bg = this.defAttr & 511;
            } else {
              this.error("Unknown SGR attribute: %d.", p);
            }
          }
          this.curAttr = flags << 18 | fg << 9 | bg;
        };
        Terminal2.prototype.deviceStatus = function(params2) {
          if (!this.prefix) {
            switch (params2[0]) {
              case 5:
                this.send("\x1B[0n");
                break;
              case 6:
                this.send("\x1B[" + (this.y + 1) + ";" + (this.x + 1) + "R");
                break;
            }
          } else if (this.prefix === "?") {
            switch (params2[0]) {
              case 6:
                this.send("\x1B[?" + (this.y + 1) + ";" + (this.x + 1) + "R");
                break;
              case 15:
                break;
              case 25:
                break;
              case 26:
                break;
              case 53:
                break;
            }
          }
        };
        Terminal2.prototype.insertChars = function(params2) {
          var param, row, j, ch;
          param = params2[0];
          if (param < 1)
            param = 1;
          row = this.y + this.ybase;
          j = this.x;
          ch = [this.eraseAttr(), " "];
          while (param-- && j < this.cols) {
            this.lines[row].splice(j++, 0, ch);
            this.lines[row].pop();
          }
        };
        Terminal2.prototype.cursorNextLine = function(params2) {
          var param = params2[0];
          if (param < 1)
            param = 1;
          this.y += param;
          if (this.y >= this.rows) {
            this.y = this.rows - 1;
          }
          this.x = 0;
        };
        Terminal2.prototype.cursorPrecedingLine = function(params2) {
          var param = params2[0];
          if (param < 1)
            param = 1;
          this.y -= param;
          if (this.y < 0)
            this.y = 0;
          this.x = 0;
        };
        Terminal2.prototype.cursorCharAbsolute = function(params2) {
          var param = params2[0];
          if (param < 1)
            param = 1;
          this.x = param - 1;
        };
        Terminal2.prototype.insertLines = function(params2) {
          var param, row, j;
          param = params2[0];
          if (param < 1)
            param = 1;
          row = this.y + this.ybase;
          j = this.rows - 1 - this.scrollBottom;
          j = this.rows - 1 + this.ybase - j + 1;
          while (param--) {
            this.lines.splice(row, 0, this.blankLine(true));
            this.lines.splice(j, 1);
          }
          this.updateRange(this.y);
          this.updateRange(this.scrollBottom);
        };
        Terminal2.prototype.deleteLines = function(params2) {
          var param, row, j;
          param = params2[0];
          if (param < 1)
            param = 1;
          row = this.y + this.ybase;
          j = this.rows - 1 - this.scrollBottom;
          j = this.rows - 1 + this.ybase - j;
          while (param--) {
            this.lines.splice(j + 1, 0, this.blankLine(true));
            this.lines.splice(row, 1);
          }
          this.updateRange(this.y);
          this.updateRange(this.scrollBottom);
        };
        Terminal2.prototype.deleteChars = function(params2) {
          var param, row, ch;
          param = params2[0];
          if (param < 1)
            param = 1;
          row = this.y + this.ybase;
          ch = [this.eraseAttr(), " "];
          while (param--) {
            this.lines[row].splice(this.x, 1);
            this.lines[row].push(ch);
          }
        };
        Terminal2.prototype.eraseChars = function(params2) {
          var param, row, j, ch;
          param = params2[0];
          if (param < 1)
            param = 1;
          row = this.y + this.ybase;
          j = this.x;
          ch = [this.eraseAttr(), " "];
          while (param-- && j < this.cols) {
            this.lines[row][j++] = ch;
          }
        };
        Terminal2.prototype.charPosAbsolute = function(params2) {
          var param = params2[0];
          if (param < 1)
            param = 1;
          this.x = param - 1;
          if (this.x >= this.cols) {
            this.x = this.cols - 1;
          }
        };
        Terminal2.prototype.HPositionRelative = function(params2) {
          var param = params2[0];
          if (param < 1)
            param = 1;
          this.x += param;
          if (this.x >= this.cols) {
            this.x = this.cols - 1;
          }
        };
        Terminal2.prototype.sendDeviceAttributes = function(params2) {
          if (params2[0] > 0)
            return;
          if (!this.prefix) {
            if (this.is("xterm") || this.is("rxvt-unicode") || this.is("screen")) {
              this.send("\x1B[?1;2c");
            } else if (this.is("linux")) {
              this.send("\x1B[?6c");
            }
          } else if (this.prefix === ">") {
            if (this.is("xterm")) {
              this.send("\x1B[>0;276;0c");
            } else if (this.is("rxvt-unicode")) {
              this.send("\x1B[>85;95;0c");
            } else if (this.is("linux")) {
              this.send(params2[0] + "c");
            } else if (this.is("screen")) {
              this.send("\x1B[>83;40003;0c");
            }
          }
        };
        Terminal2.prototype.linePosAbsolute = function(params2) {
          var param = params2[0];
          if (param < 1)
            param = 1;
          this.y = param - 1;
          if (this.y >= this.rows) {
            this.y = this.rows - 1;
          }
        };
        Terminal2.prototype.VPositionRelative = function(params2) {
          var param = params2[0];
          if (param < 1)
            param = 1;
          this.y += param;
          if (this.y >= this.rows) {
            this.y = this.rows - 1;
          }
        };
        Terminal2.prototype.HVPosition = function(params2) {
          if (params2[0] < 1)
            params2[0] = 1;
          if (params2[1] < 1)
            params2[1] = 1;
          this.y = params2[0] - 1;
          if (this.y >= this.rows) {
            this.y = this.rows - 1;
          }
          this.x = params2[1] - 1;
          if (this.x >= this.cols) {
            this.x = this.cols - 1;
          }
        };
        Terminal2.prototype.setMode = function(params2) {
          if (typeof params2 === "object") {
            var l = params2.length, i = 0;
            for (; i < l; i++) {
              this.setMode(params2[i]);
            }
            return;
          }
          if (!this.prefix) {
            switch (params2) {
              case 4:
                this.insertMode = true;
                break;
              case 20:
                break;
            }
          } else if (this.prefix === "?") {
            switch (params2) {
              case 1:
                this.applicationCursor = true;
                break;
              case 2:
                this.setgCharset(0, Terminal2.charsets.US);
                this.setgCharset(1, Terminal2.charsets.US);
                this.setgCharset(2, Terminal2.charsets.US);
                this.setgCharset(3, Terminal2.charsets.US);
                break;
              case 3:
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
                break;
              case 66:
                this.log("Serial port requested application keypad.");
                this.applicationKeypad = true;
                break;
              case 9:
              case 1e3:
              case 1002:
              case 1003:
                this.x10Mouse = params2 === 9;
                this.vt200Mouse = params2 === 1e3;
                this.normalMouse = params2 > 1e3;
                this.mouseEvents = true;
                this.element.style.cursor = "default";
                this.log("Binding to mouse events.");
                break;
              case 1004:
                this.sendFocus = true;
                break;
              case 1005:
                this.utfMouse = true;
                break;
              case 1006:
                this.sgrMouse = true;
                break;
              case 1015:
                this.urxvtMouse = true;
                break;
              case 25:
                this.cursorHidden = false;
                break;
              case 1049:
                ;
              case 47:
              case 1047:
                if (!this.normal) {
                  var normal2 = {
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
                  this.normal = normal2;
                  this.showCursor();
                }
                break;
            }
          }
        };
        Terminal2.prototype.resetMode = function(params2) {
          if (typeof params2 === "object") {
            var l = params2.length, i = 0;
            for (; i < l; i++) {
              this.resetMode(params2[i]);
            }
            return;
          }
          if (!this.prefix) {
            switch (params2) {
              case 4:
                this.insertMode = false;
                break;
              case 20:
                break;
            }
          } else if (this.prefix === "?") {
            switch (params2) {
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
                break;
              case 66:
                this.log("Switching back to normal keypad.");
                this.applicationKeypad = false;
                break;
              case 9:
              case 1e3:
              case 1002:
              case 1003:
                this.x10Mouse = false;
                this.vt200Mouse = false;
                this.normalMouse = false;
                this.mouseEvents = false;
                this.element.style.cursor = "";
                break;
              case 1004:
                this.sendFocus = false;
                break;
              case 1005:
                this.utfMouse = false;
                break;
              case 1006:
                this.sgrMouse = false;
                break;
              case 1015:
                this.urxvtMouse = false;
                break;
              case 25:
                this.cursorHidden = true;
                break;
              case 1049:
                ;
              case 47:
              case 1047:
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
                  this.refresh(0, this.rows - 1);
                  this.showCursor();
                }
                break;
            }
          }
        };
        Terminal2.prototype.setScrollRegion = function(params2) {
          if (this.prefix)
            return;
          this.scrollTop = (params2[0] || 1) - 1;
          this.scrollBottom = (params2[1] || this.rows) - 1;
          this.x = 0;
          this.y = 0;
        };
        Terminal2.prototype.saveCursor = function(params2) {
          this.savedX = this.x;
          this.savedY = this.y;
        };
        Terminal2.prototype.restoreCursor = function(params2) {
          this.x = this.savedX || 0;
          this.y = this.savedY || 0;
        };
        Terminal2.prototype.cursorForwardTab = function(params2) {
          var param = params2[0] || 1;
          while (param--) {
            this.x = this.nextStop();
          }
        };
        Terminal2.prototype.scrollUp = function(params2) {
          var param = params2[0] || 1;
          while (param--) {
            this.lines.splice(this.ybase + this.scrollTop, 1);
            this.lines.splice(this.ybase + this.scrollBottom, 0, this.blankLine());
          }
          this.updateRange(this.scrollTop);
          this.updateRange(this.scrollBottom);
        };
        Terminal2.prototype.scrollDown = function(params2) {
          var param = params2[0] || 1;
          while (param--) {
            this.lines.splice(this.ybase + this.scrollBottom, 1);
            this.lines.splice(this.ybase + this.scrollTop, 0, this.blankLine());
          }
          this.updateRange(this.scrollTop);
          this.updateRange(this.scrollBottom);
        };
        Terminal2.prototype.initMouseTracking = function(params2) {
        };
        Terminal2.prototype.resetTitleModes = function(params2) {
          ;
        };
        Terminal2.prototype.cursorBackwardTab = function(params2) {
          var param = params2[0] || 1;
          while (param--) {
            this.x = this.prevStop();
          }
        };
        Terminal2.prototype.repeatPrecedingCharacter = function(params2) {
          var param = params2[0] || 1, line = this.lines[this.ybase + this.y], ch = line[this.x - 1] || [this.defAttr, " "];
          while (param--)
            line[this.x++] = ch;
        };
        Terminal2.prototype.tabClear = function(params2) {
          var param = params2[0];
          if (param <= 0) {
            delete this.tabs[this.x];
          } else if (param === 3) {
            this.tabs = {};
          }
        };
        Terminal2.prototype.mediaCopy = function(params2) {
          ;
        };
        Terminal2.prototype.setResources = function(params2) {
          ;
        };
        Terminal2.prototype.disableModifiers = function(params2) {
          ;
        };
        Terminal2.prototype.setPointerMode = function(params2) {
          ;
        };
        Terminal2.prototype.softReset = function(params2) {
          this.cursorHidden = false;
          this.insertMode = false;
          this.originMode = false;
          this.wraparoundMode = false;
          this.applicationKeypad = false;
          this.applicationCursor = false;
          this.scrollTop = 0;
          this.scrollBottom = this.rows - 1;
          this.curAttr = this.defAttr;
          this.x = this.y = 0;
          this.charset = null;
          this.glevel = 0;
          this.charsets = [null];
        };
        Terminal2.prototype.requestAnsiMode = function(params2) {
          ;
        };
        Terminal2.prototype.requestPrivateMode = function(params2) {
          ;
        };
        Terminal2.prototype.setConformanceLevel = function(params2) {
          ;
        };
        Terminal2.prototype.loadLEDs = function(params2) {
          ;
        };
        Terminal2.prototype.setCursorStyle = function(params2) {
          ;
        };
        Terminal2.prototype.setCharProtectionAttr = function(params2) {
          ;
        };
        Terminal2.prototype.restorePrivateValues = function(params2) {
          ;
        };
        Terminal2.prototype.setAttrInRectangle = function(params2) {
          var t = params2[0], l = params2[1], b = params2[2], r = params2[3], attr = params2[4];
          var line, i;
          for (; t < b + 1; t++) {
            line = this.lines[this.ybase + t];
            for (i = l; i < r; i++) {
              line[i] = [attr, line[i][1]];
            }
          }
          this.updateRange(params2[0]);
          this.updateRange(params2[2]);
        };
        Terminal2.prototype.savePrivateValues = function(params2) {
          ;
        };
        Terminal2.prototype.manipulateWindow = function(params2) {
          ;
        };
        Terminal2.prototype.reverseAttrInRectangle = function(params2) {
          ;
        };
        Terminal2.prototype.setTitleModeFeature = function(params2) {
          ;
        };
        Terminal2.prototype.setWarningBellVolume = function(params2) {
          ;
        };
        Terminal2.prototype.setMarginBellVolume = function(params2) {
          ;
        };
        Terminal2.prototype.copyRectangle = function(params2) {
          ;
        };
        Terminal2.prototype.enableFilterRectangle = function(params2) {
          ;
        };
        Terminal2.prototype.requestParameters = function(params2) {
          ;
        };
        Terminal2.prototype.selectChangeExtent = function(params2) {
          ;
        };
        Terminal2.prototype.fillRectangle = function(params2) {
          var ch = params2[0], t = params2[1], l = params2[2], b = params2[3], r = params2[4];
          var line, i;
          for (; t < b + 1; t++) {
            line = this.lines[this.ybase + t];
            for (i = l; i < r; i++) {
              line[i] = [line[i][0], String2.fromCharCode(ch)];
            }
          }
          this.updateRange(params2[1]);
          this.updateRange(params2[3]);
        };
        Terminal2.prototype.enableLocatorReporting = function(params2) {
          var val = params2[0] > 0;
        };
        Terminal2.prototype.eraseRectangle = function(params2) {
          var t = params2[0], l = params2[1], b = params2[2], r = params2[3];
          var line, i, ch;
          ch = [this.eraseAttr(), " "];
          for (; t < b + 1; t++) {
            line = this.lines[this.ybase + t];
            for (i = l; i < r; i++) {
              line[i] = ch;
            }
          }
          this.updateRange(params2[0]);
          this.updateRange(params2[2]);
        };
        Terminal2.prototype.setLocatorEvents = function(params2) {
          ;
        };
        Terminal2.prototype.selectiveEraseRectangle = function(params2) {
          ;
        };
        Terminal2.prototype.requestLocatorPosition = function(params2) {
          ;
        };
        Terminal2.prototype.insertColumns = function() {
          var param = params[0], l = this.ybase + this.rows, ch = [this.eraseAttr(), " "], i;
          while (param--) {
            for (i = this.ybase; i < l; i++) {
              this.lines[i].splice(this.x + 1, 0, ch);
              this.lines[i].pop();
            }
          }
          this.maxRange();
        };
        Terminal2.prototype.deleteColumns = function() {
          var param = params[0], l = this.ybase + this.rows, ch = [this.eraseAttr(), " "], i;
          while (param--) {
            for (i = this.ybase; i < l; i++) {
              this.lines[i].splice(this.x, 1);
              this.lines[i].push(ch);
            }
          }
          this.maxRange();
        };
        Terminal2.prototype.enterPrefix = function() {
          this.prefixMode = true;
        };
        Terminal2.prototype.leavePrefix = function() {
          this.prefixMode = false;
        };
        Terminal2.prototype.enterSelect = function() {
          this._real = {
            x: this.x,
            y: this.y,
            ydisp: this.ydisp,
            ybase: this.ybase,
            cursorHidden: this.cursorHidden,
            lines: this.copyBuffer(this.lines),
            write: this.write
          };
          this.write = function() {
          };
          this.selectMode = true;
          this.visualMode = false;
          this.cursorHidden = false;
          this.refresh(this.y, this.y);
        };
        Terminal2.prototype.leaveSelect = function() {
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
        Terminal2.prototype.enterVisual = function() {
          this._real.preVisual = this.copyBuffer(this.lines);
          this.selectText(this.x, this.x, this.ydisp + this.y, this.ydisp + this.y);
          this.visualMode = true;
        };
        Terminal2.prototype.leaveVisual = function() {
          this.lines = this._real.preVisual;
          delete this._real.preVisual;
          delete this._selected;
          this.visualMode = false;
          this.refresh(0, this.rows - 1);
        };
        Terminal2.prototype.enterSearch = function(down) {
          this.entry = "";
          this.searchMode = true;
          this.searchDown = down;
          this._real.preSearch = this.copyBuffer(this.lines);
          this._real.preSearchX = this.x;
          this._real.preSearchY = this.y;
          var bottom = this.ydisp + this.rows - 1;
          for (var i = 0; i < this.entryPrefix.length; i++) {
            this.lines[bottom][i] = [
              this.defAttr & ~511 | 4,
              this.entryPrefix[i]
            ];
          }
          this.y = this.rows - 1;
          this.x = this.entryPrefix.length;
          this.refresh(this.rows - 1, this.rows - 1);
        };
        Terminal2.prototype.leaveSearch = function() {
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
        Terminal2.prototype.copyBuffer = function(lines) {
          var lines = lines || this.lines, out = [];
          for (var y = 0; y < lines.length; y++) {
            out[y] = [];
            for (var x = 0; x < lines[y].length; x++) {
              out[y][x] = [lines[y][x][0], lines[y][x][1]];
            }
          }
          return out;
        };
        Terminal2.prototype.getCopyTextarea = function(text) {
          var textarea = this._copyTextarea, document2 = this.document;
          if (!textarea) {
            textarea = document2.createElement("textarea");
            textarea.style.position = "absolute";
            textarea.style.left = "-32000px";
            textarea.style.top = "-32000px";
            textarea.style.width = "0px";
            textarea.style.height = "0px";
            textarea.style.opacity = "0";
            textarea.style.backgroundColor = "transparent";
            textarea.style.borderStyle = "none";
            textarea.style.outlineStyle = "none";
            document2.getElementsByTagName("body")[0].appendChild(textarea);
            this._copyTextarea = textarea;
          }
          return textarea;
        };
        Terminal2.prototype.copyText = function(text) {
          var self = this, textarea = this.getCopyTextarea();
          this.emit("copy", text);
          textarea.focus();
          textarea.textContent = text;
          textarea.value = text;
          textarea.setSelectionRange(0, text.length);
          setTimeout2(function() {
            self.element.focus();
            self.focus();
          }, 1);
        };
        Terminal2.prototype.selectText = function(x1, x2, y1, y2) {
          var ox1, ox2, oy1, oy2, tmp, x, y, xl, attr;
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
          this._selected = { x1, x2, y1, y2 };
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
              attr = this.lines[y][x][0];
              this.lines[y][x] = [
                attr & ~511 | (511 << 9 | 4),
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
          this.refresh(0, this.rows - 1);
        };
        Terminal2.prototype.grabText = function(x1, x2, y1, y2) {
          var out = "", buf = "", ch, x, y, xl, tmp;
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
              if (ch === " ") {
                buf += ch;
                continue;
              }
              if (buf) {
                out += buf;
                buf = "";
              }
              out += ch;
              if (isWide(ch))
                x++;
            }
            buf = "";
            out += "\n";
          }
          for (x = x2, y = y2; x < this.cols; x++) {
            if (this.lines[y][x][1] !== " ") {
              out = out.slice(0, -1);
              break;
            }
          }
          return out;
        };
        Terminal2.prototype.keyPrefix = function(ev, key) {
          if (key === "k" || key === "&") {
            this.destroy();
          } else if (key === "p" || key === "]") {
            this.emit("request paste");
          } else if (key === "c") {
            this.emit("request create");
          } else if (key >= "0" && key <= "9") {
            key = +key - 1;
            if (!~key)
              key = 9;
            this.emit("request term", key);
          } else if (key === "n") {
            this.emit("request term next");
          } else if (key === "P") {
            this.emit("request term previous");
          } else if (key === ":") {
            this.emit("request command mode");
          } else if (key === "[") {
            this.enterSelect();
          }
        };
        Terminal2.prototype.keySelect = function(ev, key) {
          this.showCursor();
          if (this.searchMode || key === "n" || key === "N") {
            return this.keySearch(ev, key);
          }
          if (key === "") {
            var y = this.ydisp + this.y;
            if (this.ydisp === this.ybase) {
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
          if (key === "") {
            var y = this.ydisp + this.y;
            if (this.ydisp === 0) {
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
          if (key === "") {
            var y = this.ydisp + this.y;
            this.scrollDisp(this.rows - 1);
            if (this.visualMode) {
              this.selectText(this.x, this.x, y, this.ydisp + this.y);
            }
            return;
          }
          if (key === "") {
            var y = this.ydisp + this.y;
            this.scrollDisp(-(this.rows - 1));
            if (this.visualMode) {
              this.selectText(this.x, this.x, y, this.ydisp + this.y);
            }
            return;
          }
          if (key === "k" || key === "\x1B[A") {
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
          if (key === "j" || key === "\x1B[B") {
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
          if (key === "h" || key === "\x1B[D") {
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
          if (key === "l" || key === "\x1B[C") {
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
          if (key === "v" || key === " ") {
            if (!this.visualMode) {
              this.enterVisual();
            } else {
              this.leaveVisual();
            }
            return;
          }
          if (key === "y") {
            if (this.visualMode) {
              var text = this.grabText(
                this._selected.x1,
                this._selected.x2,
                this._selected.y1,
                this._selected.y2
              );
              this.copyText(text);
              this.leaveVisual();
            }
            return;
          }
          if (key === "q" || key === "\x1B") {
            if (this.visualMode) {
              this.leaveVisual();
            } else {
              this.leaveSelect();
            }
            return;
          }
          if (key === "w" || key === "W") {
            var ox = this.x;
            var oy = this.y;
            var oyd = this.ydisp;
            var x = this.x;
            var y = this.y;
            var yb = this.ydisp;
            var saw_space = false;
            for (; ; ) {
              var line = this.lines[yb + y];
              while (x < this.cols) {
                if (line[x][1] <= " ") {
                  saw_space = true;
                } else if (saw_space) {
                  break;
                }
                x++;
              }
              if (x >= this.cols)
                x = this.cols - 1;
              if (x === this.cols - 1 && line[x][1] <= " ") {
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
          if (key === "b" || key === "B") {
            var ox = this.x;
            var oy = this.y;
            var oyd = this.ydisp;
            var x = this.x;
            var y = this.y;
            var yb = this.ydisp;
            for (; ; ) {
              var line = this.lines[yb + y];
              var saw_space = x > 0 && line[x][1] > " " && line[x - 1][1] > " ";
              while (x >= 0) {
                if (line[x][1] <= " ") {
                  if (saw_space && (x + 1 < this.cols && line[x + 1][1] > " ")) {
                    x++;
                    break;
                  } else {
                    saw_space = true;
                  }
                }
                x--;
              }
              if (x < 0)
                x = 0;
              if (x === 0 && (line[x][1] <= " " || !saw_space)) {
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
          if (key === "e" || key === "E") {
            var x = this.x + 1;
            var y = this.y;
            var yb = this.ydisp;
            if (x >= this.cols)
              x--;
            for (; ; ) {
              var line = this.lines[yb + y];
              while (x < this.cols) {
                if (line[x][1] <= " ") {
                  x++;
                } else {
                  break;
                }
              }
              while (x < this.cols) {
                if (line[x][1] <= " ") {
                  if (x - 1 >= 0 && line[x - 1][1] > " ") {
                    x--;
                    break;
                  }
                }
                x++;
              }
              if (x >= this.cols)
                x = this.cols - 1;
              if (x === this.cols - 1 && line[x][1] <= " ") {
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
          if (key === "^" || key === "0") {
            var ox = this.x;
            if (key === "0") {
              this.x = 0;
            } else if (key === "^") {
              var line = this.lines[this.ydisp + this.y];
              var x = 0;
              while (x < this.cols) {
                if (line[x][1] > " ") {
                  break;
                }
                x++;
              }
              if (x >= this.cols)
                x = this.cols - 1;
              this.x = x;
            }
            if (this.visualMode) {
              this.selectText(ox, this.x, this.ydisp + this.y, this.ydisp + this.y);
            } else {
              this.refresh(this.y, this.y);
            }
            return;
          }
          if (key === "$") {
            var ox = this.x;
            var line = this.lines[this.ydisp + this.y];
            var x = this.cols - 1;
            while (x >= 0) {
              if (line[x][1] > " ") {
                if (this.visualMode && x < this.cols - 1)
                  x++;
                break;
              }
              x--;
            }
            if (x < 0)
              x = 0;
            this.x = x;
            if (this.visualMode) {
              this.selectText(ox, this.x, this.ydisp + this.y, this.ydisp + this.y);
            } else {
              this.refresh(this.y, this.y);
            }
            return;
          }
          if (key === "g" || key === "G") {
            var ox = this.x;
            var oy = this.y;
            var oyd = this.ydisp;
            if (key === "g") {
              this.x = 0, this.y = 0;
              this.scrollDisp(-this.ydisp);
            } else if (key === "G") {
              this.x = 0, this.y = this.rows - 1;
              this.scrollDisp(this.ybase);
            }
            if (this.visualMode) {
              this.selectText(ox, this.x, oy + oyd, this.ydisp + this.y);
            }
            return;
          }
          if (key === "H" || key === "M" || key === "L") {
            var ox = this.x;
            var oy = this.y;
            if (key === "H") {
              this.x = 0, this.y = 0;
            } else if (key === "M") {
              this.x = 0, this.y = this.rows / 2 | 0;
            } else if (key === "L") {
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
          if (key === "{" || key === "}") {
            var ox = this.x;
            var oy = this.y;
            var oyd = this.ydisp;
            var line;
            var saw_full = false;
            var found = false;
            var first_is_space = -1;
            var y = this.y + (key === "{" ? -1 : 1);
            var yb = this.ydisp;
            var i;
            if (key === "{") {
              if (y < 0) {
                y++;
                if (yb > 0)
                  yb--;
              }
            } else if (key === "}") {
              if (y >= this.rows) {
                y--;
                if (yb < this.ybase)
                  yb++;
              }
            }
            for (; ; ) {
              line = this.lines[yb + y];
              for (i = 0; i < this.cols; i++) {
                if (line[i][1] > " ") {
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
                    if (saw_full)
                      found = true;
                  }
                  break;
                }
              }
              if (found)
                break;
              if (key === "{") {
                y--;
                if (y < 0) {
                  y++;
                  if (yb > 0)
                    yb--;
                  else
                    break;
                }
              } else if (key === "}") {
                y++;
                if (y >= this.rows) {
                  y--;
                  if (yb < this.ybase)
                    yb++;
                  else
                    break;
                }
              }
            }
            if (!found) {
              if (key === "{") {
                y = 0;
                yb = 0;
              } else if (key === "}") {
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
          if (key === "/" || key === "?") {
            if (!this.visualMode) {
              this.enterSearch(key === "/");
            }
            return;
          }
          return false;
        };
        Terminal2.prototype.keySearch = function(ev, key) {
          if (key === "\x1B") {
            this.leaveSearch();
            return;
          }
          if (key === "\r" || !this.searchMode && (key === "n" || key === "N")) {
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
            var up = key === "N" ? this.searchDown : !this.searchDown;
            for (; ; ) {
              line = this.lines[y];
              while (x < this.cols) {
                for (i = 0; i < entry.length; i++) {
                  if (x + i >= this.cols)
                    break;
                  if (line[x + i][1] !== entry[i]) {
                    break;
                  } else if (line[x + i][1] === entry[i] && i === entry.length - 1) {
                    found = true;
                    break;
                  }
                }
                if (found)
                  break;
                x += i + 1;
              }
              if (found)
                break;
              x = 0;
              if (!up) {
                y++;
                if (y > this.ybase + this.rows - 1) {
                  if (wrapped)
                    break;
                  wrapped = true;
                  y = 0;
                }
              } else {
                y--;
                if (y < 0) {
                  if (wrapped)
                    break;
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
            this.refresh(0, this.rows - 1);
            return;
          }
          if (key === "\b" || key === "\x7F") {
            if (this.entry.length === 0)
              return;
            var bottom = this.ydisp + this.rows - 1;
            this.entry = this.entry.slice(0, -1);
            var i = this.entryPrefix.length + this.entry.length;
            this.lines[bottom][i] = [
              this.lines[bottom][i][0],
              " "
            ];
            this.x--;
            this.refresh(this.rows - 1, this.rows - 1);
            this.refresh(this.y, this.y);
            return;
          }
          if (key.length === 1 && key >= " " && key <= "~") {
            var bottom = this.ydisp + this.rows - 1;
            this.entry += key;
            var i = this.entryPrefix.length + this.entry.length - 1;
            this.lines[bottom][i] = [
              this.defAttr & ~511 | 4,
              key
            ];
            this.x++;
            this.refresh(this.rows - 1, this.rows - 1);
            this.refresh(this.y, this.y);
            return;
          }
          return false;
        };
        Terminal2.prototype.exportState = function() {
          return JSON.stringify({
            rows: this.rows,
            cols: this.cols,
            ybase: this.ybase,
            ydisp: this.ydisp,
            x: this.x,
            y: this.y,
            cursorState: this.cursorState,
            cursorHidden: this.cursorHidden,
            convertEol: this.convertEol,
            state: this.state,
            queue: this.queue,
            scrollTop: this.scrollTop,
            scrollBottom: this.scrollBottom,
            applicationKeypad: this.applicationKeypad,
            applicationCursor: this.applicationCursor,
            originMode: this.originMode,
            insertMode: this.insertMode,
            wraparoundMode: this.wraparoundMode,
            normal: this.normal,
            prefixMode: this.prefixMode,
            selectMode: this.selectMode,
            visualMode: this.visualMode,
            searchMode: this.searchMode,
            searchDown: this.searchDown,
            entry: this.entry,
            _real: this._real,
            _selected: this._selected,
            charset: this.charset,
            gcharset: this.gcharset,
            glevel: this.glevel,
            charsets: this.charsets,
            decLocator: this.decLocator,
            x10Mouse: this.x10Mouse,
            vt200Mouse: this.vt200Mouse,
            vt300Mouse: this.vt300Mouse,
            normalMouse: this.normalMouse,
            mouseEvents: this.mouseEvents,
            sendFocus: this.sendFocus,
            utfMouse: this.utfMouse,
            sgrMouse: this.sgrMouse,
            urxvtMouse: this.urxvtMouse,
            refreshStart: this.refreshStart,
            refreshEnd: this.refreshEnd,
            savedX: this.savedX,
            savedY: this.savedY,
            savedCols: this.savedCols,
            curAttr: this.curAttr,
            params: this.params,
            currentParam: this.currentParam,
            prefix: this.prefix,
            postfix: this.postfix,
            lines: this.lines,
            tabs: this.tabs
          });
        };
        Terminal2.prototype.importState = function(serializedState) {
          var state = JSON.parse(serializedState);
          this.reset();
          this.rows = state.rows;
          this.cols = state.cols;
          this.ybase = state.ybase;
          this.ydisp = state.ydisp;
          this.x = state.x;
          this.y = state.y;
          this.cursorState = state.cursorState;
          this.cursorHidden = state.cursorHidden;
          this.convertEol = state.convertEol;
          this.state = state.state;
          this.queue = state.queue;
          this.scrollTop = state.scrollTop;
          this.scrollBottom = state.scrollBottom;
          this.applicationKeypad = state.applicationKeypad;
          this.applicationCursor = state.applicationCursor;
          this.originMode = state.originMode;
          this.insertMode = state.insertMode;
          this.wraparoundMode = state.wraparoundMode;
          this.normal = state.normal;
          this.prefixMode = state.prefixMode;
          this.selectMode = state.selectMode;
          this.visualMode = state.visualMode;
          this.searchMode = state.searchMode;
          this.searchDown = state.searchDown;
          this.entry = state.entry;
          this._real = state._real;
          this._selected = state._selected;
          this.charset = state.charset;
          this.gcharset = state.gcharset;
          this.glevel = state.glevel;
          this.charsets = state.charsets;
          this.decLocator = state.decLocator;
          this.x10Mouse = state.x10Mouse;
          this.vt200Mouse = state.vt200Mouse;
          this.vt300Mouse = state.vt300Mouse;
          this.normalMouse = state.normalMouse;
          this.mouseEvents = state.mouseEvents;
          this.sendFocus = state.sendFocus;
          this.utfMouse = state.utfMouse;
          this.sgrMouse = state.sgrMouse;
          this.urxvtMouse = state.urxvtMouse;
          this.refreshStart = state.refreshStart;
          this.refreshEnd = state.refreshEnd;
          this.savedX = state.savedX;
          this.savedY = state.savedY;
          this.savedCols = state.savedCols;
          this.curAttr = state.curAttr;
          this.params = state.params;
          this.currentParam = state.currentParam;
          this.prefix = state.prefix;
          this.postfix = state.postfix;
          this.lines = state.lines;
          this.tabs = state.tabs;
          this.refresh(0, this.rows - 1);
        };
        Terminal2.charsets = {};
        Terminal2.charsets.SCLD = {
          // (0
          "`": "\u25C6",
          // '◆'
          "a": "\u2592",
          // '▒'
          "b": "	",
          // '\t'
          "c": "\f",
          // '\f'
          "d": "\r",
          // '\r'
          "e": "\n",
          // '\n'
          "f": "\xB0",
          // '°'
          "g": "\xB1",
          // '±'
          "h": "\u2424",
          // '\u2424' (NL)
          "i": "\v",
          // '\v'
          "j": "\u2518",
          // '┘'
          "k": "\u2510",
          // '┐'
          "l": "\u250C",
          // '┌'
          "m": "\u2514",
          // '└'
          "n": "\u253C",
          // '┼'
          "o": "\u23BA",
          // '⎺'
          "p": "\u23BB",
          // '⎻'
          "q": "\u2500",
          // '─'
          "r": "\u23BC",
          // '⎼'
          "s": "\u23BD",
          // '⎽'
          "t": "\u251C",
          // '├'
          "u": "\u2524",
          // '┤'
          "v": "\u2534",
          // '┴'
          "w": "\u252C",
          // '┬'
          "x": "\u2502",
          // '│'
          "y": "\u2264",
          // '≤'
          "z": "\u2265",
          // '≥'
          "{": "\u03C0",
          // 'π'
          "|": "\u2260",
          // '≠'
          "}": "\xA3",
          // '£'
          "~": "\xB7"
          // '·'
        };
        Terminal2.charsets.UK = null;
        Terminal2.charsets.US = null;
        Terminal2.charsets.Dutch = null;
        Terminal2.charsets.Finnish = null;
        Terminal2.charsets.French = null;
        Terminal2.charsets.FrenchCanadian = null;
        Terminal2.charsets.German = null;
        Terminal2.charsets.Italian = null;
        Terminal2.charsets.NorwegianDanish = null;
        Terminal2.charsets.Spanish = null;
        Terminal2.charsets.Swedish = null;
        Terminal2.charsets.Swiss = null;
        Terminal2.charsets.ISOLatin = null;
        function on(el, type, handler, capture) {
          el.addEventListener(type, handler, capture || false);
        }
        function off(el, type, handler, capture) {
          el.removeEventListener(type, handler, capture || false);
        }
        function cancel(ev) {
          if (ev.preventDefault)
            ev.preventDefault();
          ev.returnValue = false;
          if (ev.stopPropagation)
            ev.stopPropagation();
          ev.cancelBubble = true;
          return false;
        }
        function inherits(child, parent) {
          function f() {
            this.constructor = child;
          }
          f.prototype = parent.prototype;
          child.prototype = new f();
        }
        function isBoldBroken(document2) {
          var body = document2.getElementsByTagName("body")[0];
          var el = document2.createElement("span");
          el.innerHTML = "hello world";
          body.appendChild(el);
          var w1 = el.scrollWidth;
          el.style.fontWeight = "bold";
          var w2 = el.scrollWidth;
          body.removeChild(el);
          return w1 !== w2;
        }
        var String2 = this.String;
        var setTimeout2 = this.setTimeout;
        var setInterval = this.setInterval;
        function indexOf(obj, el) {
          var i = obj.length;
          while (i--) {
            if (obj[i] === el)
              return i;
          }
          return -1;
        }
        function isWide(ch) {
          if (ch <= "\uFF00")
            return false;
          return ch >= "\uFF01" && ch <= "\uFFBE" || ch >= "\uFFC2" && ch <= "\uFFC7" || ch >= "\uFFCA" && ch <= "\uFFCF" || ch >= "\uFFD2" && ch <= "\uFFD7" || ch >= "\uFFDA" && ch <= "\uFFDC" || ch >= "\uFFE0" && ch <= "\uFFE6" || ch >= "\uFFE8" && ch <= "\uFFEE";
        }
        function matchColor(r1, g1, b1) {
          var hash = r1 << 16 | g1 << 8 | b1;
          if (matchColor._cache[hash] != null) {
            return matchColor._cache[hash];
          }
          var ldiff = Infinity, li = -1, i = 0, c, r2, g2, b2, diff;
          for (; i < Terminal2.vcolors.length; i++) {
            c = Terminal2.vcolors[i];
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
        matchColor.distance = function(r1, g1, b1, r2, g2, b2) {
          return Math.pow(30 * (r1 - r2), 2) + Math.pow(59 * (g1 - g2), 2) + Math.pow(11 * (b1 - b2), 2);
        };
        function each(obj, iter, con) {
          if (obj.forEach)
            return obj.forEach(iter, con);
          for (var i = 0; i < obj.length; i++) {
            iter.call(con, obj[i], i, obj);
          }
        }
        function keys(obj) {
          if (Object.keys)
            return Object.keys(obj);
          var key, keys2 = [];
          for (key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
              keys2.push(key);
            }
          }
          return keys2;
        }
        Terminal2.EventEmitter = EventEmitter;
        Terminal2.inherits = inherits;
        Terminal2.on = on;
        Terminal2.off = off;
        Terminal2.cancel = cancel;
        if (typeof module !== "undefined") {
          module.exports = Terminal2;
        } else {
          this.Terminal = Terminal2;
        }
      }).call(function() {
        return this || (typeof window !== "undefined" ? window : global);
      }());
    }
  });

  // lib/player.ts
  var Player = class {
    constructor({
      now: depNow,
      setTimeout: depSetTimeout,
      clearTimeout: depClearTimeout
    } = {}) {
      this._chunks = [];
      this._frame = 0;
      this._startTime = null;
      this._tickHandle = null;
      this.listeners = [];
      this.now = depNow || (() => Date.now());
      this.setTimeout = depSetTimeout || setTimeout;
      this.clearTimeout = depClearTimeout || clearTimeout;
    }
    load(chunks) {
      this._chunks = chunks;
      this.rewind();
    }
    addListener(f) {
      this.listeners.push(f);
    }
    removeListener(f) {
      this.listeners = this.listeners.filter(function(elem) {
        return f !== elem;
      });
    }
    play() {
      if (this._tickHandle !== null) {
        return true;
      }
      if (this._frame >= this._chunks.length) {
        return true;
      }
      this._emit("play");
      this._step();
      return false;
    }
    _emit(type, data) {
      let record;
      if (type === "data") {
        record = { type, data };
      } else {
        record = { type };
      }
      this.listeners.forEach((f) => {
        try {
          f(record);
        } catch (e) {
          this.setTimeout(function() {
            throw e;
          }, 0);
        }
      });
    }
    pause() {
      if (this._tickHandle !== null) {
        this._emit("pause");
        this.clearTimeout(this._tickHandle);
        this._tickHandle = null;
        this._startTime = null;
      }
    }
    rewind() {
      this.pause();
      this._emit("rewind");
      this._frame = 0;
    }
    _step() {
      if (this._startTime === null) {
        this._startTime = this.now();
        if (this._frame < this._chunks.length) {
          this._startTime -= this._chunks[this._frame].ms;
        }
      }
      var now = this.now();
      var elapsed = now - this._startTime;
      var chunks = [];
      var frame = this._frame;
      var startIndex;
      let i;
      for (i = this._frame; i < this._chunks.length && this._chunks[i].ms <= elapsed; ++i) {
        chunks.push(this._chunks[i]);
      }
      this._frame = i;
      chunks.forEach((chunk) => {
        this._emit("data", {
          data: chunk.data,
          ms: chunk.ms
        });
      });
      if (this._frame < this._chunks.length) {
        const lastFrame = this._frame > 0 ? this._frame - 1 : 0;
        var delta = this._chunks[this._frame].ms - elapsed;
        this._tickHandle = this.setTimeout(() => this._step(), delta);
      } else {
        this._emit("end");
      }
    }
  };

  // lib/parser.ts
  var UTF8Decoder = class {
    constructor(emitter) {
      this.pendingCodePoint = 0;
      this.emitter = emitter;
      this.needed = 0;
    }
    next(byte) {
      if (this.needed === 0) {
        if ((byte & 128) === 0) {
          this.emitter(String.fromCodePoint(byte));
        } else if ((byte & 64) === 0) {
          throw new Error("Bad UTF-8 Sequence: mismatch");
        } else if ((byte & 32) === 0) {
          this.needed = 1;
          this.pendingCodePoint = byte & 31;
        } else if ((byte & 16) === 0) {
          this.needed = 2;
          this.pendingCodePoint = byte & 15;
        } else if ((byte & 8) === 0) {
          this.needed = 3;
          this.pendingCodePoint = byte & 7;
        } else {
          throw new Error(
            "Bad UTF-8 Sequence: 11110xxx not found at start"
          );
        }
      } else {
        if ((byte & 192) !== 128) {
          throw new Error(
            "Bad UTF-8 Sequence: 10xxxxxx not found in trailing bytes"
          );
        }
        this.pendingCodePoint = this.pendingCodePoint << 6 | byte & 63;
        this.needed -= 1;
        if (this.needed === 0) {
          if (this.pendingCodePoint > 1114111) {
            throw new Error("Bad UTF-8 Sequence: code point too large");
          }
          if (this.pendingCodePoint > 65535) {
            var surrogate = this.pendingCodePoint - 65536;
            var high = 55296 + ((surrogate & 1047552) >> 10);
            var low = 56320 + (surrogate & 1023);
            this.emitter(
              String.fromCharCode(high) + String.fromCharCode(low)
            );
            this.pendingCodePoint = 0;
          } else {
            this.emitter(String.fromCharCode(this.pendingCodePoint));
            this.pendingCodePoint = 0;
          }
        }
      }
    }
  };
  var Parser = class {
    parse(buffer) {
      var chunks = [];
      var startTime = null;
      var chunk = "";
      var decoder = new UTF8Decoder((str) => {
        chunk += str;
      });
      for (var offset = 0; offset < buffer.byteLength; ) {
        var header = new Uint32Array(buffer.slice(offset + 0, offset + 12));
        var sec = header[0];
        var usec = header[1];
        var len = header[2];
        var ms;
        if (startTime === null) {
          startTime = sec * 1e3 + usec / 1e3;
          ms = 0;
        } else {
          ms = sec * 1e3 + usec / 1e3 - startTime;
        }
        offset += 12;
        const byteArray = new Uint8Array(
          buffer.slice(offset + 0, offset + len)
        );
        chunk = "";
        for (let i = 0; i < len; ++i) {
          decoder.next(byteArray[i]);
        }
        offset += len;
        chunks.push({
          ms,
          data: chunk
        });
      }
      return chunks;
    }
  };

  // <stdin>
  var Terminal = __toESM(require_term());
  var ViewTTY = {
    Parser,
    Player,
    Terminal: Terminal.default
  };
})();
