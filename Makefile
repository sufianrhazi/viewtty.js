all: build/viewtty.min.js build/viewtty.js

clean:
	rm -f build/*

build/viewtty.min.js: build/viewtty.js
	node_modules/.bin/esbuild --bundle --minify --outfile=$@ < $<

build/viewtty.js: index.ts $(wildcard lib/*.ts) $(wildcard ext/*.js)
	node_modules/.bin/esbuild --bundle --outfile=$@ < $<

.PHONY: all clean
