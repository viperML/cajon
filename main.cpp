#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <print>
extern "C" {
#include <lua.h>
#include <lualib.h>
#include <lauxlib.h>
}

int main() {
    std::println("Hello world");
    int error = 0;

    lua_State* L = luaL_newstate();
    luaL_openlibs(L);

    char buf[256];
    if (fgets(buf, sizeof(buf), stdin) != NULL) {
        error = luaL_loadstring(L, buf) || lua_pcall(L, 0, LUA_MULTRET, 0);
        if (error) {
            std::cout << lua_tostring(L, -1);
            lua_pop(L, 1);
        }
    }


    lua_close(L);


    return EXIT_SUCCESS;
}
