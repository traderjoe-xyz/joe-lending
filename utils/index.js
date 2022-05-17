const { run } = require("hardhat");

module.exports = {
  verify: async function verify(address, constructorArguments = []) {
    try {
      await run("verify:verify", {
        address,
        constructorArguments,
      });
    } catch (err) {
      if (err.message.includes("Reason: Already Verified") || err.message.includes("already verified")) {
        console.log("Contract is already verified!");
      } else {
        throw err;
      }
    }
  },
};
