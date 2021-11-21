const {
  makeInterestRateModel,
  getBorrowRate,
  getSupplyRate,
} = require("../Utils/BankerJoe");
const { UInt256Max } = require("../Utils/Avalanche");

function utilizationRate(cash, borrows, reserves) {
  return borrows ? borrows / (cash + borrows - reserves) : 0;
}

function whitePaperRateFn(base, slope, kink = 0.9, jump = 5) {
  return (cash, borrows, reserves) => {
    const ur = utilizationRate(cash, borrows, reserves);

    if (ur <= kink) {
      return (ur * slope + base) / secondsPerYear;
    } else {
      const excessUtil = ur - kink;
      const jumpMultiplier = jump * slope;
      return (excessUtil * jump + kink * slope + base) / secondsPerYear;
    }
  };
}

function supplyRateFn(
  base,
  slope,
  jump,
  kink,
  cash,
  borrows,
  reserves,
  reserveFactor = 0.1
) {
  const ur = utilizationRate(cash, borrows, reserves);
  const borrowRate = whitePaperRateFn(
    base,
    slope,
    jump,
    kink
  )(cash, borrows, reserves);

  return borrowRate * (1 - reserveFactor) * ur;
}

function makeUtilization(util) {
  if (util == 0e18) {
    return {
      borrows: 0,
      reserves: 0,
      cash: 0,
    };
  } else {
    // borrows / (cash + borrows - reserves) = util
    // let borrows = 1
    // let reserves = 1
    // 1 / ( cash + 1 - 1 ) = util
    // util = 1 / cash
    // cash = 1 / util
    borrows = 1e18;
    reserves = 1e18;
    cash = 1e36 / util;

    return {
      borrows,
      cash,
      reserves,
    };
  }
}

const secondsPerYear = 31536000;

describe("InterestRateModel", () => {
  let root, accounts;
  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
  });

  const expectedRates = {
    "jump-rate": { base: 0.1, slope: 0.45, kink: 0.8, model: "jump-rate" },
    "triple-slope": {
      base: 0.1,
      slope: 0.45,
      kink1: 0.8,
      kink2: 0.9,
      model: "triple-slope",
    },
  };

  Object.entries(expectedRates).forEach(async ([kind, info]) => {
    let model;
    beforeAll(async () => {
      model = await makeInterestRateModel({
        kind: info.model,
        baseRate: info.base,
        multiplier: info.slope,
      });
    });

    describe(kind, () => {
      it("isInterestRateModel", async () => {
        expect(await call(model, "isInterestRateModel")).toEqual(true);
      });

      it(`calculates correct borrow value`, async () => {
        const rateInputs = [
          [500, 100],
          [3e18, 5e18],
          [5e18, 3e18],
          [500, 3e18],
          [0, 500],
          [500, 0],
          [0, 0],
          [3e18, 500],
          ["1000.00000000e18", "310.00000000e18"],
          ["690.00000000e18", "310.00000000e18"],
        ].map((vs) => vs.map(Number));

        // XXS Add back for ${cash}, ${borrows}, ${reserves}
        await Promise.all(
          rateInputs.map(async ([cash, borrows, reserves = 0]) => {
            const rateFn = whitePaperRateFn(info.base, info.slope);
            const expected = rateFn(cash, borrows, reserves);
            expect(
              (await getBorrowRate(model, cash, borrows, reserves)) / 1e18
            ).toBeWithinDelta(expected, 1e7);
          })
        );
      });

      if (kind == "jump-rate") {
        // Only need to do these for the WhitePaper

        it("handles overflowed cash + borrows", async () => {
          await expect(
            getBorrowRate(model, UInt256Max(), UInt256Max(), 0)
          ).rejects.toRevert("revert SafeMath: addition overflow");
        });

        it("handles failing to get exp of borrows / cash + borrows", async () => {
          await expect(
            getBorrowRate(model, 0, UInt256Max(), 0)
          ).rejects.toRevert("revert SafeMath: multiplication overflow");
        });

        it("handles overflow utilization rate times slope", async () => {
          await expect(
            makeInterestRateModel({
              kind,
              baseRate: 0,
              multiplier: -1,
              jump: -1,
              roof: 1,
            })
          ).rejects.toRevert("revert SafeMath: multiplication overflow");
        });

        it("handles overflow utilization rate times slope + base", async () => {
          await expect(
            makeInterestRateModel({
              kind,
              baseRate: -1,
              multiplier: 1e48,
              jump: 1e48,
              roof: 1,
            })
          ).rejects.toRevert("revert SafeMath: multiplication overflow");
        });

        it("handles invalid roof", async () => {
          await expect(
            makeInterestRateModel({
              kind,
              baseRate: 0,
              multiplier: 0,
              kink: 0.7,
              roof: 0.9,
            })
          ).rejects.toRevert("revert invalid roof value");
        });
      }

      if (kind == "triple-slope") {
        it("handles overflowed cash + borrows", async () => {
          await expect(
            getBorrowRate(model, UInt256Max(), UInt256Max(), 0)
          ).rejects.toRevert("revert SafeMath: addition overflow");
        });

        it("handles failing to get exp of borrows / cash + borrows", async () => {
          await expect(
            getBorrowRate(model, 0, UInt256Max(), 0)
          ).rejects.toRevert("revert SafeMath: multiplication overflow");
        });

        it("handles kink2 > kink1", async () => {
          await expect(
            makeInterestRateModel({
              kind,
              baseRate: 0,
              multiplier: 0,
              kink1: 0.8,
              kink2: 0.7,
              roof: 1,
            })
          ).rejects.toRevert("revert kink1 must less than or equal to kink2");
        });

        it("handles invalid roof", async () => {
          await expect(
            makeInterestRateModel({
              kind,
              baseRate: 0,
              multiplier: 0,
              kink1: 0.7,
              kink2: 0.8,
              roof: 0.9,
            })
          ).rejects.toRevert("revert invalid roof value");
        });
      }
    });

    if (kind == "jump-rate") {
      describe("jump rate tests", () => {
        describe("chosen points", () => {
          const tests = [
            {
              jump: 100,
              kink: 90,
              roof: 100,
              base: 10,
              slope: 18,
              points: [
                [0, 10],
                [10, 12],
                [89, 27.8],
                [90, 28],
                [91, 29],
                [100, 38],
                [120, 38],
              ],
            },
            {
              jump: 20,
              kink: 90,
              roof: 100,
              base: 10,
              slope: 18,
              points: [
                [0, 10],
                [10, 12],
                [100, 30],
                [120, 30],
              ],
            },
            {
              jump: 0,
              kink: 90,
              roof: 100,
              base: 10,
              slope: 18,
              points: [
                [0, 10],
                [10, 12],
                [100, 28],
                [120, 28],
              ],
            },
            {
              jump: 0,
              kink: 110,
              roof: 120,
              base: 10,
              slope: 22,
              points: [
                [0, 10],
                [10, 12],
                [100, 30],
                [120, 32],
              ],
            },
          ].forEach(({ jump, kink, roof, base, slope, points }) => {
            describe(`for jump=${jump}, kink=${kink}, base=${base}, slope=${slope}, roof=${roof}`, () => {
              let jumpModel;

              beforeAll(async () => {
                jumpModel = await makeInterestRateModel({
                  kind: "jump-rate",
                  baseRate: base / 100,
                  multiplier: slope / 100,
                  jump: jump / 100,
                  kink: kink / 100,
                  roof: roof / 100,
                });
              });

              points.forEach(([util, expected]) => {
                it(`and util=${util}%`, async () => {
                  const { borrows, cash, reserves } = makeUtilization(
                    util * 1e16
                  );
                  const borrowRateResult = await getBorrowRate(
                    jumpModel,
                    cash,
                    borrows,
                    reserves
                  );
                  const actual =
                    (Number(borrowRateResult) / 1e16) * secondsPerYear;

                  expect(actual).toBeWithinDelta(expected, 1e-2);
                });
              });
            });
          });
        });
      });
    }

    if (kind == "triple-slope") {
      describe("triple slope tests", () => {
        describe("chosen points", () => {
          [
            // Major
            {
              jump: 200,
              kink1: 80,
              kink2: 90,
              roof: 100,
              base: 0,
              slope: 14,
              points: [
                [50, 8.75],
                [79, 13.83],
                [80, 14],
                [84, 14],
                [91, 16],
                [100, 34],
                [120, 34],
              ],
            },
            // Stable
            {
              jump: 800,
              kink1: 80,
              kink2: 90,
              roof: 100,
              base: 0,
              slope: 18.4,
              points: [
                [20, 4.6],
                [79, 18.17],
                [80, 18.4],
                [87, 18.4],
                [91, 26.4],
                [100, 98.4],
                [120, 98.4],
              ],
            },
          ].forEach(({ jump, kink1, kink2, roof, base, slope, points }) => {
            describe(`for jump=${jump}, kink1=${kink1}, kink2=${kink2}, base=${base}, slope=${slope}, roof=${roof}`, () => {
              let tripleRateModel;

              beforeAll(async () => {
                tripleRateModel = await makeInterestRateModel({
                  kind: "triple-slope",
                  baseRate: base / 100,
                  multiplier: slope / 100,
                  jump: jump / 100,
                  kink1: kink1 / 100,
                  kink2: kink2 / 100,
                  roof: roof / 100,
                });
              });

              points.forEach(([util, expected]) => {
                it(`and util=${util}%`, async () => {
                  const { borrows, cash, reserves } = makeUtilization(
                    util * 1e16
                  );
                  const borrowRateResult = await getBorrowRate(
                    tripleRateModel,
                    cash,
                    borrows,
                    reserves
                  );
                  const actual =
                    (Number(borrowRateResult) / 1e16) * secondsPerYear;

                  expect(actual).toBeWithinDelta(expected, 1e-2);
                });
              });
            });
          });
        });
      });
    }
  });
});
