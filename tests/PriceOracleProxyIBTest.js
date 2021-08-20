const {
  address,
  etherMantissa
} = require('./Utils/Ethereum');

const {
  makeComptroller,
  makeToken,
  makeCToken,
  makePriceOracle,
  makeMockRegistry,
  makeMockReference,
} = require('./Utils/Compound');

describe('PriceOracleProxyIB', () => {
  const usdAddress = '0x0000000000000000000000000000000000000348';
  const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

  let root, accounts;
  let oracle, backingOracle, cUsdc, cDai, cOther;
  let registry, reference;

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    const comptroller = await makeComptroller();
    cUsdc = await makeCToken({comptroller: comptroller, supportMarket: true, underlyingOpts: {decimals: 6}});
    cDai = await makeCToken({comptroller: comptroller, supportMarket: true});
    cOther = await makeCToken({comptroller: comptroller, supportMarket: true});
    registry = await makeMockRegistry();
    reference = await makeMockReference();

    backingOracle = await makePriceOracle();
    oracle = await deploy('PriceOracleProxyIB', [root, backingOracle._address, registry._address, reference._address]);
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

    it("sets address of registry", async () => {
      let reg = await call(oracle, "reg");
      expect(reg).toEqual(registry._address);
    });

    it("sets address of reference", async () => {
      let ref = await call(oracle, "ref");
      expect(ref).toEqual(reference._address);
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

    let setChainLinkPrice = async (token, base, baseAddress, price) => {
      await send(registry, "setAnswer", [token, baseAddress, price]);
      await send(
        oracle,
        "_setAggregators",
        [[token], [base]]);
    }

    let setBandPrice = async (token, price) => {
      const symbol = await call(token, "symbol");
      await send(reference, "setReferenceData", [symbol, price, 0, 0]);
      await send(oracle, "_setReferences", [[token._address], [symbol]]);
    };

    it("gets price from chainlink", async () => {
      const price = '100000000'; // 1e8

      await setChainLinkPrice(cOther.underlying._address, 'USD', usdAddress, price);
      let proxyPrice = await call(oracle, "getUnderlyingPrice", [cOther._address]);
      expect(proxyPrice).toEqual(etherMantissa(1).toFixed());
    });

    it("gets price from chainlink (ETH based)", async () => {
      const price = '100000000'; // 1e8
      const ethPrice = '300000000000'; // 3000 * 1e8

      await setChainLinkPrice(cOther.underlying._address, 'ETH', ethAddress, price);
      await setChainLinkPrice(ethAddress, 'USD', usdAddress, ethPrice);
      let proxyPrice = await call(oracle, "getUnderlyingPrice", [cOther._address]);
      expect(proxyPrice).toEqual(etherMantissa(3000).toFixed());
    });

    it("gets price from band", async () => {
      const price = etherMantissa(1);

      await setBandPrice(cOther.underlying, price);
      let proxyPrice = await call(oracle, "getUnderlyingPrice", [cOther._address]);
      expect(proxyPrice).toEqual(price.toFixed());
    });

    it("fallbacks to price oracle v1", async () => {
      await setAndVerifyBackingPrice(cOther, 11);
      await readAndVerifyProxyPrice(cOther, 11);

      await setAndVerifyBackingPrice(cOther, 37);
      await readAndVerifyProxyPrice(cOther, 37);
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
    const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
    const btcAddress = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB';
    const usdAddress = '0x0000000000000000000000000000000000000348';
    const wbtcAddress = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599';

    let token;

    beforeEach(async () => {
      token = await makeToken();
    });

    it("set aggregators successfully", async () => {
      // token - ETH
      expect(await send(oracle, "_setAggregators", [[token._address], ['ETH']])).toSucceed();

      let aggregator = await call(oracle, "aggregators", [token._address]);
      expect(aggregator.base).toEqual(token._address);
      expect(aggregator.quote).toEqual(ethAddress);
      expect(aggregator.isUsed).toEqual(true);

      // token - USD
      expect(await send(oracle, "_setAggregators", [[token._address], ['USD']])).toSucceed();

      aggregator = await call(oracle, "aggregators", [token._address]);
      expect(aggregator.base).toEqual(token._address);
      expect(aggregator.quote).toEqual(usdAddress);
      expect(aggregator.isUsed).toEqual(true);

      // BTC - ETH
      expect(await send(oracle, "_setAggregators", [[wbtcAddress], ['ETH']])).toSucceed();

      aggregator = await call(oracle, "aggregators", [wbtcAddress]);
      expect(aggregator.base).toEqual(btcAddress);
      expect(aggregator.quote).toEqual(ethAddress);
      expect(aggregator.isUsed).toEqual(true);
    });

    it("fails to set aggregators for non-admin", async () => {
      await expect(send(oracle, "_setAggregators", [[token._address], ['ETH']], {from: accounts[0]})).rejects.toRevert("revert only the admin or guardian may set the aggregators");
      expect(await send(oracle, "_setGuardian", [accounts[0]])).toSucceed();
      await expect(send(oracle, "_setAggregators", [[token._address], ['ETH']], {from: accounts[0]})).rejects.toRevert("revert guardian may only clear the aggregator");
    });

    it("fails to set aggregators for mismatched data", async () => {
      await expect(send(oracle, "_setAggregators", [[token._address], []])).rejects.toRevert("revert mismatched data");
      await expect(send(oracle, "_setAggregators", [[], ['ETH']])).rejects.toRevert("revert mismatched data");
    });

    it("fails to set aggregators for unsupported denomination", async () => {
      await expect(send(oracle, "_setAggregators", [[token._address], ['ABC']])).rejects.toRevert("revert unsupported denomination");
    });

    it("fails to set aggregators for aggregator not enabled", async () => {
      await send(registry, 'setFeedDisabled', [true]);
      await expect(send(oracle, "_setAggregators", [[token._address], ['ETH']])).rejects.toRevert("revert aggregator not enabled");
    });

    it("clear aggregators successfully", async () => {
      expect(await send(oracle, "_setGuardian", [accounts[0]])).toSucceed();
      expect(await send(oracle, "_setAggregators", [[token._address], ['']], {from: accounts[0]})).toSucceed();

      const aggregator = await call(oracle, "aggregators", [token._address]);
      expect(aggregator.base).toEqual(address(0));
      expect(aggregator.quote).toEqual(address(0));
      expect(aggregator.isUsed).toEqual(false);
    });
  });

  describe("_setReferences", () => {
    let token;
    let symbol;

    let setBandPrice = async (token, symbol, price) => {
      await send(reference, "setReferenceData", [symbol, price, 0, 0]);
      await send(oracle, "_setReferences", [[token._address], [symbol]]);
    };

    beforeEach(async () => {
      token = await makeToken();
      symbol = await call(token, "symbol");
    });

    it("set references successfully", async () => {
      const price = etherMantissa(1);
      await setBandPrice(token, symbol, price);
      expect(await send(oracle, "_setReferences", [[token._address], [symbol]])).toSucceed();

      const reference = await call(oracle, "references", [token._address]);
      expect(reference.symbol).toEqual(symbol);
      expect(reference.isUsed).toEqual(true);
    });

    it("fails to set references for non-admin", async () => {
      await expect(send(oracle, "_setReferences", [[token._address], [symbol]], {from: accounts[0]})).rejects.toRevert("revert only the admin or guardian may set the references");
      expect(await send(oracle, "_setGuardian", [accounts[0]])).toSucceed();
      await expect(send(oracle, "_setReferences", [[token._address], [symbol]], {from: accounts[0]})).rejects.toRevert("revert guardian may only clear the reference");
    });

    it("fails to set references for mismatched data", async () => {
      await expect(send(oracle, "_setReferences", [[token._address], []])).rejects.toRevert("revert mismatched data");
      await expect(send(oracle, "_setReferences", [[], [symbol]])).rejects.toRevert("revert mismatched data");
    });

    it("fails to set references for invalid price", async () => {
      await expect(send(oracle, "_setReferences", [[token._address], [symbol]])).rejects.toRevert("revert invalid price");
    });

    it("clear references successfully", async () => {
      expect(await send(oracle, "_setGuardian", [accounts[0]])).toSucceed();
      expect(await send(oracle, "_setReferences", [[token._address], ['']], {from: accounts[0]})).toSucceed();

      const reference = await call(oracle, "references", [token._address]);
      expect(reference.symbol).toEqual('');
      expect(reference.isUsed).toEqual(false);
    });
  });
});
