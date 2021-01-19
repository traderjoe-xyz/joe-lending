const {
  etherMantissa
} = require('./Utils/Ethereum');

const {
  makeComptroller,
  makeCToken,
  makePriceOracle,
  makeMockAggregator,
} = require('./Utils/Compound');

describe('PriceOracleProxy', () => {
  let root, accounts;
  let oracle, backingOracle, cEth, cUsdc, cDai, cOthers;

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    const comptroller = await makeComptroller();
    cEth = await makeCToken({kind: "cether", comptroller: comptroller, supportMarket: true});
    cUsdc = await makeCToken({comptroller: comptroller, supportMarket: true, underlyingOpts: {decimals: 6}});
    cDai = await makeCToken({comptroller: comptroller, supportMarket: true});
    cOthers = await makeCToken({comptroller: comptroller, supportMarket: true});

    backingOracle = await makePriceOracle();
    oracle = await deploy('PriceOracleProxy', [root, backingOracle._address, cEth._address]);
  });

  describe("constructor", () => {
    it("sets address of admin", async () => {
      let configuredGuardian = await call(oracle, "admin");
      expect(configuredGuardian).toEqual(root);
    });

    it("sets address of cEth", async () => {
      let configuredCEther = await call(oracle, "cEthAddress");
      expect(configuredCEther).toEqual(cEth._address);
    });
  });

  describe("getUnderlyingPrice", () => {
    let setPrice = async (cToken, price) => {
      const answerDecimals = 8;
      const mockAggregator = await makeMockAggregator({answer: price * 1e8});
      await send(
        mockAggregator,
        "setDecimals",
        [answerDecimals]);
      await send(
        oracle,
        "_setAggregators",
        [[cToken._address], [mockAggregator._address]]);
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

    it("returns correctly for cEth", async () => {
      await setPrice(cEth, 100);
      const proxyPrice = await call(oracle, "getUnderlyingPrice", [cEth._address]);
      expect(proxyPrice).toEqual(etherMantissa(100).toFixed());
    });

    it("returns correctly for other tokens", async () => {
      const price = 1;

      await setPrice(cUsdc, price);
      let proxyPrice = await call(oracle, "getUnderlyingPrice", [cUsdc._address]);
      let underlyingDecimals = await call(cUsdc.underlying, "decimals", []);
      expect(proxyPrice).toEqual(etherMantissa(price * 10**(18 - underlyingDecimals)).toFixed());

      await setPrice(cDai, price);
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
      let unlistedToken = await makeCToken({comptroller: cEth.comptroller});

      await readAndVerifyProxyPrice(unlistedToken, 0);
    });
  });
});
