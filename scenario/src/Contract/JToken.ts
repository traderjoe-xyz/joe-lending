import { Contract } from "../Contract";
import { Callable, Sendable } from "../Invokation";
import { encodedNumber } from "../Encoding";

export interface JTokenMethods {
  _resignImplementation(): Sendable<void>;
  balanceOfUnderlying(address: string): Callable<number>;
  borrowBalanceCurrent(address: string): Callable<string>;
  borrowBalanceStored(address: string): Callable<string>;
  totalBorrows(): Callable<string>;
  totalBorrowsCurrent(): Callable<number>;
  totalReserves(): Callable<string>;
  reserveFactorMantissa(): Callable<string>;
  joetroller(): Callable<string>;
  exchangeRateStored(): Sendable<number>;
  exchangeRateCurrent(): Callable<number>;
  getCash(): Callable<number>;
  accrueInterest(): Sendable<number>;
  mint(): Sendable<number>;
  mint(amount: encodedNumber): Sendable<number>;
  mintNative(): Sendable<number>;
  redeem(amount: encodedNumber): Sendable<number>;
  redeemNative(amount: encodedNumber): Sendable<number>;
  redeemUnderlying(amount: encodedNumber): Sendable<number>;
  redeemUnderlyingNative(amount: encodedNumber): Sendable<number>;
  borrow(amount: encodedNumber): Sendable<number>;
  borrowNative(amount: encodedNumber): Sendable<number>;
  repayBorrow(): Sendable<number>;
  repayBorrow(amount: encodedNumber): Sendable<number>;
  repayBorrowNative(): Sendable<number>;
  liquidateBorrow(borrower: string, cTokenCollateral: string): Sendable<number>;
  liquidateBorrow(
    borrower: string,
    repayAmount: encodedNumber,
    cTokenCollateral: string
  ): Sendable<number>;
  seize(
    liquidator: string,
    borrower: string,
    seizeTokens: encodedNumber
  ): Sendable<number>;
  evilSeize(
    treasure: string,
    liquidator: string,
    borrower: string,
    seizeTokens: encodedNumber
  ): Sendable<number>;
  _addReserves(amount: encodedNumber): Sendable<number>;
  _reduceReserves(amount: encodedNumber): Sendable<number>;
  _setReserveFactor(reserveFactor: encodedNumber): Sendable<number>;
  _setInterestRateModel(address: string): Sendable<number>;
  _setJoetroller(address: string): Sendable<number>;
  underlying(): Callable<string>;
  interestRateModel(): Callable<string>;
  borrowRatePerSecond(): Callable<number>;
  donate(): Sendable<void>;
  admin(): Callable<string>;
  pendingAdmin(): Callable<string>;
  _setPendingAdmin(address: string): Sendable<number>;
  _acceptAdmin(): Sendable<number>;
  gulp(): Sendable<void>;
  _setCollateralCap(amount: encodedNumber): Sendable<void>;
  accountCollateralTokens(account: string): Callable<number>;
  totalCollateralTokens(): Callable<number>;
}

export interface JTokenScenarioMethods extends JTokenMethods {
  setTotalBorrows(amount: encodedNumber): Sendable<void>;
  setTotalReserves(amount: encodedNumber): Sendable<void>;
}

export interface JToken extends Contract {
  methods: JTokenMethods;
  name: string;
}

export interface JTokenScenario extends Contract {
  methods: JTokenScenarioMethods;
  name: string;
}
