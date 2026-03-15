{
  stdenv,
  nix-gitignore,
  lua5_5,
  cmake,
  pkg-config,
}:
stdenv.mkDerivation {
  name = "cajon";
  src = nix-gitignore.gitignoreSource [ ] ./.;
  nativeBuildInputs = [
    cmake
    pkg-config
  ];
  buildInputs = [ lua5_5 ];
}
