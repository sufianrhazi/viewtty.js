all: build/viewtty.min.js build/viewtty.js

clean:
	rm -f build/*

build/viewtty.min.js: build/viewtty.js
	yarn run esbuild --bundle --minify --outfile=$@ < $<

build/viewtty.js: index.ts $(wildcard lib/*.ts) $(wildcard ext/*.js)
	yarn run esbuild --bundle --outfile=$@ < $<

.PHONY: all clean
