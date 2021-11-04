const { address } = require("../Utils/BankerJoe");

describe("admin / _setPendingAdmin / _acceptAdmin", () => {
  let root, accounts;
  let joetroller;
  const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    joetroller = await deploy("Unitroller");
  });

  describe("admin()", () => {
    it("should return correct admin", async () => {
      expect(await call(joetroller, "admin")).toEqual(root);
    });
  });

  describe("pendingAdmin()", () => {
    it("should return correct pending admin", async () => {
      expect(await call(joetroller, "pendingAdmin")).toBeAddressZero();
    });
  });

  describe("_setPendingAdmin()", () => {
    it("should only be callable by admin", async () => {
      expect(
        await send(joetroller, "_setPendingAdmin", [accounts[0]], {
          from: accounts[0],
        })
      ).toHaveTrollFailure("UNAUTHORIZED", "SET_PENDING_ADMIN_OWNER_CHECK");

      // Check admin stays the same
      expect(await call(joetroller, "admin")).toEqual(root);
      expect(await call(joetroller, "pendingAdmin")).toBeAddressZero();
    });

    it("should properly set pending admin", async () => {
      expect(
        await send(joetroller, "_setPendingAdmin", [accounts[0]])
      ).toSucceed();

      // Check admin stays the same
      expect(await call(joetroller, "admin")).toEqual(root);
      expect(await call(joetroller, "pendingAdmin")).toEqual(accounts[0]);
    });

    it("should properly set pending admin twice", async () => {
      expect(
        await send(joetroller, "_setPendingAdmin", [accounts[0]])
      ).toSucceed();
      expect(
        await send(joetroller, "_setPendingAdmin", [accounts[1]])
      ).toSucceed();

      // Check admin stays the same
      expect(await call(joetroller, "admin")).toEqual(root);
      expect(await call(joetroller, "pendingAdmin")).toEqual(accounts[1]);
    });

    it("should emit event", async () => {
      const result = await send(joetroller, "_setPendingAdmin", [accounts[0]]);
      expect(result).toHaveLog("NewPendingAdmin", {
        oldPendingAdmin: ADDRESS_ZERO,
        newPendingAdmin: accounts[0],
      });
    });
  });

  describe("_acceptAdmin()", () => {
    it("should fail when pending admin is zero", async () => {
      expect(await send(joetroller, "_acceptAdmin")).toHaveTrollFailure(
        "UNAUTHORIZED",
        "ACCEPT_ADMIN_PENDING_ADMIN_CHECK"
      );

      // Check admin stays the same
      expect(await call(joetroller, "admin")).toEqual(root);
      expect(await call(joetroller, "pendingAdmin")).toBeAddressZero();
    });

    it("should fail when called by another account (e.g. root)", async () => {
      expect(
        await send(joetroller, "_setPendingAdmin", [accounts[0]])
      ).toSucceed();
      expect(await send(joetroller, "_acceptAdmin")).toHaveTrollFailure(
        "UNAUTHORIZED",
        "ACCEPT_ADMIN_PENDING_ADMIN_CHECK"
      );

      // Check admin stays the same
      expect(await call(joetroller, "admin")).toEqual(root);
      expect(await call(joetroller, "pendingAdmin")).toEqual(accounts[0]);
    });

    it("should succeed and set admin and clear pending admin", async () => {
      expect(
        await send(joetroller, "_setPendingAdmin", [accounts[0]])
      ).toSucceed();
      expect(
        await send(joetroller, "_acceptAdmin", [], { from: accounts[0] })
      ).toSucceed();

      // Check admin stays the same
      expect(await call(joetroller, "admin")).toEqual(accounts[0]);
      expect(await call(joetroller, "pendingAdmin")).toBeAddressZero();
    });

    it("should emit log on success", async () => {
      expect(
        await send(joetroller, "_setPendingAdmin", [accounts[0]])
      ).toSucceed();
      const result = await send(joetroller, "_acceptAdmin", [], {
        from: accounts[0],
      });
      expect(result).toHaveLog("NewAdmin", {
        oldAdmin: root,
        newAdmin: accounts[0],
      });
      expect(result).toHaveLog("NewPendingAdmin", {
        oldPendingAdmin: accounts[0],
        newPendingAdmin: ADDRESS_ZERO,
      });
    });
  });
});
