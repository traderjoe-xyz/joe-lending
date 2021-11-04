const { address, avaxMantissa } = require("./Utils/Avalanche");

const {
  makeToken,
  makeJToken,
  makeCurveSwap,
  makePriceOracle,
  makeMockAggregator,
} = require("./Utils/BankerJoe");

describe("PriceOracleProxy", () => {
  const usdAddress = "0x0000000000000000000000000000000000000348";
  const avaxAddress = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

  let root, accounts;
  let oracle, jAvax, jDai, jOther;

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    jAvax = await makeJToken({
      kind: "jwrapped",
      joetrollerOpts: { kind: "v1-no-proxy" },
      supportMarket: true,
    });
    jDai = await makeJToken({
      joetroller: jAvax.joetroller,
      supportMarket: true,
    });
    jOther = await makeJToken({
      joetroller: jAvax.joetroller,
      supportMarket: true,
    });

    oracle = await deploy("PriceOracleProxyUSD", [root]);
  });

  describe("constructor", () => {
    it("sets address of admin", async () => {
      let configuredGuardian = await call(oracle, "admin");
      expect(configuredGuardian).toEqual(root);
    });
  });

  describe("getUnderlyingPrice", () => {
    let setPrice = async (jToken, source) => {
      await send(oracle, "_setAggregators", [[jToken], [source]]);
    };

    let setAndVerifyBackingPrice = async (jToken, price) => {
      const mockAggregator = await makeMockAggregator({
        answer: avaxMantissa(price),
      });
      await setPrice(jToken._address, mockAggregator._address);

      let oraclePrice = await call(oracle, "getUnderlyingPrice", [
        jToken._address,
      ]);

      expect(Number(oraclePrice)).toEqual(price * 1e18);
    };

    let readAndVerifyProxyPrice = async (token, price) => {
      let proxyPrice = await call(oracle, "getUnderlyingPrice", [
        token._address,
      ]);
      expect(Number(proxyPrice)).toEqual(price * 1e18);
    };

    it("always returns 1e18 for jAvax", async () => {
      await setAndVerifyBackingPrice(jAvax, 1);
    });

    it("proxies for whitelisted tokens", async () => {
      await setAndVerifyBackingPrice(jOther, 11);
      await readAndVerifyProxyPrice(jOther, 11);

      await setAndVerifyBackingPrice(jOther, 37);
      await readAndVerifyProxyPrice(jOther, 37);
    });

    it("returns for token without a price", async () => {
      let unlistedToken = await makeJToken({ joetroller: jAvax.joetroller });

      await expect(readAndVerifyProxyPrice(unlistedToken, 0)).rejects.toRevert(
        "revert invalid price"
      );
    });
  });

  describe("_setAdmin", () => {
    it("set admin successfully", async () => {
      expect(await send(oracle, "_setAdmin", [accounts[0]])).toSucceed();
    });

    it("fails to set admin for non-admin", async () => {
      await expect(
        send(oracle, "_setAdmin", [accounts[0]], { from: accounts[0] })
      ).rejects.toRevert("revert only the admin may set new admin");
    });
  });

  describe("_setGuardian", () => {
    it("set guardian successfully", async () => {
      expect(await send(oracle, "_setGuardian", [accounts[0]])).toSucceed();
    });

    it("fails to set guardian for non-admin", async () => {
      await expect(
        send(oracle, "_setGuardian", [accounts[0]], { from: accounts[0] })
      ).rejects.toRevert("revert only the admin may set new guardian");
    });
  });

  describe("_setAggregators", () => {
    const avaxAddress = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
    const btcAddress = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB";
    const usdAddress = "0x0000000000000000000000000000000000000348";
    const wbtcAddress = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";

    let token;

    beforeEach(async () => {
      token = await makeToken();
    });

    it("fails to set aggregators for non-admin", async () => {
      const mockAggregator = await makeMockAggregator({
        answer: avaxMantissa(1),
      });
      await expect(
        send(
          oracle,
          "_setAggregators",
          [[jOther._address], [mockAggregator._address]],
          { from: accounts[0] }
        )
      ).rejects.toRevert(
        "revert only the admin or guardian may set the aggregators"
      );
      expect(await send(oracle, "_setGuardian", [accounts[0]])).toSucceed();
      await expect(
        send(
          oracle,
          "_setAggregators",
          [[jOther._address], [mockAggregator._address]],
          { from: accounts[0] }
        )
      ).rejects.toRevert("revert guardian may only clear the aggregator");
    });

    it("fails to set aggregators for mismatched data", async () => {
      const mockAggregator = await makeMockAggregator({
        answer: avaxMantissa(1),
      });
      await expect(
        send(oracle, "_setAggregators", [
          [jOther._address, jDai._address],
          [mockAggregator._address],
        ])
      ).rejects.toRevert("revert mismatched data");
    });

    it("clear aggregators successfully", async () => {
      expect(await send(oracle, "_setGuardian", [accounts[0]])).toSucceed();
      expect(
        await send(
          oracle,
          "_setAggregators",
          [[jOther._address], [address(0)]],
          { from: accounts[0] }
        )
      ).toSucceed();

      const aggregator = await call(oracle, "aggregators", [jOther._address]);
      expect(aggregator).toEqual(address(0));
    });
  });
});
