#include <CLI/CLI.hpp>
#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <print>
#include <stdbool.h>

extern "C" {
#include <lauxlib.h>
#include <lualib.h>
}

using std::string;

int main(int argc, char **argv) {
  CLI::App app{"cajon"};
  argv = app.ensure_utf8(argv);

  bool replace{false};
  string cajonFile{".cajon.lua"};

  app.add_flag("-r,--replace", replace, "replace running container");
  app.add_option("-c,--cajon-file", cajonFile, "path to the cajonfile to use");

  CLI11_PARSE(app, argc, argv);

  lua_State *L = luaL_newstate();
  luaL_openlibs(L);

  if (luaL_loadfile(L, cajonFile.c_str()) || lua_pcall(L, 0, LUA_MULTRET, 0)) {
    std::println("Error: {}", lua_tostring(L, -1));
    lua_pop(L, 1);
  } else {
    int nresults = lua_gettop(L); // number of return values
    if (nresults >= 1) {
      const char *val = lua_tostring(L, -1);
      printf("RES: %p\n", val);
      lua_pop(L, nresults); // clean up
    }
  }

  lua_close(L);

  return EXIT_SUCCESS;
}
