const { etherMantissa, mergeInterface } = require('../Utils/Ethereum');
const { makeCToken, makePriceOracle } = require('../Utils/Compound');

describe('Comptroller', function() {
  let root, accounts;
  let unitroller;
  let brains;
  let oracle;

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    oracle = await makePriceOracle();
    brains = await deploy('Comptroller');
    unitroller = await deploy('Unitroller');
  });

  let initializeBrains = async (priceOracle, closeFactor) => {
    await send(unitroller, '_setPendingImplementation', [brains._address]);
    await send(brains, '_become', [unitroller._address]);
    mergeInterface(unitroller, brains);
    await send(unitroller, '_setPriceOracle', [priceOracle._address]);
    await send(unitroller, '_setCloseFactor', [closeFactor]);
    return await saddle.getContractAt('Comptroller', unitroller._address);
  };

  let reinitializeBrains = async () => {
    await send(unitroller, '_setPendingImplementation', [brains._address]);
    await send(brains, '_become', [unitroller._address]);
    return await saddle.getContractAt('Comptroller', unitroller._address);
  };

  describe('delegating to comptroller v1', () => {
    const closeFactor = etherMantissa(0.051);
    let unitrollerAsComptroller, cToken;

    beforeEach(async () => {
      unitrollerAsComptroller = await initializeBrains(oracle, etherMantissa(0.06), 30);
      cToken = await makeCToken({ comptroller: unitrollerAsComptroller });
    });

    describe('becoming brains sets initial state', () => {
      it('reverts if this is not the pending implementation', async () => {
        await expect(
          send(brains, '_become', [unitroller._address])
        ).rejects.toRevert('revert change not authorized');
      });

      it('on success it sets admin to caller of constructor', async () => {
        expect(await call(unitrollerAsComptroller, 'admin')).toEqual(root);
        expect(await call(unitrollerAsComptroller, 'pendingAdmin')).toBeAddressZero();
      });

      it('on success it sets closeFactor as specified', async () => {
        const comptroller = await initializeBrains(oracle, closeFactor);
        expect(await call(comptroller, 'closeFactorMantissa')).toEqualNumber(closeFactor);
      });

      it("on reinitialization success, it doesn't set closeFactor", async () => {
        let comptroller = await initializeBrains(oracle, closeFactor);
        expect(await call(unitroller, 'comptrollerImplementation')).toEqual(brains._address);
        expect(await call(comptroller, 'closeFactorMantissa')).toEqualNumber(closeFactor);

        // Create new brains
        brains = await deploy('Comptroller');
        comptroller = await reinitializeBrains();

        expect(await call(unitroller, 'comptrollerImplementation')).toEqual(brains._address);
        expect(await call(comptroller, 'closeFactorMantissa')).toEqualNumber(closeFactor);
      });
    });

    describe('_setCollateralFactor', () => {
      const half = etherMantissa(0.5),
        one = etherMantissa(1);

      it('fails if not called by admin', async () => {
        expect(
          await send(unitrollerAsComptroller, '_setCollateralFactor', [cToken._address, half], {
            from: accounts[1]
          })
        ).toHaveTrollFailure('UNAUTHORIZED', 'SET_COLLATERAL_FACTOR_OWNER_CHECK');
      });

      it('fails if asset is not listed', async () => {
        expect(
          await send(unitrollerAsComptroller, '_setCollateralFactor', [cToken._address, half])
        ).toHaveTrollFailure('MARKET_NOT_LISTED', 'SET_COLLATERAL_FACTOR_NO_EXISTS');
      });

      it('fails if factor is too high', async () => {
        const cToken = await makeCToken({ supportMarket: true, comptroller: unitrollerAsComptroller });
        expect(
          await send(unitrollerAsComptroller, '_setCollateralFactor', [cToken._address, one])
        ).toHaveTrollFailure('INVALID_COLLATERAL_FACTOR', 'SET_COLLATERAL_FACTOR_VALIDATION');
      });

      it('fails if factor is set without an underlying price', async () => {
        const cToken = await makeCToken({ supportMarket: true, comptroller: unitrollerAsComptroller });
        expect(
          await send(unitrollerAsComptroller, '_setCollateralFactor', [cToken._address, half])
        ).toHaveTrollFailure('PRICE_ERROR', 'SET_COLLATERAL_FACTOR_WITHOUT_PRICE');
      });

      it('succeeds and sets market', async () => {
        const cToken = await makeCToken({ supportMarket: true, comptroller: unitrollerAsComptroller });
        await send(oracle, 'setUnderlyingPrice', [cToken._address, 1]);
        expect(
          await send(unitrollerAsComptroller, '_setCollateralFactor', [cToken._address, half])
        ).toHaveLog('NewCollateralFactor', {
          cToken: cToken._address,
          oldCollateralFactorMantissa: '0',
          newCollateralFactorMantissa: half.toString()
        });
      });
    });

    describe('_supportMarket', () => {
      it('fails if not called by admin', async () => {
        expect(
          await send(unitrollerAsComptroller, '_supportMarket', [cToken._address], { from: accounts[1] })
        ).toHaveTrollFailure('UNAUTHORIZED', 'SUPPORT_MARKET_OWNER_CHECK');
      });

      it('fails if asset is not a CToken', async () => {
        const notACToken = await makePriceOracle();
        await expect(send(unitrollerAsComptroller, '_supportMarket', [notACToken._address])).rejects.toRevert();
      });

      it('succeeds and sets market', async () => {
        const result = await send(unitrollerAsComptroller, '_supportMarket', [cToken._address]);
        expect(result).toHaveLog('MarketListed', { cToken: cToken._address });
      });

      it('cannot list a market a second time', async () => {
        const result1 = await send(unitrollerAsComptroller, '_supportMarket', [cToken._address]);
        const result2 = await send(unitrollerAsComptroller, '_supportMarket', [cToken._address]);
        expect(result1).toHaveLog('MarketListed', { cToken: cToken._address });
        expect(result2).toHaveTrollFailure('MARKET_ALREADY_LISTED', 'SUPPORT_MARKET_EXISTS');
      });

      it('can list two different markets', async () => {
        const cToken1 = await makeCToken({ comptroller: unitroller });
        const cToken2 = await makeCToken({ comptroller: unitroller });
        const result1 = await send(unitrollerAsComptroller, '_supportMarket', [cToken1._address]);
        const result2 = await send(unitrollerAsComptroller, '_supportMarket', [cToken2._address]);
        expect(result1).toHaveLog('MarketListed', { cToken: cToken1._address });
        expect(result2).toHaveLog('MarketListed', { cToken: cToken2._address });
      });
    });
  });
});
