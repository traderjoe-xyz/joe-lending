const {
  etherUnsigned
} = require('../Utils/Ethereum');

const {
  makeCToken,
  preCSLP
} = require('../Utils/Compound');

const amount = etherUnsigned(10e4);

describe('CToken', function () {
  let cToken, root, admin, accounts;
  beforeEach(async () => {
    [root, admin, ...accounts] = saddle.accounts;
    cToken = await makeCToken({comptrollerOpts: {kind: 'bool'}});
  });

  describe('_setImplementation', () => {
    describe('ccapable', () => {
      let cCapableDelegate;
      beforeEach(async () => {
        cCapableDelegate = await deploy('CCapableErc20Delegate');
      });

      it("fails due to non admin", async () => {
        cToken = await saddle.getContractAt('CErc20Delegator', cToken._address);
        await expect(send(cToken, '_setImplementation', [cCapableDelegate._address, true, '0x0'], { from: accounts[0] })).rejects.toRevert("revert CErc20Delegator::_setImplementation: Caller must be admin");
      });

      it("succeeds to have internal cash", async () => {
        await send(cToken.underlying, 'harnessSetBalance', [cToken._address, amount]);

        cToken = await saddle.getContractAt('CErc20Delegator', cToken._address);
        expect(await send(cToken, '_setImplementation', [cCapableDelegate._address, true, '0x0'])).toSucceed();

        cToken = await saddle.getContractAt('CCapableErc20Delegate', cToken._address);
        const result = await call(cToken, 'getCash');
        expect(result).toEqualNumber(amount);
      });
    });

    describe('cslp', () => {
      let cslpDelegate, data;
      beforeEach(async () => {
        cslpDelegate = await deploy('CSLPDelegateHarness');
        data = await preCSLP(cToken.underlying._address);
      });

      it("fails due to non admin", async () => {
        cToken = await saddle.getContractAt('CErc20Delegator', cToken._address);
        await expect(send(cToken, '_setImplementation', [cslpDelegate._address, true, data], { from: accounts[0] })).rejects.toRevert("revert CErc20Delegator::_setImplementation: Caller must be admin");
      });

      // It's unlikely to upgrade an implementation to CSLPDelegate.
    });

    describe('cctoken', () => {
      let cctokenDelegate;
      beforeEach(async () => {
        cctokenDelegate = await deploy('CCTokenDelegateHarness');
      });

      it("fails due to non admin", async () => {
        cToken = await saddle.getContractAt('CErc20Delegator', cToken._address);
        await expect(send(cToken, '_setImplementation', [cctokenDelegate._address, true, '0x0'], { from: accounts[0] })).rejects.toRevert("revert CErc20Delegator::_setImplementation: Caller must be admin");
      });

      // It's unlikely to upgrade an implementation to CCTokenDelegate.
    });
  });
});
