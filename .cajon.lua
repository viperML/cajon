return {
	image = "debian",
	cook_script = [[
    apt update -y
    apt install -y vim
  ]],
}
