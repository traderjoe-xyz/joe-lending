pragma solidity ^0.5.16;

import "../../contracts/JAvax.sol";
import "./JoetrollerScenario.sol";

contract JAvaxHarness is JAvax {
    uint256 harnessExchangeRate;
    uint256 public blockTimestamp = 100000;

    mapping(address => bool) public failTransferToAddresses;

    constructor(
        JoetrollerInterface joetroller_,
        InterestRateModel interestRateModel_,
        uint256 initialExchangeRateMantissa,
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address payable admin_
    ) public JAvax(joetroller_, interestRateModel_, initialExchangeRateMantissa, name_, symbol_, decimals_, admin_) {}

    function doTransferOut(address payable to, uint256 amount) internal {
        require(failTransferToAddresses[to] == false, "TOKEN_TRANSFER_OUT_FAILED");
        return super.doTransferOut(to, amount);
    }

    function exchangeRateStoredInternal() internal view returns (uint256) {
        if (harnessExchangeRate != 0) {
            return harnessExchangeRate;
        }
        return super.exchangeRateStoredInternal();
    }

    function getBlockTimestamp() internal view returns (uint256) {
        return blockTimestamp;
    }

    function harnessSetBlockTimestamp(uint256 newBlockTimestamp) public {
        blockTimestamp = newBlockTimestamp;
    }

    function harnessFastForward(uint256 secs) public {
        blockTimestamp += secs;
    }

    function harnessSetBalance(address account, uint256 amount) external {
        accountTokens[account] = amount;
    }

    function harnessSetAccrualBlockTimestamp(uint256 _accrualBlockTimestamp) public {
        accrualBlockTimestamp = _accrualBlockTimestamp;
    }

    function harnessSetTotalSupply(uint256 totalSupply_) public {
        totalSupply = totalSupply_;
    }

    function harnessSetTotalBorrows(uint256 totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function harnessSetTotalReserves(uint256 totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function harnessExchangeRateDetails(
        uint256 _totalSupply,
        uint256 _totalBorrows,
        uint256 _totalReserves
    ) public {
        totalSupply = _totalSupply;
        totalBorrows = _totalBorrows;
        totalReserves = _totalReserves;
    }

    function harnessSetExchangeRate(uint256 exchangeRate) public {
        harnessExchangeRate = exchangeRate;
    }

    function harnessSetFailTransferToAddress(address _to, bool _fail) public {
        failTransferToAddresses[_to] = _fail;
    }

    function harnessMintFresh(address account, uint256 mintAmount) public returns (uint256) {
        (uint256 err, ) = super.mintFresh(account, mintAmount);
        return err;
    }

    function harnessRedeemFresh(
        address payable account,
        uint256 jTokenAmount,
        uint256 underlyingAmount
    ) public returns (uint256) {
        return super.redeemFresh(account, jTokenAmount, underlyingAmount);
    }

    function harnessAccountBorrows(address account) public view returns (uint256 principal, uint256 interestIndex) {
        BorrowSnapshot memory snapshot = accountBorrows[account];
        return (snapshot.principal, snapshot.interestIndex);
    }

    function harnessSetAccountBorrows(
        address account,
        uint256 principal,
        uint256 interestIndex
    ) public {
        accountBorrows[account] = BorrowSnapshot({principal: principal, interestIndex: interestIndex});
    }

    function harnessSetBorrowIndex(uint256 borrowIndex_) public {
        borrowIndex = borrowIndex_;
    }

    function harnessBorrowFresh(address payable account, uint256 borrowAmount) public returns (uint256) {
        return borrowFresh(account, borrowAmount);
    }

    function harnessRepayBorrowFresh(
        address payer,
        address account,
        uint256 repayBorrowAmount
    ) public payable returns (uint256) {
        (uint256 err, ) = repayBorrowFresh(payer, account, repayBorrowAmount);
        return err;
    }

    function harnessLiquidateBorrowFresh(
        address liquidator,
        address borrower,
        uint256 repayAmount,
        JToken jTokenCollateral
    ) public returns (uint256) {
        (uint256 err, ) = liquidateBorrowFresh(liquidator, borrower, repayAmount, jTokenCollateral);
        return err;
    }

    function harnessReduceReservesFresh(uint256 amount) public returns (uint256) {
        return _reduceReservesFresh(amount);
    }

    function harnessSetReserves(uint256 amount) public {
        totalReserves = amount;
    }

    function harnessSetReserveFactorFresh(uint256 newReserveFactorMantissa) public returns (uint256) {
        return _setReserveFactorFresh(newReserveFactorMantissa);
    }

    function harnessSetInterestRateModelFresh(InterestRateModel newInterestRateModel) public returns (uint256) {
        return _setInterestRateModelFresh(newInterestRateModel);
    }

    function harnessSetInterestRateModel(address newInterestRateModelAddress) public {
        interestRateModel = InterestRateModel(newInterestRateModelAddress);
    }

    function harnessGetCashPrior() public payable returns (uint256) {
        return getCashPrior();
    }

    function harnessDoTransferIn(address from, uint256 amount) public payable returns (uint256) {
        return doTransferIn(from, amount);
    }

    function harnessDoTransferOut(address payable to, uint256 amount) public payable {
        return doTransferOut(to, amount);
    }

    function harnessRequireNoError(uint256 error, string calldata message) external pure {
        requireNoError(error, message);
    }
}

contract JAvaxScenario is JAvax {
    uint256 reserveFactor;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address payable admin_,
        JoetrollerInterface joetroller_,
        InterestRateModel interestRateModel_,
        uint256 initialExchangeRateMantissa
    ) public JAvax(joetroller_, interestRateModel_, initialExchangeRateMantissa, name_, symbol_, decimals_, admin_) {}

    function setTotalBorrows(uint256 totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function setTotalReserves(uint256 totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function donate() public payable {
        // no-op
    }

    function getBlockTimestamp() internal view returns (uint256) {
        JoetrollerScenario joetrollerScenario = JoetrollerScenario(address(joetroller));
        return joetrollerScenario.blockTimestamp();
    }
}
