const colors = require('colors');
const fs = require('fs');

(async () => {
  fs.readFile('.build/contracts.json', (err, data) => {
    if (err) throw err;
    let contracts = JSON.parse(data);
    contracts = contracts['contracts'];
    const limit = 24576;
    console.log(colors.green('The EIP-170 limit is', limit, 'bytes'));

    const result = new Map();
    Object.keys(contracts).forEach(function(contractName) {
      // Exclude test contracts.
      if (contractName.startsWith('contracts/')) {
        contract = contracts[contractName];
        bin = contract['bin']
        const digits = bin.length;
        const bytes = digits / 2;
        if (bytes > 0) {
          contractName = contractName.split(':')[1];
          result.set(contractName, bytes);
        }
      }
    });

    const sortedResult = new Map([...result.entries()].sort((a, b) => a[1] - b[1]));
    sortedResult.forEach(function(size, name) {
      size = size.toString();
      if (size > limit) {
        size = colors.red(size);
      }
      console.log('%s => %s bytes', name.padEnd(30), size);
    });
  });
})();
