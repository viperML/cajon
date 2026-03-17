return {
	image = "debian",
	cook_script = [[
    apt update -y
    apt install -y vim
  ]],
	stateful = true,
	env = {
		FOO = "bar",
	},
	script = [[
    printenv
  ]],
}
