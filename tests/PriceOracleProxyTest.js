const {
  etherMantissa
} = require('./Utils/Ethereum');

const {
  makeComptroller,
  makeCToken,
  makeMockAggregator,
} = require('./Utils/Compound');

describe('PriceOracleProxy', () => {
  let root, accounts;
  let oracle, cEth, cUsdc, cDai, cOthers;

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    const comptroller = await makeComptroller();
    cEth = await makeCToken({kind: "cether", comptroller: comptroller, supportMarket: true});
    cUsdc = await makeCToken({comptroller: comptroller, supportMarket: true, underlyingOpts: {decimals: 6}});
    cDai = await makeCToken({comptroller: comptroller, supportMarket: true});
    cOthers = await makeCToken({comptroller: comptroller, supportMarket: true});

    oracle = await deploy('PriceOracleProxy', [root, cEth._address]);
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

    it("reverts for token without a price", async () => {
      await expect(call(oracle, "getUnderlyingPrice", [cOthers._address])).rejects.toRevert("invalid opcode");
    });
  });
});
