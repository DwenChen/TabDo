const prefix =
  'presentation:' +
  process.argv.find((value) => value.startsWith('--tabdo-presentation=')).split('=')[1] +
  ':'
require('./presentation-bridge.cjs').install(prefix)
