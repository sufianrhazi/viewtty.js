all: build/viewtty.min.js build/viewtty.js

clean:
	rm -f build/*

build/viewtty.min.js: build/viewtty.js
	node_modules/.bin/uglify -o $@ -s $<

build/viewtty.js: index.js $(wildcard lib/*.js) $(wildcard ext/*.js)
	node_modules/.bin/browserify -d --outfile $@ $<

.PHONY: all clean
