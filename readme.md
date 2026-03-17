```
 _______ _  (_)__  ___
/ __/ _ `/ / / _ \/ _ \
\__/\_,_/_/ /\___/_//_/
       |___/
```

*Load containers with ease*

---

Cajon configures and loads containers to tightly integrate with the host, and to allow
a seamless development experience in your containerized operating system. It is configured
through the Lua programming language:

```lua
-- .cajon.lua
return {
  image = "fedora",

  -- Ran once to prepare the container for future executions
  cook_script = [[
    dnf install -y vim
  ]],

  -- Ran everytime
  script = [[
    printenv
  ]],

  -- Keep the state of the container after execution, otherwise discard it.
  stateful = true,

  -- Extra environment variables to set.
  env = {
    TOKEN = "XXX",
  },
}
```

Check all the options with `cajon --init`.

Download the latest release of the binary: https://github.com/viperML/cajon/releases/tag/latest (requires `podman`).


---

This is similar to [Distrobox](https://distrobox.it), but I found distrobox inurating so I rewrote it.
