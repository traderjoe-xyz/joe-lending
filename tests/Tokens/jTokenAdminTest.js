const {
  address,
  avaxMantissa,
  avaxUnsigned,
  avaxGasCost,
} = require("../Utils/Avalanche");
const {
  makeJToken,
  makeJTokenAdmin,
  makeJoetroller,
  makeInterestRateModel,
  makeToken,
  setAvaxBalance,
  getBalances,
  adjustBalances,
} = require("../Utils/BankerJoe");

describe("JTokenAdmin", () => {
  let jTokenAdmin, jToken, root, accounts, admin, reserveManager;

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    admin = accounts[1];
    reserveManager = accounts[2];
    others = accounts[3];
    jTokenAdmin = await makeJTokenAdmin({ admin: admin });
  });

  describe("getJTokenAdmin", () => {
    it("it is normal admin", async () => {
      jToken = await makeJToken();
      expect(
        await call(jTokenAdmin, "getJTokenAdmin", [jToken._address])
      ).toEqual(root);
    });

    it("it is jToken admin contract", async () => {
      jToken = await makeJToken({ admin: jTokenAdmin._address });
      expect(
        await call(jTokenAdmin, "getJTokenAdmin", [jToken._address])
      ).toEqual(jTokenAdmin._address);
    });
  });

  describe("_setPendingAdmin()", () => {
    beforeEach(async () => {
      jToken = await makeJToken({ admin: jTokenAdmin._address });
    });

    it("should only be callable by admin", async () => {
      await expect(
        send(jTokenAdmin, "_setPendingAdmin", [jToken._address, others], {
          from: others,
        })
      ).rejects.toRevert("revert only the admin may call this function");

      // Check admin stays the same
      expect(await call(jToken, "admin")).toEqual(jTokenAdmin._address);
      expect(await call(jToken, "pendingAdmin")).toBeAddressZero();
    });

    it("should properly set pending admin", async () => {
      expect(
        await send(jTokenAdmin, "_setPendingAdmin", [jToken._address, others], {
          from: admin,
        })
      ).toSucceed();

      // Check admin stays the same
      expect(await call(jToken, "admin")).toEqual(jTokenAdmin._address);
      expect(await call(jToken, "pendingAdmin")).toEqual(others);
    });
  });

  describe("_acceptAdmin()", () => {
    beforeEach(async () => {
      jToken = await makeJToken();
      expect(
        await send(jToken, "_setPendingAdmin", [jTokenAdmin._address])
      ).toSucceed();
    });

    it("should only be callable by admin", async () => {
      await expect(
        send(jTokenAdmin, "_acceptAdmin", [jToken._address], { from: others })
      ).rejects.toRevert("revert only the admin may call this function");

      // Check admin stays the same
      expect(await call(jToken, "admin")).toEqual(root);
      expect(await call(jToken, "pendingAdmin")[others]).toEqual();
    });

    it("should succeed and set admin and clear pending admin", async () => {
      expect(
        await send(jTokenAdmin, "_acceptAdmin", [jToken._address], {
          from: admin,
        })
      ).toSucceed();

      expect(await call(jToken, "admin")).toEqual(jTokenAdmin._address);
      expect(await call(jToken, "pendingAdmin")).toBeAddressZero();
    });
  });

  describe("_setJoetroller()", () => {
    let oldJoetroller, newJoetroller;

    beforeEach(async () => {
      jToken = await makeJToken({ admin: jTokenAdmin._address });
      oldJoetroller = jToken.joetroller;
      newJoetroller = await makeJoetroller();
    });

    it("should only be callable by admin", async () => {
      await expect(
        send(
          jTokenAdmin,
          "_setJoetroller",
          [jToken._address, newJoetroller._address],
          { from: others }
        )
      ).rejects.toRevert("revert only the admin may call this function");

      expect(await call(jToken, "joetroller")).toEqual(oldJoetroller._address);
    });

    it("should succeed and set new joetroller", async () => {
      expect(
        await send(
          jTokenAdmin,
          "_setJoetroller",
          [jToken._address, newJoetroller._address],
          { from: admin }
        )
      ).toSucceed();

      expect(await call(jToken, "joetroller")).toEqual(newJoetroller._address);
    });
  });

  describe("_setReserveFactor()", () => {
    const factor = avaxMantissa(0.02);

    beforeEach(async () => {
      jToken = await makeJToken({ admin: jTokenAdmin._address });
    });

    it("should only be callable by admin", async () => {
      await expect(
        send(jTokenAdmin, "_setReserveFactor", [jToken._address, factor], {
          from: others,
        })
      ).rejects.toRevert("revert only the admin may call this function");

      expect(await call(jToken, "reserveFactorMantissa")).toEqualNumber(0);
    });

    it("should succeed and set new reserve factor", async () => {
      expect(
        await send(
          jTokenAdmin,
          "_setReserveFactor",
          [jToken._address, factor],
          { from: admin }
        )
      ).toSucceed();

      expect(await call(jToken, "reserveFactorMantissa")).toEqualNumber(factor);
    });
  });

  describe("_reduceReserves()", () => {
    const reserves = avaxUnsigned(3e12);
    const cash = avaxUnsigned(reserves.multipliedBy(2));
    const reduction = avaxUnsigned(2e12);

    beforeEach(async () => {
      jToken = await makeJToken({ admin: jTokenAdmin._address });
      await send(jToken.interestRateModel, "setFailBorrowRate", [false]);
      expect(
        await send(jToken, "harnessSetTotalReserves", [reserves])
      ).toSucceed();
      expect(
        await send(jToken.underlying, "harnessSetBalance", [
          jToken._address,
          cash,
        ])
      ).toSucceed();
    });

    it("should only be callable by admin", async () => {
      await expect(
        send(jTokenAdmin, "_reduceReserves", [jToken._address, reduction], {
          from: others,
        })
      ).rejects.toRevert("revert only the admin may call this function");

      expect(
        await call(jToken.underlying, "balanceOf", [jTokenAdmin._address])
      ).toEqualNumber(0);
    });

    it("should succeed and reduce reserves", async () => {
      expect(
        await send(
          jTokenAdmin,
          "_reduceReserves",
          [jToken._address, reduction],
          { from: admin }
        )
      ).toSucceed();

      expect(
        await call(jToken.underlying, "balanceOf", [jTokenAdmin._address])
      ).toEqualNumber(reduction);
    });
  });

  describe("_setInterestRateModel()", () => {
    let oldModel, newModel;

    beforeEach(async () => {
      jToken = await makeJToken({ admin: jTokenAdmin._address });
      oldModel = jToken.interestRateModel;
      newModel = await makeInterestRateModel();
    });

    it("should only be callable by admin", async () => {
      await expect(
        send(
          jTokenAdmin,
          "_setInterestRateModel",
          [jToken._address, newModel._address],
          { from: others }
        )
      ).rejects.toRevert("revert only the admin may call this function");

      expect(await call(jToken, "interestRateModel")).toEqual(
        oldModel._address
      );
    });

    it("should succeed and set new interest rate model", async () => {
      expect(
        await send(
          jTokenAdmin,
          "_setInterestRateModel",
          [jToken._address, newModel._address],
          { from: admin }
        )
      ).toSucceed();

      expect(await call(jToken, "interestRateModel")).toEqual(
        newModel._address
      );
    });
  });

  describe("_setCollateralCap()", () => {
    const cap = avaxMantissa(100);

    let jCollateralCapErc20;

    beforeEach(async () => {
      jCollateralCapErc20 = await makeJToken({
        kind: "jcollateralcap",
        admin: jTokenAdmin._address,
      });
      jToken = await makeJToken({ admin: jTokenAdmin._address });
    });

    it("should only be callable by admin", async () => {
      await expect(
        send(
          jTokenAdmin,
          "_setCollateralCap",
          [jCollateralCapErc20._address, cap],
          { from: others }
        )
      ).rejects.toRevert("revert only the admin may call this function");

      expect(await call(jCollateralCapErc20, "collateralCap")).toEqualNumber(0);
    });

    it("should fail for not JCollateralCapErc20 token", async () => {
      await expect(
        send(jTokenAdmin, "_setCollateralCap", [jToken._address, cap], {
          from: admin,
        })
      ).rejects.toRevert("revert");
    });

    it("should succeed and set new collateral cap", async () => {
      expect(
        await send(
          jTokenAdmin,
          "_setCollateralCap",
          [jCollateralCapErc20._address, cap],
          { from: admin }
        )
      ).toSucceed();

      expect(await call(jCollateralCapErc20, "collateralCap")).toEqualNumber(
        cap
      );
    });
  });

  describe("_setImplementation()", () => {
    let jCapableDelegate;

    beforeEach(async () => {
      jToken = await makeJToken({ admin: jTokenAdmin._address });
      jCapableDelegate = await deploy("JCapableErc20Delegate");
    });

    it("should only be callable by admin", async () => {
      await expect(
        send(
          jTokenAdmin,
          "_setImplementation",
          [jToken._address, jCapableDelegate._address, true, "0x0"],
          { from: others }
        )
      ).rejects.toRevert("revert only the admin may call this function");
    });

    it("should succeed and set new implementation", async () => {
      expect(
        await send(
          jTokenAdmin,
          "_setImplementation",
          [jToken._address, jCapableDelegate._address, true, "0x0"],
          { from: admin }
        )
      ).toSucceed();

      expect(await call(jToken, "implementation")).toEqual(
        jCapableDelegate._address
      );
    });
  });

  describe("extractReserves()", () => {
    const reserves = avaxUnsigned(3e12);
    const cash = avaxUnsigned(reserves.multipliedBy(2));
    const reduction = avaxUnsigned(2e12);

    beforeEach(async () => {
      jToken = await makeJToken({ admin: jTokenAdmin._address });
      await send(jToken.interestRateModel, "setFailBorrowRate", [false]);
      expect(
        await send(jToken, "harnessSetTotalReserves", [reserves])
      ).toSucceed();
      expect(
        await send(jToken.underlying, "harnessSetBalance", [
          jToken._address,
          cash,
        ])
      ).toSucceed();
      await send(jTokenAdmin, "setReserveManager", [reserveManager], {
        from: admin,
      });
    });

    it("should only be callable by reserve manager", async () => {
      await expect(
        send(jTokenAdmin, "extractReserves", [jToken._address, reduction])
      ).rejects.toRevert(
        "revert only the reserve manager may call this function"
      );

      expect(
        await call(jToken.underlying, "balanceOf", [reserveManager])
      ).toEqualNumber(0);
    });

    it("should succeed and extract reserves", async () => {
      expect(
        await send(
          jTokenAdmin,
          "extractReserves",
          [jToken._address, reduction],
          { from: reserveManager }
        )
      ).toSucceed();

      expect(
        await call(jToken.underlying, "balanceOf", [reserveManager])
      ).toEqualNumber(reduction);
    });
  });

  describe("seize()", () => {
    const amount = 1000;

    let erc20, nonStandardErc20;

    beforeEach(async () => {
      erc20 = await makeToken();
      nonStandardErc20 = await makeToken({ kind: "nonstandard" });
      await send(erc20, "transfer", [jTokenAdmin._address, amount]);
      await send(nonStandardErc20, "transfer", [jTokenAdmin._address, amount]);
    });

    it("should only be callable by admin", async () => {
      await expect(
        send(jTokenAdmin, "seize", [erc20._address], { from: others })
      ).rejects.toRevert("revert only the admin may call this function");

      expect(
        await call(erc20, "balanceOf", [jTokenAdmin._address])
      ).toEqualNumber(amount);
      expect(await call(erc20, "balanceOf", [admin])).toEqualNumber(0);
    });

    it("should succeed and seize tokens", async () => {
      expect(
        await send(jTokenAdmin, "seize", [erc20._address], { from: admin })
      ).toSucceed();

      expect(
        await call(erc20, "balanceOf", [jTokenAdmin._address])
      ).toEqualNumber(0);
      expect(await call(erc20, "balanceOf", [admin])).toEqualNumber(amount);
    });

    it("should succeed and seize non-standard tokens", async () => {
      expect(
        await send(jTokenAdmin, "seize", [nonStandardErc20._address], {
          from: admin,
        })
      ).toSucceed();

      expect(
        await call(nonStandardErc20, "balanceOf", [jTokenAdmin._address])
      ).toEqualNumber(0);
      expect(await call(nonStandardErc20, "balanceOf", [admin])).toEqualNumber(
        amount
      );
    });
  });

  describe("setAdmin()", () => {
    it("should only be callable by admin", async () => {
      await expect(
        send(jTokenAdmin, "setAdmin", [others], { from: others })
      ).rejects.toRevert("revert only the admin may call this function");

      expect(await call(jTokenAdmin, "admin")).toEqual(admin);
    });

    it("cannot set admin to zero address", async () => {
      await expect(
        send(jTokenAdmin, "setAdmin", [address(0)], { from: admin })
      ).rejects.toRevert("revert new admin cannot be zero address");

      expect(await call(jTokenAdmin, "admin")).toEqual(admin);
    });

    it("should succeed and set new admin", async () => {
      expect(
        await send(jTokenAdmin, "setAdmin", [others], { from: admin })
      ).toSucceed();

      expect(await call(jTokenAdmin, "admin")).toEqual(others);
    });
  });

  describe("setReserveManager()", () => {
    it("should only be callable by admin", async () => {
      await expect(
        send(jTokenAdmin, "setReserveManager", [reserveManager], {
          from: others,
        })
      ).rejects.toRevert("revert only the admin may call this function");

      expect(await call(jTokenAdmin, "reserveManager")).toEqual(address(0));
    });

    it("should succeed and set new reserve manager", async () => {
      expect(
        await send(jTokenAdmin, "setReserveManager", [reserveManager], {
          from: admin,
        })
      ).toSucceed();

      expect(await call(jTokenAdmin, "reserveManager")).toEqual(reserveManager);
    });
  });
});
