# cajón

_drawer in Spanish_

Cajon is a simple program that loads a container from a `.cajon.js` config file for a project. Similar to [distrobox](https://distrobox.it/),
but I didn't like its DX.

### Example:

```js
// .cajon.js
export default {
    image: "debian",
    script: `echo Hello!`
};

/**
 * Start with: $ cajon
 */
```

More features to come...
