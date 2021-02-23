const {
  etherMantissa
} = require('./Utils/Ethereum');

const {
  makeComptroller,
  makeCToken,
  makePriceOracle,
  makeMockAggregator,
  makeMockReference
} = require('./Utils/Compound');

describe('PriceOracleProxyIB', () => {
  let root, accounts;
  let oracle, backingOracle, cUsdc, cOthers;
  let reference;

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    const comptroller = await makeComptroller();
    cUsdc = await makeCToken({comptroller: comptroller, supportMarket: true, underlyingOpts: {decimals: 6}});
    cOthers = await makeCToken({comptroller: comptroller, supportMarket: true});
    reference = await makeMockReference();

    backingOracle = await makePriceOracle();
    oracle = await deploy('PriceOracleProxyFTM', [root, backingOracle._address, reference._address]);
  });

  describe("constructor", () => {
    it("sets address of admin", async () => {
      let configuredGuardian = await call(oracle, "admin");
      expect(configuredGuardian).toEqual(root);
    });

    it("sets address of reference", async () => {
      let configuredRef = await call(oracle, "ref");
      expect(configuredRef).toEqual(reference._address);
    });

    it("sets address of v1 price oracle", async () => {
      let configuredV1 = await call(oracle, "v1PriceOracle");
      expect(configuredV1).toEqual(backingOracle._address);
    });
  });

  describe("getUnderlyingPrice", () => {
    let setChainLinkPrice = async (cToken, price) => {
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
    };

    let setBandPrice = async (cToken, price) => {
      await send(reference, "setReferenceData", [cToken.symbol, etherMantissa(price), 0, 0]);
      await send(oracle, "_setUnderlyingSymbols", [[cToken._address], [cToken.symbol]]);
    };

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

    it("gets price from chain link and band", async () => {
      const price1 = 1.01;
      const price2 = 0.99;
      const avePrice = 1;

      await setChainLinkPrice(cUsdc, price1);
      await setBandPrice(cUsdc, price2);
      const proxyPrice = await call(oracle, "getUnderlyingPrice", [cUsdc._address]);
      let underlyingDecimals = await call(cUsdc.underlying, "decimals", []);
      expect(proxyPrice).toEqual(etherMantissa(avePrice * 10**(18 - underlyingDecimals)).toFixed());
    });

    it("fails for the difference between two prices too large", async () => {
      const price1 = 2;
      const price2 = 1;

      await setChainLinkPrice(cUsdc, price1);
      await setBandPrice(cUsdc, price2);
      await expect(call(oracle, "getUnderlyingPrice", [cUsdc._address])).rejects.toRevert("revert too much diff between price feeds");
    });

    it("gets price from chainlink", async () => {
      const price = 1;
      await setChainLinkPrice(cUsdc, price);
      const proxyPrice = await call(oracle, "getUnderlyingPrice", [cUsdc._address]);
      let underlyingDecimals = await call(cUsdc.underlying, "decimals", []);
      expect(proxyPrice).toEqual(etherMantissa(price * 10**(18 - underlyingDecimals)).toFixed());
    });

    it("gets price from band", async () => {
      const price = 1;
      await setBandPrice(cUsdc, price);
      const proxyPrice = await call(oracle, "getUnderlyingPrice", [cUsdc._address]);
      let underlyingDecimals = await call(cUsdc.underlying, "decimals", []);
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
});
