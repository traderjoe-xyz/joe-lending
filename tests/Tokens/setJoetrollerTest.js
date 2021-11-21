const { makeJoetroller, makeJToken } = require("../Utils/BankerJoe");

describe("JToken", function () {
  let root, accounts;
  let jToken, oldJoetroller, newJoetroller;
  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    jToken = await makeJToken();
    oldJoetroller = jToken.joetroller;
    newJoetroller = await makeJoetroller();
    expect(newJoetroller._address).not.toEqual(oldJoetroller._address);
  });

  describe("_setJoetroller", () => {
    it("should fail if called by non-admin", async () => {
      expect(
        await send(jToken, "_setJoetroller", [newJoetroller._address], {
          from: accounts[0],
        })
      ).toHaveTokenFailure("UNAUTHORIZED", "SET_JOETROLLER_OWNER_CHECK");
      expect(await call(jToken, "joetroller")).toEqual(oldJoetroller._address);
    });

    it("reverts if passed a contract that doesn't implement isJoetroller", async () => {
      await expect(
        send(jToken, "_setJoetroller", [jToken.underlying._address])
      ).rejects.toRevert("revert");
      expect(await call(jToken, "joetroller")).toEqual(oldJoetroller._address);
    });

    it("reverts if passed a contract that implements isJoetroller as false", async () => {
      // extremely unlikely to occur, of course, but let's be exhaustive
      const badJoetroller = await makeJoetroller({ kind: "false-marker" });
      await expect(
        send(jToken, "_setJoetroller", [badJoetroller._address])
      ).rejects.toRevert("revert marker method returned false");
      expect(await call(jToken, "joetroller")).toEqual(oldJoetroller._address);
    });

    it("updates joetroller and emits log on success", async () => {
      const result = await send(jToken, "_setJoetroller", [
        newJoetroller._address,
      ]);
      expect(result).toSucceed();
      expect(result).toHaveLog("NewJoetroller", {
        oldJoetroller: oldJoetroller._address,
        newJoetroller: newJoetroller._address,
      });
      expect(await call(jToken, "joetroller")).toEqual(newJoetroller._address);
    });
  });
});
