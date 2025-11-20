export default {
    image: "debian",
    env: {
        FOO: "bar",
    },
    // stateful: true,
    preScript: `
pwd
`,
};
