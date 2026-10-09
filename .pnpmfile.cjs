// pnpm 11 infers win32 from optional package names containing "windows".
// get-windows 9.3.0 ships macOS/Linux support too, but declares no os field.
// State its actual platforms so optional installs do not silently discard it.
module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === 'get-windows' && pkg.version === '9.3.0' && pkg.os == null) {
        pkg.os = ['darwin', 'linux', 'win32']
      }
      return pkg
    },
  },
}
