import <nixpkgs> {
  overlays = [
    (final: prev: {
      cajon = final.callPackage ./package.nix { };
    })
  ];
}
