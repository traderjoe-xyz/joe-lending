const {
  address,
  etherMantissa
} = require('./Utils/Ethereum');

const {
  makeComptroller,
  makeCToken,
  makePriceOracle,
  makeMockAggregator,
} = require('./Utils/Compound');

describe('PriceOracleProxyIB', () => {
  let root, accounts;
  let oracle, backingOracle, cUsdc, cDai, cOthers;

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    const comptroller = await makeComptroller();
    cUsdc = await makeCToken({comptroller: comptroller, supportMarket: true, underlyingOpts: {decimals: 6}});
    cDai = await makeCToken({comptroller: comptroller, supportMarket: true});
    cOthers = await makeCToken({comptroller: comptroller, supportMarket: true});

    backingOracle = await makePriceOracle();
    oracle = await deploy('PriceOracleProxyIB', [root, backingOracle._address]);
  });

  describe("constructor", () => {
    it("sets address of admin", async () => {
      let configuredGuardian = await call(oracle, "admin");
      expect(configuredGuardian).toEqual(root);
    });

    it("sets address of backingOracle", async () => {
      let v1PriceOracle = await call(oracle, "v1PriceOracle");
      expect(v1PriceOracle).toEqual(backingOracle._address);
    });
  });

  describe("getUnderlyingPrice", () => {
    let setPrice = async (cToken, price, base) => {
      const mockAggregator = await makeMockAggregator({answer: etherMantissa(price)});
      await send(
        oracle,
        "_setAggregators",
        [[cToken._address], [mockAggregator._address], [base]]);
    }

    let setAndVerifyBackingPrice = async (cToken, price) => {
      await send(
        backingOracle,
        "setUnderlyingPrice",
        [cToken._address, etherMantissa(price)]);

      let backingOraclePrice = await call(
        backingOracle,
        "assetPrices",
        [cToken.underlying._address]);

      expect(Number(backingOraclePrice)).toEqual(price * 1e18);
    };

    let readAndVerifyProxyPrice = async (token, price) =>{
      let proxyPrice = await call(oracle, "getUnderlyingPrice", [token._address]);
      expect(Number(proxyPrice)).toEqual(price * 1e18);
    };

    it.skip("returns correctly for other tokens", async () => {
      const price = 1;
      const base = 0; // 0: USD

      await setPrice(cUsdc, price, base);
      let proxyPrice = await call(oracle, "getUnderlyingPrice", [cUsdc._address]);
      let underlyingDecimals = await call(cUsdc.underlying, "decimals", []);
      expect(proxyPrice).toEqual(etherMantissa(price * 10**(18 - underlyingDecimals)).toFixed());

      await setPrice(cDai, price, base);
      proxyPrice = await call(oracle, "getUnderlyingPrice", [cUsdc._address]);
      underlyingDecimals = await call(cUsdc.underlying, "decimals", []);
      expect(proxyPrice).toEqual(etherMantissa(price * 10**(18 - underlyingDecimals)).toFixed());
    });

    it("fallbacks to price oracle v1", async () => {
      await setAndVerifyBackingPrice(cOthers, 11);
      await readAndVerifyProxyPrice(cOthers, 11);

      await setAndVerifyBackingPrice(cOthers, 37);
      await readAndVerifyProxyPrice(cOthers, 37);
    });

    it("returns 0 for token without a price", async () => {
      let unlistedToken = await makeCToken({comptroller: cUsdc.comptroller});

      await readAndVerifyProxyPrice(unlistedToken, 0);
    });
  });

  describe("_setAdmin", () => {
    it("set admin successfully", async () => {
      expect(await send(oracle, "_setAdmin", [accounts[0]])).toSucceed();
    });

    it("fails to set admin for non-admin", async () => {
      await expect(send(oracle, "_setAdmin", [accounts[0]], {from: accounts[0]})).rejects.toRevert("revert only the admin may set new admin");
    });
  });

  describe("_setGuardian", () => {
    it("set guardian successfully", async () => {
      expect(await send(oracle, "_setGuardian", [accounts[0]])).toSucceed();
    });

    it("fails to set guardian for non-admin", async () => {
      await expect(send(oracle, "_setGuardian", [accounts[0]], {from: accounts[0]})).rejects.toRevert("revert only the admin may set new guardian");
    });
  });

  describe("_setAggregators", () => {
    let mockAggregator;

    beforeEach(async () => {
      mockAggregator = await makeMockAggregator({answer: etherMantissa(1)});
    });

    it("set aggregators successfully", async () => {
      expect(await send(oracle, "_setAggregators", [[cOthers._address], [mockAggregator._address], [0]])).toSucceed(); // 0: USD
    });

    it("fails to set aggregators for non-admin", async () => {
      await expect(send(oracle, "_setAggregators", [[cOthers._address], [mockAggregator._address], [0]], {from: accounts[0]})).rejects.toRevert("revert only the admin or guardian may set the aggregators"); // 0: USD
      expect(await send(oracle, "_setGuardian", [accounts[0]])).toSucceed();
      await expect(send(oracle, "_setAggregators", [[cOthers._address], [mockAggregator._address], [0]], {from: accounts[0]})).rejects.toRevert("revert guardian may only clear the aggregator"); // 0: USD
    });

    it("fails to set aggregators for mismatched data", async () => {
      await expect(send(oracle, "_setAggregators", [[cOthers._address], [], [0]])).rejects.toRevert("revert mismatched data"); // 0: USD
      await expect(send(oracle, "_setAggregators", [[cOthers._address], [mockAggregator._address], []])).rejects.toRevert("revert mismatched data"); // 0: USD
      await expect(send(oracle, "_setAggregators", [[], [mockAggregator._address], [0]])).rejects.toRevert("revert mismatched data"); // 0: USD
    });

    it("clear aggregators successfully", async () => {
      expect(await send(oracle, "_setGuardian", [accounts[0]])).toSucceed();
      expect(await send(oracle, "_setAggregators", [[cOthers._address], [address(0)], [0]], {from: accounts[0]})).toSucceed(); // 0: USD
    });
  });
});
