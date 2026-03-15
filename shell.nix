with import <nixpkgs> { };
((callPackage ./package.nix { }).override {
  stdenv = clangStdenv;
}).overrideAttrs
  (old: {
    src = null;
    hardeningDisable = [ "all" ];
    nativeBuildInputs = old.nativeBuildInputs ++ [
      clang-tools
      neocmakelsp
    ];
    env = {
      CMAKE_EXPORT_COMPILE_COMMANDS = "ON";
      CMAKE_BUILD_TYPE = "Debug";
    };
  })
