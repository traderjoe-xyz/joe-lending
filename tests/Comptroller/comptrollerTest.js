const {
  address,
  etherMantissa,
  both,
  UInt256Max
} = require('../Utils/Ethereum');

const {
  makeComptroller,
  makePriceOracle,
  makeCToken,
  makeToken
} = require('../Utils/Compound');

describe('Comptroller', () => {
  let root, accounts;

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
  });

  describe('constructor', () => {
    it("on success it sets admin to creator and pendingAdmin is unset", async () => {
      const comptroller = await makeComptroller();
      expect(await call(comptroller, 'admin')).toEqual(root);
      expect(await call(comptroller, 'pendingAdmin')).toEqualNumber(0);
    });

    it("on success it sets closeFactor and maxAssets as specified", async () => {
      const comptroller = await makeComptroller();
      expect(await call(comptroller, 'closeFactorMantissa')).toEqualNumber(0.051e18);
    });
  });

  describe('_setLiquidationIncentive', () => {
    const initialIncentive = etherMantissa(1.0);
    const validIncentive = etherMantissa(1.1);

    let comptroller;
    beforeEach(async () => {
      comptroller = await makeComptroller();
    });

    it("fails if called by non-admin", async () => {
      const {reply, receipt} = await both(comptroller, '_setLiquidationIncentive', [initialIncentive], {from: accounts[0]});
      expect(reply).toHaveTrollError('UNAUTHORIZED');
      expect(receipt).toHaveTrollFailure('UNAUTHORIZED', 'SET_LIQUIDATION_INCENTIVE_OWNER_CHECK');
      expect(await call(comptroller, 'liquidationIncentiveMantissa')).toEqualNumber(initialIncentive);
    });

    it("accepts a valid incentive and emits a NewLiquidationIncentive event", async () => {
      const {reply, receipt} = await both(comptroller, '_setLiquidationIncentive', [validIncentive]);
      expect(reply).toHaveTrollError('NO_ERROR');
      expect(receipt).toHaveLog('NewLiquidationIncentive', {
        oldLiquidationIncentiveMantissa: initialIncentive.toString(),
        newLiquidationIncentiveMantissa: validIncentive.toString()
      });
      expect(await call(comptroller, 'liquidationIncentiveMantissa')).toEqualNumber(validIncentive);
    });
  });

  describe('_setPriceOracle', () => {
    let comptroller, oldOracle, newOracle;
    beforeEach(async () => {
      comptroller = await makeComptroller();
      oldOracle = comptroller.priceOracle;
      newOracle = await makePriceOracle();
    });

    it("fails if called by non-admin", async () => {
      expect(
        await send(comptroller, '_setPriceOracle', [newOracle._address], {from: accounts[0]})
      ).toHaveTrollFailure('UNAUTHORIZED', 'SET_PRICE_ORACLE_OWNER_CHECK');
      expect(await comptroller.methods.oracle().call()).toEqual(oldOracle._address);
    });

    it.skip("reverts if passed a contract that doesn't implement isPriceOracle", async () => {
      await expect(send(comptroller, '_setPriceOracle', [comptroller._address])).rejects.toRevert();
      expect(await call(comptroller, 'oracle')).toEqual(oldOracle._address);
    });

    it.skip("reverts if passed a contract that implements isPriceOracle as false", async () => {
      await send(newOracle, 'setIsPriceOracle', [false]); // Note: not yet implemented
      await expect(send(notOracle, '_setPriceOracle', [comptroller._address])).rejects.toRevert("revert oracle method isPriceOracle returned false");
      expect(await call(comptroller, 'oracle')).toEqual(oldOracle._address);
    });

    it("accepts a valid price oracle and emits a NewPriceOracle event", async () => {
      const result = await send(comptroller, '_setPriceOracle', [newOracle._address]);
      expect(result).toSucceed();
      expect(result).toHaveLog('NewPriceOracle', {
        oldPriceOracle: oldOracle._address,
        newPriceOracle: newOracle._address
      });
      expect(await call(comptroller, 'oracle')).toEqual(newOracle._address);
    });
  });

  describe('_setLiquidityMining', () => {
    // We don't test liquidity mining module here.
    const liquidityMining = address(1);
    let comptroller;
    beforeEach(async () => {
      comptroller = await makeComptroller();
    });

    it("fails if called by non-admin", async () => {
      await expect(send(comptroller, '_setLiquidityMining', [liquidityMining], {from: accounts[0]})).rejects.toRevert("revert only admin can set liquidity mining module");
    });

    it("succeeds and emits a NewLiquidityMining event", async () => {
      const result = await send(comptroller, '_setLiquidityMining', [liquidityMining]);
      expect(result).toSucceed();
      expect(result).toHaveLog('NewLiquidityMining', {
        oldLiquidityMining: address(0),
        newLiquidityMining: liquidityMining
      });
      expect(await call(comptroller, 'liquidityMining')).toEqual(liquidityMining);
    });
  });

  describe('_setCloseFactor', () => {
    it("fails if not called by admin", async () => {
      const cToken = await makeCToken();
      expect(
        await send(cToken.comptroller, '_setCloseFactor', [1], {from: accounts[0]})
      ).toHaveTrollFailure('UNAUTHORIZED', 'SET_CLOSE_FACTOR_OWNER_CHECK');
    });
  });

  describe('_setCollateralFactor', () => {
    const half = etherMantissa(0.5);
    const one = etherMantissa(1);

    it("fails if not called by admin", async () => {
      const cToken = await makeCToken();
      expect(
        await send(cToken.comptroller, '_setCollateralFactor', [cToken._address, half], {from: accounts[0]})
      ).toHaveTrollFailure('UNAUTHORIZED', 'SET_COLLATERAL_FACTOR_OWNER_CHECK');
    });

    it("fails if asset is not listed", async () => {
      const cToken = await makeCToken();
      expect(
        await send(cToken.comptroller, '_setCollateralFactor', [cToken._address, half])
      ).toHaveTrollFailure('MARKET_NOT_LISTED', 'SET_COLLATERAL_FACTOR_NO_EXISTS');
    });

    it("fails if factor is too high", async () => {
      const cToken = await makeCToken({supportMarket: true});
      expect(
        await send(cToken.comptroller, '_setCollateralFactor', [cToken._address, one])
      ).toHaveTrollFailure('INVALID_COLLATERAL_FACTOR', 'SET_COLLATERAL_FACTOR_VALIDATION');
    });

    it("fails if factor is set without an underlying price", async () => {
      const cToken = await makeCToken({supportMarket: true});
      expect(
        await send(cToken.comptroller, '_setCollateralFactor', [cToken._address, half])
      ).toHaveTrollFailure('PRICE_ERROR', 'SET_COLLATERAL_FACTOR_WITHOUT_PRICE');
    });

    it("succeeds and sets market", async () => {
      const cToken = await makeCToken({supportMarket: true, underlyingPrice: 1});
      const result = await send(cToken.comptroller, '_setCollateralFactor', [cToken._address, half]);
      expect(result).toHaveLog('NewCollateralFactor', {
        cToken: cToken._address,
        oldCollateralFactorMantissa: '0',
        newCollateralFactorMantissa: half.toString()
      });
    });
  });

  describe('_supportMarket', () => {
    const version = 0;

    it("fails if not called by admin", async () => {
      const cToken = await makeCToken(root);
      await expect(send(cToken.comptroller, '_supportMarket', [cToken._address, version], {from: accounts[0]})).rejects.toRevert('revert only admin may support market');
    });

    it("fails if asset is not a CToken", async () => {
      const comptroller = await makeComptroller()
      const asset = await makeToken(root);
      await expect(send(comptroller, '_supportMarket', [asset._address, version])).rejects.toRevert();
    });

    it("succeeds and sets market", async () => {
      const cToken = await makeCToken();
      const result = await send(cToken.comptroller, '_supportMarket', [cToken._address, version]);
      expect(result).toHaveLog('MarketListed', {cToken: cToken._address});
    });

    it("cannot list a market a second time", async () => {
      const cToken = await makeCToken();
      const result1 = await send(cToken.comptroller, '_supportMarket', [cToken._address, version]);
      expect(result1).toHaveLog('MarketListed', {cToken: cToken._address});
      await expect(send(cToken.comptroller, '_supportMarket', [cToken._address, version])).rejects.toRevert('revert market already listed');
    });

    it("can list two different markets", async () => {
      const cToken1 = await makeCToken();
      const cToken2 = await makeCToken({comptroller: cToken1.comptroller});
      const result1 = await send(cToken1.comptroller, '_supportMarket', [cToken1._address, version]);
      const result2 = await send(cToken1.comptroller, '_supportMarket', [cToken2._address, version]);
      expect(result1).toHaveLog('MarketListed', {cToken: cToken1._address});
      expect(result2).toHaveLog('MarketListed', {cToken: cToken2._address});
    });
  });

  describe('_setCreditLimit', () => {
    const creditLimit = etherMantissa(500);

    it("fails if not called by admin", async () => {
      const cToken = await makeCToken(root);
      await expect(send(cToken.comptroller, '_setCreditLimit', [accounts[0], creditLimit], {from: accounts[0]})).rejects.toRevert("revert only admin can set protocol credit limit");
    });

    it("succeeds and sets credit limit", async () => {
      const cToken = await makeCToken();
      const result = await send(cToken.comptroller, '_setCreditLimit', [accounts[0], creditLimit]);
      expect(result).toHaveLog('CreditLimitChanged', {protocol: accounts[0], creditLimit: creditLimit.toString()});
    });

    it("succeeds and sets to max credit limit", async () => {
      const cToken = await makeCToken();
      const result = await send(cToken.comptroller, '_setCreditLimit', [accounts[0], UInt256Max()]);
      expect(result).toHaveLog('CreditLimitChanged', {protocol: accounts[0], creditLimit: UInt256Max().toString()});
    });

    it("succeeds and sets to 0 credit limit", async () => {
      const cToken = await makeCToken();
      const result = await send(cToken.comptroller, '_setCreditLimit', [accounts[0], 0]);
      expect(result).toHaveLog('CreditLimitChanged', {protocol: accounts[0], creditLimit: '0'});
    });
  });

  describe('_delistMarket', () => {
    const version = 0;

    it("fails if not called by admin", async () => {
      const cToken = await makeCToken(root);
      await expect(send(cToken.comptroller, '_delistMarket', [cToken._address], {from: accounts[0]})).rejects.toRevert('revert only admin may delist market');
    });

    it("fails if market not listed", async () => {
      const comptroller = await makeComptroller()
      const asset = await makeToken(root);
      await expect(send(comptroller, '_delistMarket', [asset._address])).rejects.toRevert('revert market not listed');
    });

    it("fails if market not empty", async () => {
      const cToken = await makeCToken(root);
      expect(await send(cToken.comptroller, '_supportMarket', [cToken._address, version])).toSucceed();
      await send(cToken, 'harnessSetTotalSupply', [1]);
      await expect(send(cToken.comptroller, '_delistMarket', [cToken._address])).rejects.toRevert('revert market not empty');
    });

    it("succeeds and delists market", async () => {
      const cToken = await makeCToken();
      expect(await send(cToken.comptroller, '_supportMarket', [cToken._address, version])).toSucceed();
      const result = await send(cToken.comptroller, '_delistMarket', [cToken._address]);
      expect(result).toHaveLog('MarketDelisted', {cToken: cToken._address});
    });

    it("can delist two different markets", async () => {
      const cToken1 = await makeCToken();
      const cToken2 = await makeCToken({comptroller: cToken1.comptroller});
      expect(await send(cToken1.comptroller, '_supportMarket', [cToken1._address, version])).toSucceed();
      expect(await send(cToken2.comptroller, '_supportMarket', [cToken2._address, version])).toSucceed();
      const result1 = await send(cToken1.comptroller, '_delistMarket', [cToken1._address]);
      const result2 = await send(cToken2.comptroller, '_delistMarket', [cToken2._address]);
      expect(result1).toHaveLog('MarketDelisted', {cToken: cToken1._address});
      expect(result2).toHaveLog('MarketDelisted', {cToken: cToken2._address});
    });
  });

  describe('redeemVerify', () => {
    it('should allow you to redeem 0 underlying for 0 tokens', async () => {
      const comptroller = await makeComptroller();
      const cToken = await makeCToken({comptroller: comptroller});
      await call(comptroller, 'redeemVerify', [cToken._address, accounts[0], 0, 0]);
    });

    it('should allow you to redeem 5 underlyig for 5 tokens', async () => {
      const comptroller = await makeComptroller();
      const cToken = await makeCToken({comptroller: comptroller});
      await call(comptroller, 'redeemVerify', [cToken._address, accounts[0], 5, 5]);
    });

    it('should not allow you to redeem 5 underlying for 0 tokens', async () => {
      const comptroller = await makeComptroller();
      const cToken = await makeCToken({comptroller: comptroller});
      await expect(call(comptroller, 'redeemVerify', [cToken._address, accounts[0], 5, 0])).rejects.toRevert("revert redeemTokens zero");
    });
  });
});
