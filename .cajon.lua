--- @meta

--- @class Config
--- @field image string                  Image to use.
--- @field mount_cwd boolean|nil         Mount the current working directory into the container. (default: true)
--- @field workdir string|nil            Working directory inside the container. (default: "/mnt")
--- @field name string|nil               Container name. (default: derived from directory name)
--- @field stateful boolean|nil          Keep the container state between runs. (default: false)
--- @field env table<string,string>|nil  Environment variables to pass into the container.
--- @field volumes string[]|nil          Additional volume mounts in "host:container" format.
--- @field script string|nil             Shell script to run inside the container before the default command.
--- @field cook_script string|nil        Shell script to use to cook the container.
--- @field extra_args string[]|nil       Extra flags to pass verbatim.

--- @type Config
return {
	image = "docker.io/library/debian:latest",
	cook_script = [[
    apt update -y
    apt install -y x11-apps
  ]],
}
