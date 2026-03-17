{
  nix-gitignore,
  rustPlatform,
  pkg-config,
  lua5_5,
}:
let
  cargoToml = builtins.fromTOML (builtins.readFile ./Cargo.toml);
in
rustPlatform.buildRustPackage {
  pname = cargoToml.package.name;
  version = cargoToml.package.version;
  src = nix-gitignore.gitignoreSource [ ] ./.;
  cargoLock.lockFile = ./Cargo.lock;
  nativeBuildInputs = [
    pkg-config
  ];
  buildInputs = [
    lua5_5
  ];
}
