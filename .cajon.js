export default {
    image: "debian",
    env: {
        FOO: "bar",
    },
    stateful: true,
    preScript: `
pwd
`,
    cookScript: `
apt update -y
apt install -y build-essential
`,
};
