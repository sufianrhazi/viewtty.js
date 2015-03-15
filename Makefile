all: build/ttyplayer.uglify.js build/ttyplayer.closure.js build/ttyplayer.js

clean:
	rm -f build/*

build/ttyplayer.uglify.js: build/ttyplayer.js
	node_modules/.bin/uglify -o $@ -s $<

build/ttyplayer.closure.js: build/ttyplayer.js
	closure-compiler \
	    --charset UTF-8 \
	    --compilation_level ADVANCED \
	    --language_in ECMASCRIPT5 \
	    --language_out ECMASCRIPT5 \
	    --js_output_file $@ $<

build/ttyplayer.js: index.js $(wildcard lib/*.js) $(wildcard ext/*.js)
	node_modules/.bin/browserify -d --outfile $@ $<


.PHONY: all clean
