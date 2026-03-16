#include "main.hpp"
#include <CLI/CLI.hpp>
#include <cstdlib>
#include <map>
#include <print>
#include <stdbool.h>

extern "C" {
#include <lauxlib.h>
#include <lua.h>
#include <lualib.h>
}

using std::string;

void panic(lua_State *L) {
  auto err = lua_tostring(L, -1);
  if (err == nullptr) {
    err = "unknown error";
  }
  std::println("Fatal error: {}", err);
  std::exit(EXIT_FAILURE);
}

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

  if (luaL_dofile(L, cajonFile.c_str()) != LUA_OK) {
    panic(L);
  }

  lua_close(L);

  return EXIT_SUCCESS;
}
