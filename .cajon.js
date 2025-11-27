export default {
    image: "debian",
    env: {
        FOO: "bar",
    },
    // stateful: true,
    preScript: `
pwd
`,
    cookScript: `
apt update
apt install build-essential
`,
};
