# Education edition downloads

The builds are assets of the GitHub Release (https://github.com/granumDEM/granumdem.github.io/releases),
not files of the website. `config.js` holds their links. For a new version, package the builds
(`bash dist/education/package.sh ...` in the Granum repository), create a release with
`gh release create vX.Y.Z -R granumDEM/granumdem.github.io <files>`, and change the links here.
