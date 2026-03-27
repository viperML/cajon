with import ./default.nix;
cajon.overrideAttrs (old: {
  src = null;
  hardeningDisable = [ "all" ];
  nativeBuildInputs = old.nativeBuildInputs ++ [
    rust-analyzer-unwrapped
    rustfmt
    lldb
    stylua
    clippy
  ];
  env = {
    RUST_SRC_PATH = "${rustPlatform.rustLibSrc}";
    RUST_BACKTRACE = "full";
  };
})
