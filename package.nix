{
  nix-gitignore,
  rustPlatform,
  pkg-config,
  lua5_5,
}:
rustPlatform.buildRustPackage {
  name = "cajon";
  src = nix-gitignore.gitignoreSource [ ] ./.;
  cargoLock.lockFile = ./Cargo.lock;
  nativeBuildInputs = [
    pkg-config
  ];
  buildInputs = [
    lua5_5
  ];
}
