# VSCode Bitcoin

cd client
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
git pull
open /Applications/Python\ 3.7/Install\ Certificates.command
python3 ./emsdk.py install latest
sudo python3 ./emsdk.py activate latest
source ./emsdk_env.sh
cd ..
git clone https://github.com/sipa/miniscript
cd miniscript
# add modifications to makefile per https://github.com/sipa/miniscript/issues/29 and ENVIRONMENT=node
<!-- miniscript.js: $(HEADERS) $(SOURCES) js_bindings.cpp
	em++ -O3 -g0 -Wall -std=c++11 -fno-rtti -flto -Ibitcoin $(SOURCES) js_bindings.cpp -s WASM=1 -s FILESYSTEM=0 -s ENVIRONMENT=node -s DISABLE_EXCEPTION_CATCHING=0 -s EXPORTED_FUNCTIONS='["_miniscript_compile","_miniscript_analyze","_malloc","_free"]' -s EXTRA_EXPORTED_RUNTIME_METHODS='["cwrap","UTF8ToString"]' -o miniscript.js -s WASM=0 --memory-init-file 0 -s ASSERTIONS=1 -->
sudo make miniscript.js

<!-- # install btcdeb
cd ..
git clone https://github.com/kallewoof/btcdeb
cd btcdeb
make clean
sudo emconfigure ./configure
sudo emmake make

sudo emcc -O2 btcdeb.bc libbitcoin.a -o btcdeb.js
sudo emcc -O2 btcc.bc libbitcoin.a -o btcc.js
sudo emcc -O2 mastify.bc libbitcoin.a -o mastify.js
sudo emcc -O2 merklebranch.bc libbitcoin.a -o merklebranch.js -->