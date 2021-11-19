const { makeJToken } = require("../Utils/BankerJoe");

const exchangeRate = 50e3;

describe("JToken", function () {
  let root, admin, accounts;
  let jToken;

  beforeEach(async () => {
    [root, admin, ...accounts] = saddle.accounts;
    jToken = await makeJToken({
      kind: "jcollateralcap",
      joetrollerOpts: { kind: "bool" },
      exchangeRate,
    });
  });

  it("fails to register collateral for non joetroller", async () => {
    await expect(send(jToken, "registerCollateral", [root])).rejects.toRevert(
      "revert only joetroller may register collateral for user"
    );
  });

  it("fails to unregister collateral for non joetroller", async () => {
    await expect(send(jToken, "unregisterCollateral", [root])).rejects.toRevert(
      "revert only joetroller may unregister collateral for user"
    );
  });
});
