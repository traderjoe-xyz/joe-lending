const {
  makeCToken
} = require('../Utils/Compound');

const exchangeRate = 50e3;

describe('CToken', function () {
  let root, admin, accounts;
  let cToken;

  beforeEach(async () => {
    [root, admin, ...accounts] = saddle.accounts;
    cToken = await makeCToken({kind: 'ccollateralcap', comptrollerOpts: {kind: 'bool'}, exchangeRate});
  });

  it("fails to register collateral for non comptroller", async () => {
    await expect(send(cToken, 'registerCollateral', [root])).rejects.toRevert("revert only comptroller may register collateral for user");
  });

  it("fails to unregister collateral for non comptroller", async () => {
    await expect(send(cToken, 'unregisterCollateral', [root])).rejects.toRevert("revert only comptroller may unregister collateral for user");
  });
});
