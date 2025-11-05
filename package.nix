{
  buildNpmPackage,
  lib,
  nix-gitignore,
  importNpmLock,
}:
let
  package-json = builtins.fromJSON (builtins.readFile ./package.json);
  src = nix-gitignore.gitignoreSource [ ] (lib.cleanSource ./.);
in
buildNpmPackage {
  pname = package-json.name;
  version = package-json.version;
  inherit src;

  npmDeps = importNpmLock {
    npmRoot = src;
  };
  npmConfigHook = importNpmLock.npmConfigHook;

}
