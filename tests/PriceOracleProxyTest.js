const {
  etherMantissa
} = require('./Utils/Ethereum');

const {
  makeCToken,
  makePriceOracle,
  makeMockAggregator
} = require('./Utils/Compound');

describe('PriceOracleProxy', () => {
  let root, accounts;
  let oracle, backingOracle, cEth, cDai, cYcrv, cYusd, cYeth, cXSushi, cOther;

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    cEth = await makeCToken({kind: "cether", comptrollerOpts: {kind: "v1-no-proxy"}, supportMarket: true});
    cDai = await makeCToken({comptroller: cEth.comptroller, supportMarket: true});
    cYcrv = await makeCToken({comptroller: cEth.comptroller, supportMarket: true});
    cYusd = await makeCToken({comptroller: cEth.comptroller, supportMarket: true});
    cYeth = await makeCToken({comptroller: cEth.comptroller, supportMarket: true});
    cOther = await makeCToken({comptroller: cEth.comptroller, supportMarket: true});
    cXSushi = await makeCToken({comptroller: cEth.comptroller, supportMarket: true});

    backingOracle = await makePriceOracle();
    oracle = await deploy('PriceOracleProxy',
      [
        root,
        backingOracle._address,
        cEth._address,
        cYcrv._address,
        cYusd._address,
        cYeth._address,
        cXSushi._address
      ]
     );
  });

  describe("constructor", () => {
    it("sets address of admin", async () => {
      let configuredGuardian = await call(oracle, "admin");
      expect(configuredGuardian).toEqual(root);
    });

    it("sets address of v1 oracle", async () => {
      let configuredOracle = await call(oracle, "v1PriceOracle");
      expect(configuredOracle).toEqual(backingOracle._address);
    });

    it("sets address of cEth", async () => {
      let configuredCEther = await call(oracle, "cEthAddress");
      expect(configuredCEther).toEqual(cEth._address);
    });

    it("sets address of cYcrv", async () => {
      let configuredCYCRV = await call(oracle, "cYcrvAddress");
      expect(configuredCYCRV).toEqual(cYcrv._address);
    });

    it("sets address of cYusd", async () => {
      let configuredCYUSD = await call(oracle, "cYusdAddress");
      expect(configuredCYUSD).toEqual(cYusd._address);
    });

    it("sets address of cYeth", async () => {
      let configuredCYETH = await call(oracle, "cYethAddress");
      expect(configuredCYETH).toEqual(cYeth._address);
    });

    it("sets address of cXSushi", async () => {
      let configuredCXSUSHI = await call(oracle, "cXSushiAddress");
      expect(configuredCXSUSHI).toEqual(cXSushi._address);
    });
  });

  describe("getUnderlyingPrice", () => {
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

    let setPrice = async (token, price) => {
      const mockAggregator = await makeMockAggregator({answer: etherMantissa(price)});
      await send(
        oracle,
        "_setAggregators",
        [[token._address], [mockAggregator._address]]);
    }

    it("always returns 1e18 for cEth", async () => {
      await readAndVerifyProxyPrice(cEth, 1);
    });

    it("proxies for whitelisted tokens", async () => {
      await setAndVerifyBackingPrice(cOther, 11);
      await readAndVerifyProxyPrice(cOther, 11);

      await setAndVerifyBackingPrice(cOther, 37);
      await readAndVerifyProxyPrice(cOther, 37);
    });

    it("returns 0 for token without a price", async () => {
      let unlistedToken = await makeCToken({comptroller: cEth.comptroller});

      await readAndVerifyProxyPrice(unlistedToken, 0);
    });

    it("gets price from chainlink", async () => {
      const price = 1;

      await setPrice(cOther.underlying, price);
      let proxyPrice = await call(oracle, "getUnderlyingPrice", [cOther._address]);
      expect(proxyPrice).toEqual(etherMantissa(price).toFixed());
    });
  });
});
