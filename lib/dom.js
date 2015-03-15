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
